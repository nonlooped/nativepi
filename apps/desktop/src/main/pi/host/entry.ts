import { PassThrough } from "node:stream";
import { AgentSession, estimateTokens, formatSkillsForPrompt, main, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Skill } from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { isTuiFrameType, type TuiClientFrame, type TuiHostFrame } from "../../../shared/tui-frames.ts";
import { toNotice, toPromptRequest } from "../../../shared/providerAuth.ts";
import { shapeProviders } from "../../../shared/providerShape.ts";
import type { ContextInspector } from "../../../shared/pi-types.ts";
import { hostInternals, withTerminalUi, type HostInternals } from "./uiContext.ts";

/**
 * How NativePi starts Pi.
 *
 * This is Pi's own `rpc-entry` with two things done first, and it exists because
 * `runRpcMode` builds its extension UI context internally and takes no options.
 * Rather than reimplement RPC mode — six hundred lines of commands, session
 * replacement and trust that Pi maintains — the one line that matters is
 * intercepted: `bindExtensions` is where every mode installs its context, so
 * wrapping it layers the terminal half over Pi's without touching the rest.
 *
 * Everything else about RPC mode is unchanged, including session replacement,
 * which rebinds and therefore re-wraps on its own.
 */

/**
 * stdout, before Pi takes it away.
 *
 * `runRpcMode` calls `takeOverStdout()`, which redirects `process.stdout.write`
 * to stderr so a stray `console.log` inside an extension cannot corrupt the
 * protocol. Frames have to go to the real stdout, so the real write is captured
 * at module load — the same thing Pi's own output guard does, in the same order.
 */
const write = process.stdout.write.bind(process.stdout);

/** Serialised, because two overlapping writes on a pipe interleave into garbage. */
let tail: Promise<void> = Promise.resolve();

function send(frame: TuiHostFrame): void {
  const line = `${JSON.stringify(frame)}\n`;
  tail = tail.then(
    () =>
      new Promise<void>((resolve) => {
        // A full pipe reports EAGAIN on Windows rather than buffering; the retry
        // is what Pi's own raw stdout writer does, for the same reason.
        const attempt = () => {
          try {
            write(line, (error) => (error ? setTimeout(attempt, 10) : resolve()));
          } catch {
            setTimeout(attempt, 10);
          }
        };
        attempt();
      }),
  );
}

/**
 * The live extension UI context, and the composer state it answers with.
 *
 * Pi rebinds extensions whenever the session is replaced, so the context is not
 * stable for the life of the process. The composer text the window last reported
 * is replayed into the new one, because `getEditorText()` is synchronous and must
 * not start answering with an empty string just because the user switched chats.
 */
let internals: HostInternals | undefined;
let lastEditorFrame: TuiClientFrame | undefined;

/**
 * The session currently bound to `internals`, tracked alongside it.
 *
 * `bindExtensions` is the only hook every mode calls into, so it is also where
 * this is captured — the only place that has `this: AgentSession` in hand,
 * whose `modelRuntime` is the only runtime that has run extension `activate()`.
 */
let currentSession: AgentSession | undefined;
let runtimePromise: Promise<ModelRuntime> | undefined;
let authPromptSeq = 1;
const pendingAuthPrompts = new Map<string, (result: { value?: string; cancel?: boolean }) => void>();

function providerRuntime(): Promise<ModelRuntime> {
  if (currentSession) return Promise.resolve(currentSession.modelRuntime);
  if (!runtimePromise) runtimePromise = ModelRuntime.create({ allowModelNetwork: true });
  return runtimePromise;
}

function handleClientFrame(frame: TuiClientFrame): void {
  if (frame.type === "nativepi_tui_editor") lastEditorFrame = frame;
  if (frame.type === "nativepi_tui_auth_respond") {
    pendingAuthPrompts.get(frame.id)?.(frame);
    return;
  }
  if (frame.type === "nativepi_tui_get_providers") {
    void respondProviders(frame.requestId);
    return;
  }
  if (frame.type === "nativepi_tui_get_context_inspector") {
    void respondContextInspector(frame.requestId);
    return;
  }
  if (frame.type === "nativepi_tui_login") {
    void respondLogin(frame.requestId, frame.providerId, frame.authType);
    return;
  }
  if (frame.type === "nativepi_tui_logout") {
    void respondLogout(frame.requestId, frame.providerId);
    return;
  }
  internals?.handle(frame);
}

