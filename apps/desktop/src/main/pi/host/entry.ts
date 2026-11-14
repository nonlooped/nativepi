import { excludeRetiredPackages } from "./retiredPackages.ts";
import { readServiceTier, setServiceTier, SERVICE_TIER_ENTRY, installServiceTier } from "./serviceTier.ts";
import { observeChatTitle } from "./chatTitle.ts";
import { createFrameWriter } from "./frameWriter.ts";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { AgentSession, main, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { isTuiFrameType, tuiClientFrameSchema, type TuiClientFrame } from "../../../shared/tui-frames.ts";
import { jsonValueSchema, type JsonValue } from "../../../shared/json.ts";
import { toNotice, toPromptRequest } from "../../../shared/providerAuth.ts";
import { shapeProviders } from "../../../shared/providerShape.ts";
import type { ContextInspector } from "../../../shared/pi-types.ts";
import { hostInternals, withTerminalUi, type HostInternals } from "./uiContext.ts";
import { callExtensionMethod, installExtensionChannel, installExtensionMethodLifecycle } from "./extensionChannel.ts";
/**
* How NativePi starts Pi.
*
* This runs Pi's own RPC mode and adds its terminal UI bridge, plus the shipped
* app tools, naming, and provider service-tier controls. The bridge exists because
* `runRpcMode` builds its extension UI context internally and takes no options.
* Rather than reimplement RPC mode — six hundred lines of commands, session
* replacement and trust that Pi maintains — the one line that matters is
* intercepted: `bindExtensions` is where every mode installs its context, so
* wrapping it layers the terminal half over Pi's without touching the rest.
*
* Pi still owns RPC commands and the agent loop, including session replacement,
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
const frames = createFrameWriter(process.stdout.write.bind(process.stdout), error => console.error("NativePi side channel closed", error));
const send = frames.send;
process.stdout.on("error", frames.handleError);
process.stdout.once("close", () => frames.dispose());
process.once("exit", () => frames.dispose());
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
let stopTitleObserver: (() => void) | undefined;
let stopServiceTier: (() => void) | undefined;
let stopTierEvents: (() => void) | undefined;
let runtimePromise: Promise<ModelRuntime> | undefined;
let authPromptSeq = 1;
const pendingAuthPrompts = new Map<string, (result: {
  value?: string;
  cancel?: boolean;
}) => void>();
function providerRuntime(): Promise<ModelRuntime> {
  if (currentSession)
    return Promise.resolve(currentSession.modelRuntime);
  if (!runtimePromise)
    runtimePromise = ModelRuntime.create({ allowModelNetwork: true });
  return runtimePromise;
}
function handleClientFrame(frame: TuiClientFrame): void {
  if (frame.type === "nativepi_tui_get_service_tier" || frame.type === "nativepi_tui_set_service_tier") {
    try {
      if (!currentSession) throw new Error("No active Pi session");
      if (frame.type === "nativepi_tui_set_service_tier" && frame.sessionFile && currentSession.sessionFile !== frame.sessionFile)
        throw new Error("The selected chat changed. Choose a service tier again.");
      if (frame.type === "nativepi_tui_set_service_tier" && (currentSession.model?.provider !== frame.provider || currentSession.model?.id !== frame.modelId))
        throw new Error("The selected model changed. Choose a service tier again.");
      const data = frame.type === "nativepi_tui_set_service_tier"
        ? setServiceTier(currentSession, frame.tier) : readServiceTier(currentSession);
      send({ type: "nativepi_tui_reply", requestId: frame.requestId, data });
      if (frame.type === "nativepi_tui_set_service_tier") send({ type: "nativepi_tui_service_tier_changed" });
    } catch (error) {
      send({ type: "nativepi_tui_reply", requestId: frame.requestId, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (frame.type === "nativepi_tui_accept_title") {
    try {
      const session = currentSession;
      const accepted = Boolean(session && session.sessionFile === frame.sessionFile && !session.sessionManager.getSessionName());
      if (accepted) session!.setSessionName(frame.title);
      send({ type: "nativepi_tui_reply", requestId: frame.requestId, data: accepted });
    } catch (error) {
      send({ type: "nativepi_tui_reply", requestId: frame.requestId, error: String(error) });
    }
    return;
  }
  if (frame.type === "nativepi_tui_editor")
    lastEditorFrame = frame;
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
    void respondLogin(frame.requestId, frame.providerId, frame.authType, frame.flowId);
    return;
  }
  if (frame.type === "nativepi_tui_logout") {
    void respondLogout(frame.requestId, frame.providerId);
    return;
  }
  if (frame.type === "nativepi_tui_ext_call") {
    void respondExtensionCall(frame.requestId, frame.extension, frame.method, frame.params);
    return;
  }
  internals?.handle(frame);
}
async function respondContextInspector(requestId: string): Promise<void> {
  try {
    if (!currentSession)
      throw new Error("No active Pi session");
    const session = currentSession;
    const usage = session.getContextUsage();
    const inspector: ContextInspector = {
      usedTokens: usage?.tokens ?? null,
      contextWindow: usage?.contextWindow ?? session.model?.contextWindow ?? 0,
    };
    send({ type: "nativepi_tui_reply", requestId, data: jsonValueSchema.parse(inspector) });
  }
  catch (err) {
    send({ type: "nativepi_tui_reply", requestId, error: err instanceof Error ? err.message : String(err) });
  }
}
async function respondProviders(requestId: string): Promise<void> {
  try {
    const providers = await shapeProviders(await providerRuntime());
    send({ type: "nativepi_tui_reply", requestId, data: jsonValueSchema.parse(providers) });
  }
  catch (err) {
    send({ type: "nativepi_tui_reply", requestId, error: err instanceof Error ? err.message : String(err) });
  }
}
async function respondLogin(requestId: string, providerId: string, authType: "api_key" | "oauth", flowId?: string): Promise<void> {
  const promptIds = new Set<string>();
  try {
    if (!currentSession)
      throw new Error("No active Pi session");
    await currentSession.modelRuntime.login(providerId, authType, {
      prompt: (prompt) => new Promise<string>((resolve, reject) => {
        const id = `auth-${authPromptSeq++}`;
        promptIds.add(id);
        pendingAuthPrompts.set(id, ({ value, cancel }) => {
          pendingAuthPrompts.delete(id);
          if (cancel || value === undefined)
            reject(new Error("Login cancelled"));
          else
            resolve(value);
        });
        send({ type: "nativepi_tui_auth_prompt", flowId, id, prompt: toPromptRequest(prompt) });
      }),
      notify: (event) => send({ type: "nativepi_tui_auth_notice", flowId, notice: toNotice(event) }),
    });
    send({ type: "nativepi_tui_reply", requestId, data: true });
  }
  catch (err) {
    send({ type: "nativepi_tui_reply", requestId, error: err instanceof Error ? err.message : String(err) });
  }
  finally {
    for (const id of promptIds)
      pendingAuthPrompts.delete(id);
  }
}
async function respondLogout(requestId: string, providerId: string): Promise<void> {
  try {
    if (!currentSession)
      throw new Error("No active Pi session");
    await currentSession.modelRuntime.logout(providerId);
    send({ type: "nativepi_tui_reply", requestId, data: true });
  }
  catch (err) {
    send({ type: "nativepi_tui_reply", requestId, error: err instanceof Error ? err.message : String(err) });
  }
}
async function respondExtensionCall(requestId: string, extension: string, method: string, params: JsonValue | undefined): Promise<void> {
  try {
    send({ type: "nativepi_tui_reply", requestId, data: await callExtensionMethod(extension, method, params) });
  }
  catch (err) {
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
      }
      catch {
        parsed = undefined;
      }
      const type = (parsed as {
        type?: unknown;
      } | undefined)?.type;
      if (isTuiFrameType(type)) {
        const frame = tuiClientFrameSchema.safeParse(parsed);
        if (frame.success)
          handleClientFrame(frame.data);
      }
      else
        piStdin.write(`${line}\n`);
    }
  });
  source.once("close", () => frames.dispose());
  source.once("error", error => frames.dispose(error));
  source.on("end", () => {
    frames.dispose();
    if (buffer)
      piStdin.write(buffer);
    piStdin.end();
  });
  // Pi reads `process.stdin` when RPC mode starts, and pauses it while a command
  // runs, so the property has to be the filtered stream rather than a copy.
  Object.defineProperty(process, "stdin", { value: piStdin, configurable: true });
}
function installUiContext(): void {
  installExtensionMethodLifecycle(AgentSession.prototype);
  const dispose = AgentSession.prototype.dispose;
  AgentSession.prototype.dispose = function () {
    if (currentSession === this) {
      stopTitleObserver?.();
      stopTitleObserver = undefined;
      stopTierEvents?.();
      stopServiceTier?.();
      stopServiceTier = undefined;
      currentSession = undefined;
    }
    dispose.call(this);
  };
  const bind = AgentSession.prototype.bindExtensions;
  AgentSession.prototype.bindExtensions = function patched(this: AgentSession, bindings: {
    uiContext?: ExtensionUIContext;
    mode?: string;
  }) {
    // A rebind replaces the context, so the panes the old one opened have to be
    // closed: their components belong to a session that no longer exists.
    internals?.dispose();
    internals = undefined;
    if (currentSession !== this) {
      stopTierEvents?.();
      stopServiceTier?.();
      stopServiceTier = process.argv.includes("--no-session") ? undefined : installServiceTier(this);
      stopTierEvents = this.subscribe(event => {
        if (event.type === "entry_appended" && event.entry.type === "custom" && event.entry.customType === SERVICE_TIER_ENTRY)
          send({ type: "nativepi_tui_service_tier_changed" });
      });
      stopTitleObserver?.();
      stopTitleObserver = process.argv.includes("--no-session") ? undefined : observeChatTitle(this, (sessionFile, title) => {
        send({ type: "nativepi_tui_propose_title", sessionFile, title });
      });
    }
    currentSession = this;
    let installed: HostInternals | undefined;
    if (bindings.uiContext) {
      const wrapped = withTerminalUi(bindings.uiContext, { send });
      installed = hostInternals(wrapped);
      internals = installed;
      if (lastEditorFrame)
        internals?.handle(lastEditorFrame);
      // "tui" is what extensions guard `custom()` and component factories behind,
      // and with the surfaces above that guard is now true.
      const actions = (bindings as Parameters<typeof bind>[0]).commandContextActions;
      const reload = actions?.reload;
      bindings = {
        ...bindings,
        uiContext: wrapped,
        mode: "tui",
        ...(actions && reload ? {
          commandContextActions: {
            ...actions,
            reload: async () => {
              // Pi rejects reload during response/compaction. Preserve the live
              // UI and method registrations when that authoritative guard fires.
              if (this.isStreaming || this.isCompacting)
                return reload();
              installed?.reset();
              await reload();
              installed?.bindSession(this);
            },
          },
        } : {}),
      } as Parameters<typeof bind>[0];
    }
    return bind.call(this, bindings as Parameters<typeof bind>[0]).then(() => {
      // Renderers are registered before bind, while session_start may append the
      // first custom entry during bind. Attach only after both are complete.
      installed?.bindSession(this);
      if (this.sessionFile)
        send({ type: "nativepi_tui_session", sessionFile: this.sessionFile });
    });
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
  }
  catch {
  }
}
process.title = "nativepi-pi-host";
process.env["PI_CODING_AGENT"] = "true";
process.env["AI_AGENT"] = "pi";
process.env["NATIVEPI_HOST"] = "1";
process.emitWarning = () => { };
filterStdin();
excludeRetiredPackages();
installUiContext();
// Before `main`, because extensions call `connect()` during activation.
installExtensionChannel(send);
const appTools = fileURLToPath(new URL("./app-tools.js", import.meta.url));
void configureHttp().then(() => main(["--mode", "rpc", ...(process.argv.includes("--no-session") ? [] : ["-e", appTools]), ...process.argv.slice(2).filter(arg => arg !== "--nativepi-chat")])).finally(() => frames.dispose());
