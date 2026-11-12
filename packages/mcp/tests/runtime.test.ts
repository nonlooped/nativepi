import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionAPI, ExtensionContext, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ConnectedServer } from "../extensions/connections.ts";
import { createMcpRuntime } from "../extensions/runtime.ts";
import { saveMcpServer, removeMcpServer } from "../extensions/config.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nativepi-mcp-runtime-"));
  const agentDir = join(root, "agent");
  const project = join(root, "project");
  await mkdir(agentDir);
  await mkdir(join(project, ".pi"), { recursive: true });
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const tools = new Map<string, ToolDefinition>();
  const swaps: boolean[] = [];
  const closed: string[] = [];
  let idle = true;
  let active = ["read"];
  let acquireGate: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  let fail = false;
  let toolNames = ["echo"];
  let registrationFailure: string | undefined;
  let loadoutFailure = false;
  const context = {
    cwd: project, isProjectTrusted: () => true, isIdle: () => idle,
    ui: { notify: () => {}, setStatus: () => {}, theme: { fg: (_: string, text: string) => text } },
  } as unknown as ExtensionContext;
  const runtime = createMcpRuntime({
    getAllTools: () => [...tools.values()], getActiveTools: () => active,
    registerTool: (tool: ToolDefinition) => {
      // Like Pi, retain definitions after deactivation and activate newly direct
      // registrations synchronously. Failure can occur after the map changes.
      const previous = tools.get(tool.name);
      tools.set(tool.name, tool);
      if (tool.defaultActive !== false && (!previous || previous.defaultActive === false)) active = [...new Set([...active, tool.name])];
      if (tool.name === registrationFailure) {
        registrationFailure = undefined;
        throw new Error("fixture registration failed");
      }
    },
    setActiveTools: (names: string[]) => {
      swaps.push(idle); active = names;
      if (loadoutFailure) { loadoutFailure = false; throw new Error("fixture loadout failed"); }
    },
  } as unknown as ExtensionAPI, async (name, configured) => {
    const identity = `${name}:${configured.config.command}`;
    if (acquireGate) { acquireGate.entered.resolve(); await acquireGate.release.promise; }
    if (fail) throw new Error("fixture connection failed");
    let disposed = false;
    return {
      name, tools: toolNames.map(name => ({ name, inputSchema: { type: "object" } })),
      client: { callTool: async () => {
        if (disposed) throw new Error("disposed client");
        return { content: [{ type: "text", text: identity }] };
      } },
      close: async () => { disposed = true; closed.push(identity); },
    } as unknown as ConnectedServer;
  });
  const save = (name: string, command: string, originalName?: string) =>
    saveMcpServer(project, true, { scope: "project", name, originalName, config: { transport: "stdio", command, args: [] } }, agentDir);
  return {
    runtime, context, closed, swaps, tools, save,
    writeConfig: (value: string) => writeFile(join(project, ".pi", "mcp.json"), value),
    setIdle(value: boolean) { idle = value; },
    setFail(value: boolean) { fail = value; },
    setTools(value: string[]) { toolNames = value; },
    failRegistration(name: string) { registrationFailure = name; },
    failLoadout() { loadoutFailure = true; },
    active: () => [...active],
    remove: (name: string) => removeMcpServer(project, true, "project", name, agentDir),
    gate() { acquireGate = { entered: deferred(), release: deferred() }; return acquireGate; },
    async dispose() {
      await runtime.shutdown(context);
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("turn beginning during a saved config write keeps current tools and reports pending reload", async () => {
  const f = await fixture();
  try {
    await f.save("echo", "old");
    await f.runtime.start(f.context);
    const old = f.tools.get("mcp_echo_echo");
    const state = await f.runtime.change(async () => {
      await f.save("echo", "new", "echo");
      f.setIdle(false);
    });
    expect(f.swaps).toEqual([true]);
    expect(f.tools.get("mcp_echo_echo")).toBe(old);
    expect(f.closed).toEqual(["echo:new"]);
    expect(state.reloadRequired).toBe(true);
    expect(state.servers[0]).toMatchObject({ status: "pending", config: { command: "new" } });
    expect((await old!.execute("id", {}, undefined, undefined, f.context as ExtensionToolContext)).content).toEqual([{ type: "text", text: "echo:old" }]);
  } finally { await f.dispose(); }
});

test("turn beginning during connect discards candidates without closing the active set", async () => {
  const f = await fixture();
  try {
    await f.save("echo", "old"); await f.runtime.start(f.context);
    const gate = f.gate();
    const updating = f.runtime.change(() => f.save("echo", "new", "echo"));
    await gate.entered.promise;
    expect(f.closed).toEqual([]);
    f.setIdle(false); gate.release.resolve();
    expect((await updating).reloadRequired).toBe(true);
    expect(f.closed).toEqual(["echo:new"]);
    expect(f.swaps).toEqual([true]);
  } finally { await f.dispose(); }
});

test("shutdown during connect closes every candidate and active resource", async () => {
  const f = await fixture();
  try {
    await f.save("echo", "old"); await f.runtime.start(f.context);
    const gate = f.gate();
    const updating = f.runtime.change(() => f.save("echo", "new", "echo"));
    const rejected = updating.then(() => undefined, (error: unknown) => error);
    await gate.entered.promise;
    const shutdown = f.runtime.shutdown(f.context);
    gate.release.resolve();
    expect(await rejected).toMatchObject({ message: expect.stringContaining("session changed") });
    await shutdown;
    expect(f.closed.sort()).toEqual(["echo:new", "echo:old"]);
  } finally { await f.dispose(); }
});

test("failed replacement preserves both old server and unrelated live tools; external edits are not confirmed active", async () => {
  const f = await fixture();
  try {
    await f.save("echo", "old"); await f.save("other", "other"); await f.runtime.start(f.context);
    f.setFail(true);
    const state = await f.runtime.change(() => f.save("echo", "broken", "echo"));
    expect(f.closed).toEqual([]);
    expect(state.servers.find(s => s.name === "other")?.status).toBe("connected");
    expect(state.servers.find(s => s.name === "echo")).toMatchObject({ status: "error", error: "fixture connection failed" });
    await f.save("other", "externally-edited", "other");
    const snapshot = await f.runtime.state();
    expect(snapshot.servers.find(s => s.name === "other")?.status).toBe("pending");
    expect(snapshot.reloadRequired).toBe(true);
  } finally { await f.dispose(); }
});


test("malformed configuration during reconnect leaves unrelated live clients and registry intact", async () => {
  const f = await fixture();
  try {
    await f.save("echo", "old"); await f.runtime.start(f.context);
    const old = f.tools.get("mcp_echo_echo");
    const state = await f.runtime.change(() => f.writeConfig("invalid json"));
    expect(f.closed).toEqual([]);
    expect(f.swaps).toEqual([true]);
    expect(f.tools.get("mcp_echo_echo")).toBe(old);
    expect(state.reloadRequired).toBe(true);
    expect(state.diagnostics[0]).toContain("Invalid JSON");
  } finally { await f.dispose(); }
});

for (const failure of ["registration", "loadout"] as const) {
  test(`failed MCP ${failure} restores old live tools, deactivates candidates and supports retry`, async () => {
    const f = await fixture();
    try {
      f.setTools(["first", "second"]);
      await f.save("echo", "old"); await f.runtime.start(f.context);
      const active = f.active();
      const first = f.tools.get("mcp_echo_first")!;
      f.setTools(["new", "first", "second"]);
      if (failure === "registration") f.failRegistration("mcp_echo_second"); else f.failLoadout();
      await expect(f.runtime.change(() => f.save("echo", "new", "echo"))).rejects.toThrow(`fixture ${failure} failed`);
      expect(f.active()).toEqual(active);
      expect(f.closed).toEqual(["echo:new"]);
      for (const tool of [first, f.tools.get("mcp_echo_first")!]) {
        expect((await tool.execute("id", {}, undefined, undefined, f.context as ExtensionToolContext)).content).toEqual([{ type: "text", text: "echo:old" }]);
      }
      expect(() => f.tools.get("mcp_echo_new")!.execute("id", {}, undefined, undefined, f.context as ExtensionToolContext)).toThrow("no longer available");
      // The next connection is live even though the failed candidate was closed.
      f.closed.length = 0;
      await f.runtime.change(async () => {});
      expect(f.active().sort()).toEqual(["read", "mcp_echo_new", "mcp_echo_first", "mcp_echo_second"].sort());
      expect((await f.tools.get("mcp_echo_first")!.execute("id", {}, undefined, undefined, f.context as ExtensionToolContext)).content).toEqual([{ type: "text", text: "echo:new" }]);
      expect(f.closed).toEqual(["echo:old"]);
    } finally { await f.dispose(); }
  });
}

test("removed and failed MCP registrations retain their names without claiming foreign tools", async () => {
  const f = await fixture();
  try {
    f.tools.set("mcp_echo_echo", { name: "mcp_echo_echo" } as ToolDefinition);
    await f.save("echo", "old"); await f.runtime.start(f.context);
    const name = f.active().find(name => name.startsWith("mcp_echo_echo"))!;
    expect(name).not.toBe("mcp_echo_echo");
    const retired = f.tools.get(name)!;
    await f.runtime.change(() => f.remove("echo"));
    expect(f.active()).toEqual(["read"]);
    expect(() => retired.execute("id", {}, undefined, undefined, f.context as ExtensionToolContext)).toThrow("no longer available");
    f.failLoadout();
    await expect(f.runtime.change(() => f.save("echo", "new"))).rejects.toThrow("fixture loadout failed");
    f.closed.length = 0;
    await f.runtime.change(async () => {});
    expect(f.active()).toEqual(["read", name]);
    expect([...f.tools.keys()].sort()).toEqual(["mcp_echo_echo", name].sort());
    expect((await retired.execute("id", {}, undefined, undefined, f.context as ExtensionToolContext)).content).toEqual([{ type: "text", text: "echo:new" }]);
  } finally { await f.dispose(); }
});
