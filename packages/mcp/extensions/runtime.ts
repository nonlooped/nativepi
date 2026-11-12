import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { McpServerEntry, McpState } from "../types.ts";
import { editableConfig, loadMcpConfiguration, serverIdentity, type ConfiguredServer } from "./config.ts";
import { connectServer, serverTool, uniqueToolName, type ConnectedServer } from "./connections.ts";

type LiveServer = { configured: ConfiguredServer; connection: ConnectedServer };
const close = async (servers: Iterable<LiveServer>) => {
  await Promise.allSettled([...servers].map((server) => server.connection.close()));
};

export function createMcpRuntime(pi: ExtensionAPI, acquire = connectServer) {
  let generation = 0;
  let latest: ExtensionContext | undefined;
  let live = new Map<string, LiveServer>();
  let names = new Set<string>();
  const ownedNames = new Map<string, string>();
  const registrations = new Map<string, ToolDefinition>();
  let targets = new Map<string, ToolDefinition>();
  let failures = new Map<string, { identity: string; error: string }>();
  let connecting: AbortController | undefined;
  let operation = Promise.resolve();

  const serialize = <T>(work: () => Promise<T>) => {
    const next = operation.then(work, work);
    operation = next.then(() => undefined, () => undefined);
    return next;
  };
  const session = () => {
    if (!latest) throw new Error("No active Pi session.");
    return { context: latest, generation };
  };
  type Session = ReturnType<typeof session>;
  const current = (owner: Session) => latest === owner.context && generation === owner.generation;

  const state = async (owner: Session): Promise<McpState> => {
    const { context } = owner;
    const trusted = context.isProjectTrusted();
    const loaded = await loadMcpConfiguration(context.cwd, trusted);
    if (!current(owner)) throw new Error("The Pi session changed while MCP state was loading.");
    const entries: McpServerEntry[] = [];
    let reloadRequired = [...live.keys()].some((name) => !loaded.servers.has(name));
    for (const [scope, source] of [["user", loaded.user], ["project", loaded.project]] as const) {
      for (const [name, configured] of source.servers) {
        const overridden = scope === "user" && loaded.project.servers.has(name);
        const identity = serverIdentity(configured);
        const active = live.get(name);
        const matches = active && serverIdentity(active.configured) === identity;
        const failure = failures.get(name);
        const error = failure?.identity === identity ? failure.error : undefined;
        if (!overridden && !matches) reloadRequired = true;
        entries.push({
          name, scope, config: editableConfig(configured.config),
          status: overridden ? "overridden" : matches ? "connected" : error ? "error" : "pending",
          toolCount: !overridden && matches ? active.connection.tools.length : 0,
          ...(error ? { error } : {}),
        });
      }
    }
    return { projectTrusted: trusted, servers: entries, diagnostics: loaded.diagnostics, reloadRequired };
  };

  const activate = async (owner: Session, notify: boolean) => {
    if (!current(owner)) throw new Error("The Pi session changed before MCP servers could reconnect.");
    const { context } = owner;
    const trusted = context.isProjectTrusted();
    const controller = new AbortController();
    connecting = controller;
    const acquired: LiveServer[] = [];
    try {
      const loaded = await loadMcpConfiguration(context.cwd, trusted);
      controller.signal.throwIfAborted();
      const next = new Map<string, LiveServer>();
      const nextFailures = new Map<string, { identity: string; error: string }>();
      await Promise.all([...loaded.servers].map(async ([name, configured]) => {
        const existing = live.get(name);
        if (existing && serverIdentity(existing.configured) === serverIdentity(configured)) {
          next.set(name, existing);
          return;
        }
        try {
          const candidate = { configured, connection: await acquire(name, configured, controller.signal) };
          acquired.push(candidate);
          next.set(name, candidate);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          nextFailures.set(name, { identity: serverIdentity(configured), error: message });
          if (existing) next.set(name, existing);
        }
      }));
      if (!current(owner)) throw new Error("The Pi session changed while MCP servers were reconnecting.");
      // A Pi turn can start during any awaited config or connection operation.
      // Nothing asynchronous may separate this check from the registry swap.
      if (!context.isIdle() || context.isProjectTrusted() !== trusted || (loaded.diagnostics.length > 0 && live.size > 0)) {
        await close(acquired);
        acquired.length = 0;
        return state(owner);
      }
      const ordered = new Map([...loaded.servers.keys()].flatMap((name) => {
        const server = next.get(name);
        return server ? [[name, server] as const] : [];
      }));
      const used = new Set(pi.getAllTools().map((tool) => tool.name));
      for (const name of ownedNames.values()) used.add(name);
      const nextTargets = new Map<string, ToolDefinition>();
      for (const [serverName, server] of ordered) {
        for (const tool of server.connection.tools) {
          const identity = JSON.stringify([serverName, tool.name]);
          const name = ownedNames.get(identity) ?? uniqueToolName(serverName, tool.name, used);
          used.add(name);
          ownedNames.set(identity, name);
          nextTargets.set(name, serverTool(server.connection, tool, name));
        }
      }
      const previousActive = pi.getActiveTools();
      const active = new Set(previousActive);
      for (const name of names) if (!nextTargets.has(name)) active.delete(name);
      for (const name of nextTargets.keys()) active.add(name);
      const replaced = new Map<string, ToolDefinition | undefined>();
      try {
        for (const [name, definition] of nextTargets) {
          replaced.set(name, registrations.get(name));
          // Pi retains registrations and refreshes its registry synchronously. A
          // dispatcher only reaches committed clients, even if a swap fails.
          const dispatcher: ToolDefinition = {
            ...definition,
            defaultActive: false,
            execute(...args) {
              const target = targets.get(name);
              if (!target) throw new Error(`MCP tool ${name} is no longer available.`);
              return target.execute(...args);
            },
          };
          registrations.set(name, dispatcher);
          pi.registerTool(dispatcher);
        }
        pi.setActiveTools([...active]);
      } catch (error) {
        const rollbackErrors: unknown[] = [];
        for (const [name, previous] of replaced) {
          if (!previous) continue;
          registrations.set(name, previous);
          try { pi.registerTool(previous); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
        }
        try { pi.setActiveTools(previousActive); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
        if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "MCP registry replacement and rollback failed.");
        throw error;
      }
      targets = nextTargets;
      const retained = new Set(ordered.values());
      const retired = [...live.values()].filter((server) => !retained.has(server));
      live = ordered;
      names = new Set(nextTargets.keys());
      failures = nextFailures;
      acquired.length = 0;
      context.ui.setStatus("mcp", live.size ? context.ui.theme.fg("muted", `MCP ${live.size} server${live.size === 1 ? "" : "s"} · ${names.size} tool${names.size === 1 ? "" : "s"}`) : undefined);
      if (notify) {
        for (const diagnostic of loaded.diagnostics) context.ui.notify(diagnostic, "warning");
        for (const [name, failure] of failures) context.ui.notify(`MCP server ${name}: ${failure.error}`, "warning");
      }
      await close(retired);
      return state(owner);
    } catch (error) {
      await close(acquired);
      if (!current(owner)) throw new Error("The Pi session changed while MCP servers were reconnecting.");
      throw error;
    } finally {
      if (connecting === controller) connecting = undefined;
    }
  };

  return {
    state: () => state(session()),
    change: (persist: (context: ExtensionContext) => Promise<void>) => {
      const owner = session();
      return serialize(async () => {
        if (!current(owner)) throw new Error("The Pi session changed before MCP configuration could be saved.");
        if (!owner.context.isIdle()) throw new Error("Wait for the running turn to finish before changing MCP servers.");
        await persist(owner.context);
        return activate(owner, false);
      });
    },
    start: (context: ExtensionContext) => {
      connecting?.abort();
      latest = context;
      generation += 1;
      const owner = session();
      return serialize(() => activate(owner, true));
    },
    shutdown: async (context: ExtensionContext) => {
      latest = undefined;
      generation += 1;
      connecting?.abort();
      context.ui.setStatus("mcp", undefined);
      await serialize(async () => {
        targets.clear();
        await close(live.values());
        live.clear();
        const active = pi.getActiveTools().filter((name) => !names.has(name));
        pi.setActiveTools(active);
        names.clear();
        failures.clear();
      });
    },
  };
}