function textTokens(text: string): number {
  return estimateTokens({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
}

async function respondContextInspector(requestId: string): Promise<void> {
  try {
    if (!currentSession) throw new Error("No active Pi session");
    const session = currentSession;
    // These are the prompt inputs Pi assembled for this session. They remain
    // private in Pi's API, so read them defensively and keep the inspector
    // unavailable rather than presenting a made-up breakdown after an upgrade.
    const options = (session as unknown as {
      _baseSystemPromptOptions?: {
        contextFiles?: { path: string; content: string }[];
        skills?: Skill[];
      };
    })._baseSystemPromptOptions;
    if (!options) throw new Error("Pi has not prepared this session's prompt yet");

    const contextFiles = options.contextFiles ?? [];
    const skills = options.skills ?? [];
    const contextFileTokens = contextFiles.map((file) => ({ path: file.path, tokens: textTokens(file.content) }));
    const skillsPrompt = formatSkillsForPrompt(skills);
    const skillTokens = skills.map((skill) => ({
      name: skill.name,
      tokens: textTokens(formatSkillsForPrompt([skill])),
    }));
    const activeNames = new Set(session.getActiveToolNames());
    const tools = session.getAllTools()
      .filter((tool) => activeNames.has(tool.name))
      .map((tool) => ({ name: tool.name, tokens: textTokens(JSON.stringify(tool.parameters)) }));
    const contextTokens = contextFileTokens.reduce((sum, file) => sum + file.tokens, 0);
    const skillTotal = textTokens(skillsPrompt);
    const systemTokens = Math.max(0, textTokens(session.systemPrompt) - contextTokens - skillTotal);
    const historyTokens = session.messages.reduce((sum, message) => sum + estimateTokens(message), 0);
    // Pi does not export this helper, but it is the same internal module its
    // session uses to decide the boundary. Resolving it beside the published
    // entry mirrors the existing host integrations above without duplicating
    // compaction logic in NativePi.
    const index = import.meta.resolve("@earendil-works/pi-coding-agent");
    const compactionModule = (await import(new URL("./core/compaction/index.js", index).href)) as {
      prepareCompaction?: (
        entries: unknown[],
        settings: { enabled: boolean; reserveTokens: number; keepRecentTokens: number },
      ) => {
        messagesToSummarize: Parameters<typeof estimateTokens>[0][];
        turnPrefixMessages: Parameters<typeof estimateTokens>[0][];
        settings: { keepRecentTokens: number };
      } | undefined;
    };
    if (!compactionModule.prepareCompaction) throw new Error("This Pi version cannot inspect the next compaction");
    const plan = compactionModule.prepareCompaction(session.sessionManager.getBranch(), session.settingsManager.getCompactionSettings());
    const compacted = plan ? [...plan.messagesToSummarize, ...plan.turnPrefixMessages] : [];
    const usage = session.getContextUsage();
    const inspector: ContextInspector = {
      usedTokens: usage?.tokens ?? null,
      contextWindow: usage?.contextWindow ?? session.model?.contextWindow ?? 0,
      categories: [
        { kind: "system", tokens: systemTokens },
        { kind: "context", tokens: contextTokens, count: contextFiles.length },
        { kind: "skills", tokens: skillTotal, count: skillTokens.length },
        { kind: "tools", tokens: tools.reduce((sum, tool) => sum + tool.tokens, 0), count: tools.length },
        { kind: "history", tokens: historyTokens, count: session.messages.length },
      ],
      contextFiles: contextFileTokens,
      skills: skillTokens,
      tools,
      compaction: plan ? {
        tokens: compacted.reduce((sum, message) => sum + estimateTokens(message), 0),
        messages: plan.messagesToSummarize.length,
        turnPrefixMessages: plan.turnPrefixMessages.length,
        keepRecentTokens: plan.settings.keepRecentTokens,
      } : undefined,
    };
    send({ type: "nativepi_tui_reply", requestId, data: inspector });
  } catch (err) {
    send({ type: "nativepi_tui_reply", requestId, error: err instanceof Error ? err.message : String(err) });
  }
}

async function respondProviders(requestId: string): Promise<void> {
  try {
    const providers = await shapeProviders(await providerRuntime());
    send({ type: "nativepi_tui_reply", requestId, data: providers });
  } catch (err) {
    send({ type: "nativepi_tui_reply", requestId, error: err instanceof Error ? err.message : String(err) });
  }
}

async function respondLogin(requestId: string, providerId: string, authType: "api_key" | "oauth"): Promise<void> {
  const promptIds = new Set<string>();
  try {
    if (!currentSession) throw new Error("No active Pi session");
    await currentSession.modelRuntime.login(providerId, authType, {
      prompt: (prompt) =>
        new Promise<string>((resolve, reject) => {
          const id = `auth-${authPromptSeq++}`;
          promptIds.add(id);
          pendingAuthPrompts.set(id, ({ value, cancel }) => {
            pendingAuthPrompts.delete(id);
            if (cancel || value === undefined) reject(new Error("Login cancelled"));
            else resolve(value);
          });
          send({ type: "nativepi_tui_auth_prompt", id, prompt: toPromptRequest(prompt) });
        }),
      notify: (event) => send({ type: "nativepi_tui_auth_notice", notice: toNotice(event) }),
    });
    send({ type: "nativepi_tui_reply", requestId, data: true });
  } catch (err) {
    send({ type: "nativepi_tui_reply", requestId, error: err instanceof Error ? err.message : String(err) });
  } finally {
    for (const id of promptIds) pendingAuthPrompts.delete(id);
  }
}

async function respondLogout(requestId: string, providerId: string): Promise<void> {
  try {
    if (!currentSession) throw new Error("No active Pi session");
    await currentSession.modelRuntime.logout(providerId);
    send({ type: "nativepi_tui_reply", requestId, data: true });
  } catch (err) {
    send({ type: "nativepi_tui_reply", requestId, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Pi's stdin, minus our frames.
 *
 * Pi's RPC mode reads `process.stdin` and answers anything it cannot parse with
 * an error response, so frames cannot simply share the stream. They share the
 * pipe instead: this reader takes the lines addressed to the host and passes the
 * rest through untouched, so Pi sees exactly the protocol it documents.
 */
function filterStdin(): void {
  const piStdin = new PassThrough();
  const source = process.stdin;
  let buffer = "";

  source.setEncoding("utf8");
  source.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      let parsed: unknown;
      try {
        parsed = JSON.parse(line.trim());
      } catch {
        parsed = undefined;
      }
      const type = (parsed as { type?: unknown } | undefined)?.type;
      if (isTuiFrameType(type)) handleClientFrame(parsed as TuiClientFrame);
      else piStdin.write(`${line}\n`);
    }
  });
  source.on("end", () => {
    if (buffer) piStdin.write(buffer);
    piStdin.end();
  });

  // Pi reads `process.stdin` when RPC mode starts, and pauses it while a command
  // runs, so the property has to be the filtered stream rather than a copy.
  Object.defineProperty(process, "stdin", { value: piStdin, configurable: true });
}

function installUiContext(): void {
  const bind = AgentSession.prototype.bindExtensions;
  AgentSession.prototype.bindExtensions = function patched(
    this: AgentSession,
    bindings: { uiContext?: ExtensionUIContext; mode?: string },
  ) {
    // A rebind replaces the context, so the panes the old one opened have to be
    // closed: their components belong to a session that no longer exists.
    internals?.dispose();
    internals = undefined;
    currentSession = this;
    if (bindings.uiContext) {
      const wrapped = withTerminalUi(bindings.uiContext, { send });
      internals = hostInternals(wrapped);
      if (lastEditorFrame) internals?.handle(lastEditorFrame);
      // "tui" is what extensions guard `custom()` and component factories behind,
      // and with the surfaces above that guard is now true.
      bindings = { ...bindings, uiContext: wrapped, mode: "tui" };
    }
    return bind.call(this, bindings as Parameters<typeof bind>[0]);
  } as typeof bind;
}

/**
 * The one startup step `rpc-entry` does that `main` does not.
 *
 * Pi's entry point configures undici's global dispatcher before any request can
 * be made; `main` configures it again later with the user's idle timeout. The
 * module is not published in Pi's `exports` map, so it is reached the same way as
 * the keybindings manager, and skipped if that ever stops working — the cost is
 * undici's defaults for the first few seconds, not a broken process.
 */
async function configureHttp(): Promise<void> {
  try {
    const index = import.meta.resolve("@earendil-works/pi-coding-agent");
    const module = (await import(new URL("./core/http-dispatcher.js", index).href)) as {
      configureHttpDispatcher?: () => void;
    };
    module.configureHttpDispatcher?.();
  } catch {
  }
}

process.title = "nativepi-pi-host";
process.env["PI_CODING_AGENT"] = "true";
process.emitWarning = () => {};
filterStdin();
installUiContext();
void configureHttp().then(() => main(["--mode", "rpc", ...process.argv.slice(2)]));
