import { computerController, computerFailure } from "../computerUse.ts";
import { computerRequestSchema, computerCancelSchema } from "../../shared/computer-use.ts";
import { orchestrationRequestSchema, orchestrationReplySchema, orchestrationCancelSchema, orchestrationOutcomeSchema, orchestrationSuppliedSchema, orchestrationRuntimeSchema, type ThreadReference } from "../../shared/orchestration.ts";
import { fork, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTuiFrameType, tuiHostFrameSchema, type TuiClientFrame, type TuiHostFrame } from "../../shared/tui-frames.ts";
import type { AuthProviderInfo } from "../../shared/rpc-schema.ts";
import type { ContextInspector } from "../../shared/pi-types.ts";
import { contextInspectorSchema } from "../../shared/tui-frames.ts";
import { jsonValueSchema, type JsonValue } from "../../shared/json.ts";
import { drainLines, type PiCommand, type PiMessage } from "./protocol.ts";
import { artifactProcessRequestSchema } from "../../shared/htmlArtifacts.ts";
/**
* Why this is hand-rolled rather than Pi's own `RpcClient`.
*
* Pi exports an `RpcClient` covering every command below, and it is the obvious
* thing to reach for. It cannot be used here: it spawns with a hardcoded
* `spawn("node", [cliPath])`, and its options expose `cliPath`, `args` and `env`
* but not the executable. A packaged Electron app has no system `node` to find,
* so NativePi uses Electron's `fork`, which sets `ELECTRON_RUN_AS_NODE` and
* selects its background helper executable on macOS — see the constructor.
*
* `RpcClient` also has no equivalent of `sendRaw`, which extension UI responses
* need in order to reply outside the request/response envelope — and neither it
* nor Pi's protocol knows about the pi-tui frames NativePi carries on the same
* pipe, which is the other half of what this class routes.
*/
/**
* NativePi's Pi entry point, resolved from the application root so main-process
* code splitting cannot change where the launcher looks for it.
*
* Pi's own `rpc-entry` is not used: it builds an extension UI context that drops
* every pi-tui component, and the context is not injectable. `pi-host` is that
* entry plus the context that renders them — see `pi/host/entry.ts`.
*/
function resolvePiEntry(): string {
  if (process.versions.electron) {
    // Requiring Electron under plain Node/Bun can download its binary.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require("electron") as {
      app?: {
        getAppPath: () => string;
      };
    };
    const getAppPath = electron.app?.getAppPath;
    if (getAppPath)
      return join(getAppPath.call(electron.app), "out", "main", "pi-host.js");
  }
  return fileURLToPath(new URL("./pi-host.js", import.meta.url));
}
let nextRequestId = 1;
/** How long the composer waits for an extension's completions before giving up. */
const FRAME_REQUEST_TIMEOUT_MS = 2000;
const EXTENSION_CALL_TIMEOUT_MS = 30000;
const STOP_TIMEOUT_MS = 5000;
export class PiProcess {
  readonly projectDir: string;
  boundSessionFile: string | undefined;
  // Includes retry/compaction waits and queued continuations, until Pi settles.
  isRunning = false;
  private proc: ChildProcessWithoutNullStreams;
  private onEvent: (msg: PiMessage) => void;
  private onFrame: (frame: TuiHostFrame) => void;
  private pending = new Map<string, {
    resolve: (data: unknown) => void;
    reject: (err: Error) => void;
  }>();
  private frameWaiters = new Map<string, {
    resolve: (data: unknown) => void;
    reject: (err: Error) => void;
  }>();
  private buffer = "";
  private readonly ended: Promise<void>;
  private resolveEnded!: () => void;
  private stopping = false;
  private terminalError?: Error;
  private channelError?: Error;
  private closed = false;
  private stopTask?: Promise<void>;
  private computerAllowed = false;
  private computerFenced = false;
  private computerRequests = new Map<string, AbortController>();
  private artifactPreviews = new Map<string, AbortController>();
  onOrchestration?: (action: string, params: Record<string, unknown>, operationId: string, signal: AbortSignal) => Promise<unknown>;
  onOrchestrationOutcome?: (outcome: import("zod").z.infer<typeof orchestrationOutcomeSchema>) => void;
  private orchestrationSessionId?: string;
  onOrchestrationRuntime?: () => void;
  onOrchestrationSupplied?: (sessionId: string, messageId: string) => void;
  private orchestrationRequests = new Map<string, AbortController>();
  private orchestrationWaiters = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }>();
  orchestration(ref: ThreadReference, action: "catalog" | "append" | "configure" | "dispatch" | "context" | "arm", payload?: unknown, signal?: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable || !this.proc.connected || signal?.aborted) { reject(new Error("Pi unavailable or operation cancelled")); return; }
      this.orchestrationSessionId = ref.id;
      const requestId = `orchestration-${nextRequestId++}`;
      const cancel = () => { this.orchestrationWaiters.delete(requestId); reject(new Error("Orchestration operation cancelled")); };
      this.orchestrationWaiters.set(requestId, { resolve: value => {
        if (action === "dispatch" && value && typeof value === "object" && "running" in value && typeof value.running === "boolean") { this.isRunning = value.running; this.onOrchestrationRuntime?.(); }
        resolve(value);
      }, reject, cleanup: () => signal?.removeEventListener("abort", cancel) });
      signal?.addEventListener("abort", cancel, { once: true });
      this.proc.send({ type: "nativepi_orchestration_host", requestId, sessionId: ref.id, action, payload }, error => {
        if (!error) return;
        const waiter = this.orchestrationWaiters.get(requestId);
        this.orchestrationWaiters.delete(requestId); waiter?.cleanup(); waiter?.reject(error);
      });
    });
  }
  private async handleOrchestration(raw: unknown): Promise<void> {
    if (!this.isAvailable) return;
    const reply = orchestrationReplySchema.safeParse(raw);
    if (reply.success) {
      const waiter = this.orchestrationWaiters.get(reply.data.requestId);
      this.orchestrationWaiters.delete(reply.data.requestId); waiter?.cleanup();
      if (reply.data.error) waiter?.reject(new Error(reply.data.error)); else waiter?.resolve(reply.data.result);
      return;
    }
    const runtime = orchestrationRuntimeSchema.safeParse(raw);
    if (runtime.success && runtime.data.sessionId === this.orchestrationSessionId) { this.isRunning = runtime.data.running; this.onOrchestrationRuntime?.(); return; }
    const supplied = orchestrationSuppliedSchema.safeParse(raw);
    if (supplied.success) { this.onOrchestrationSupplied?.(supplied.data.sessionId, supplied.data.messageId); return; }
    const outcome = orchestrationOutcomeSchema.safeParse(raw);
    if (outcome.success) { this.onOrchestrationOutcome?.(outcome.data); return; }
    const cancel = orchestrationCancelSchema.safeParse(raw);
    if (cancel.success) { this.orchestrationRequests.get(cancel.data.requestId)?.abort(); return; }
    const parsed = orchestrationRequestSchema.safeParse(raw);
    if (!parsed.success || !this.onOrchestration) return;
    const request = parsed.data;
    if (this.orchestrationRequests.has(request.requestId)) return;
    const controller = new AbortController();
    this.orchestrationRequests.set(request.requestId, controller);
    try {
      const result = await this.onOrchestration(request.action, request.params, request.operationId, controller.signal);
      if (this.proc.connected) this.proc.send({ type: "nativepi_orchestration_reply", requestId: request.requestId, result });
    } catch (error) {
      if (this.proc.connected) this.proc.send({ type: "nativepi_orchestration_reply", requestId: request.requestId, error: error instanceof Error ? error.message : String(error) });
    } finally { this.orchestrationRequests.delete(request.requestId); }
  }
  resetOrchestrationBinding(): void {
    this.cancelComputer();
    void computerController.dispose(this);
    this.orchestrationSessionId = undefined;
    for (const controller of this.orchestrationRequests.values()) controller.abort();
    this.orchestrationRequests.clear();
    for (const waiter of this.orchestrationWaiters.values()) { waiter.cleanup(); waiter.reject(new Error("Pi session binding changed")); }
    this.orchestrationWaiters.clear();
  }
  fenceOrchestration(ref: ThreadReference): void {
    this.cancelComputer();
    if (this.proc.connected) this.proc.send({ type: "nativepi_orchestration_fence", sessionId: ref.id }, () => {});
  }
  get hasOrchestrationWork(): boolean { return this.orchestrationRequests.size > 0 || this.orchestrationWaiters.size > 0; }
  constructor(projectDir: string, onEvent: (msg: PiMessage) => void, onExit: (code: number | null, error?: Error, expected?: boolean) => void, onFrame: (frame: TuiHostFrame) => void = () => { }, args: string[] = []) {
    this.computerAllowed = !args.includes("--nativepi-chat") && !args.includes("--no-session");
    this.projectDir = projectDir;
    this.onEvent = onEvent;
    this.onFrame = onFrame;
    this.ended = new Promise((resolve) => {
      this.resolveEnded = resolve;
    });
    // Electron's fork selects its LSUIElement helper on macOS. Spawning the main
    // app binary instead makes each Pi host appear as a separate Dock app.
    this.proc = fork(resolvePiEntry(), args, {
      cwd: projectDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      execArgv: [],
      silent: true,
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;
    this.proc.on("message", (message: unknown) => { void this.handleComputer(message); void this.handleArtifactPreview(message); void this.handleOrchestration(message); });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => {
      if (this.terminalError)
        return;
      this.buffer += chunk;
      const { messages, rest } = drainLines(this.buffer);
      this.buffer = rest;
      for (const msg of messages)
        this.dispatch(msg);
    });
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk: string) => {
      if (chunk.trim())
        console.error(`[pi ${projectDir}]`, chunk.trimEnd());
    });
    let finished = false;
    const finish = (code: number | null, error?: Error) => {
      if (finished)
        return;
      finished = true;
      this.closed = true;
      this.cancelArtifactPreviews();
      this.cancelComputer();
      void computerController.dispose(this);
      this.isRunning = false;
      this.terminalError ??= error ?? new Error(`Pi exited (${code ?? "?"})`);
      this.rejectAll(this.terminalError);
      this.resolveEnded();
      onExit(code, error ?? this.channelError, this.stopping && !this.channelError);
    };
    this.proc.once("disconnect", () => {
      if (this.stopping || this.closed) return;
      this.channelError = new Error("Pi IPC channel disconnected");
      this.rejectAll(this.channelError);
      void this.stop();
    });
    this.proc.on("error", (error) => {
      this.channelError = error;
      this.terminalError ??= error;
      this.rejectAll(error);
      if (!this.proc.pid)
        finish(null, error);
      else
        void this.stop();
    });
    this.proc.stdin.on("error", (error) => {
      if (this.stopping)
        return;
      this.channelError = error;
      this.terminalError ??= error;
      this.rejectAll(error);
      void this.stop();
    });
    this.proc.on("close", (code) => finish(code));
  }
  private cancelArtifactPreviews(): void {
    for (const controller of this.artifactPreviews.values()) controller.abort();
    this.artifactPreviews.clear();
  }
  private async handleArtifactPreview(message: unknown): Promise<void> {
    if (!this.isAvailable || !message || typeof message !== "object") return;
    if ("type" in message && message.type === "nativepi_artifact_preview_cancel" && "requestId" in message && typeof message.requestId === "string") {
      this.artifactPreviews.get(message.requestId)?.abort();
      return;
    }
    const parsed = artifactProcessRequestSchema.safeParse(message);
    if (!parsed.success || this.artifactPreviews.has(parsed.data.requestId)) return;
    const { requestId, input } = parsed.data;
    const controller = new AbortController();
    this.artifactPreviews.set(requestId, controller);
    try {
      const { previewHtmlArtifact } = await import("../htmlArtifactPreview.ts");
      const result = await previewHtmlArtifact(input, controller.signal);
      if (this.proc.connected) this.proc.send({ type: "nativepi_artifact_preview_reply", requestId, result }, () => {});
    } catch (error) {
      if (this.proc.connected) this.proc.send({ type: "nativepi_artifact_preview_reply", requestId, error: String(error instanceof Error ? error.message : error).slice(0, 4000) }, () => {});
    } finally { this.artifactPreviews.delete(requestId); }
  }
  private cancelComputer(): void {
    this.computerFenced = true;
    for (const controller of this.computerRequests.values()) controller.abort();
    computerController.release(this);
  }
  private async handleComputer(raw: unknown): Promise<void> {
    const cancel = computerCancelSchema.safeParse(raw);
    if (cancel.success) { this.computerRequests.get(cancel.data.requestId)?.abort(); return; }
    const parsed = computerRequestSchema.safeParse(raw);
    if (!parsed.success || this.computerRequests.has(parsed.data.requestId)) return;
    const { requestId, operation } = parsed.data;
    const command = operation.kind === "screenshot" ? "screenshot" : operation.command;
    const controller = new AbortController();
    this.computerRequests.set(requestId, controller);
    try {
      const result = this.isAvailable && this.computerAllowed && this.isRunning && !this.computerFenced
        ? await computerController.run(this, operation, controller.signal)
        : computerFailure(command, "COMPUTER_DISABLED", "Computer use requires an active Work turn in NativePi.");
      if (this.proc.connected) this.proc.send({ type: "nativepi_computer_reply", requestId, result }, () => {});
    } catch {
      if (this.proc.connected) this.proc.send({ type: "nativepi_computer_reply", requestId, result: computerFailure(command, "COMPUTER_UNAVAILABLE", "Computer command interrupted. Inspect the UI before retrying an action.", "unknown") }, () => {});
    } finally { this.computerRequests.delete(requestId); }
  }
  get hasPendingRequests(): boolean { return this.pending.size > 0 || this.frameWaiters.size > 0; }
  get isAvailable(): boolean { return !this.stopping && !this.terminalError; }
  private dispatch(msg: PiMessage): void {
    if (!this.isAvailable)
      return;
    if (msg.type === "response") {
      const id = typeof msg["id"] === "string" ? (msg["id"] as string) : undefined;
      const waiter = id ? this.pending.get(id) : undefined;
      if (waiter && id) {
        this.pending.delete(id);
        if (msg["success"] === false)
          waiter.reject(new Error(String(msg["error"] ?? "Pi command failed")));
        else
          waiter.resolve(msg["data"]);
      }
      return;
    }
    // NativePi's own side channel, carrying the pi-tui surfaces Pi's protocol has
    // no way to describe. Addressed to us either way, so it never reaches the
    // reducer — but the contents were shaped by extension code, so a frame that
    // does not parse is dropped rather than forwarded to the window.
    if (isTuiFrameType(msg.type)) {
      const frame = tuiHostFrameSchema.safeParse(msg);
      if (!frame.success) {
        console.error(`[pi ${this.projectDir}] unusable extension UI frame`, msg["type"]);
        return;
      }
      if (frame.data.type === "nativepi_tui_reply") {
        const { requestId, error, data } = frame.data;
        const waiter = this.frameWaiters.get(requestId);
        if (waiter) {
          this.frameWaiters.delete(requestId);
          if (error)
            waiter.reject(new Error(error));
          else
            waiter.resolve(data);
        }
        return;
      }
      this.onFrame(frame.data);
      return;
    }
    if (msg.type === "agent_start") { this.isRunning = true; this.computerFenced = false; }
    else if (msg.type === "agent_settled") { this.isRunning = false; this.cancelComputer(); }
    this.onEvent(msg);
  }
  send(command: PiCommand): void {
    this.write(command);
  }
  sendRaw(payload: object): void {
    if (this.terminalError || this.stopping)
      throw this.terminalError ?? new Error("Pi is stopping");
    this.proc.stdin.write(JSON.stringify(payload) + "\n");
  }
  sendFrame(frame: TuiClientFrame): void {
    this.sendRaw(frame);
  }
  /**
  * Ask the host something and wait for the answer.
  *
  * Bounded rather than open-ended: the only caller is the composer's autocomplete
  * menu, where an extension provider that hangs would otherwise hold the menu
  * open on a promise that never settles while the user keeps typing.
  */
  frameRequest<T>(build: (requestId: string) => TuiClientFrame, timeoutMs = FRAME_REQUEST_TIMEOUT_MS): Promise<T> {
    const requestId = `f-${nextRequestId++}`;
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.frameWaiters.delete(requestId);
          reject(new Error("The extension did not answer in time."));
        }, timeoutMs);
      }
      this.frameWaiters.set(requestId, {
        resolve: (data) => {
          if (timer)
            clearTimeout(timer);
          resolve(data as T);
        },
        reject: (error) => {
          if (timer)
            clearTimeout(timer);
          reject(error);
        },
      });
      try {
        this.sendFrame(build(requestId));
      }
      catch (error) {
        const waiter = this.frameWaiters.get(requestId);
        this.frameWaiters.delete(requestId);
        waiter?.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  /**
  * The active session's providers, including any an extension registered.
  *
  * Not a `PiCommand`: Pi's own RPC protocol has no such command, and
  * `session.modelRuntime` only lives inside the Pi process, so this goes over
  * the same frame side channel as extension UI rather than `request()`.
  */
  getProviders(): Promise<AuthProviderInfo[]> {
    return this.frameRequest<AuthProviderInfo[]>((requestId) => ({ type: "nativepi_tui_get_providers", requestId }));
  }
  getContextInspector(): Promise<ContextInspector> {
    return this.frameRequest<unknown>((requestId) => ({ type: "nativepi_tui_get_context_inspector", requestId })).then((data) => contextInspectorSchema.parse(data));
  }
  loginProvider(providerId: string, authType: "api_key" | "oauth", flowId?: string): Promise<void> {
    return this.frameRequest<true>((requestId) => ({ type: "nativepi_tui_login", requestId, providerId, authType, flowId }), 0).then(() => undefined);
  }
  logoutProvider(providerId: string): Promise<void> {
    return this.frameRequest<true>((requestId) => ({ type: "nativepi_tui_logout", requestId, providerId }), 0).then(() => undefined);
  }
  /**
  * Call a method a graphical extension's Pi half registered.
  *
  * Given longer than the autocomplete round trip the default is sized for: a
  * panel asking its extension for data can legitimately shell out or hit the
  * network, where a completion menu cannot.
  */
  callExtension(extension: string, method: string, params: JsonValue | undefined): Promise<JsonValue> {
    if (!jsonValueSchema.safeParse(params).success && params !== undefined) {
      return Promise.reject(new Error("Extension call parameters must be a JSON value."));
    }
    return this.frameRequest<JsonValue>((requestId) => ({ type: "nativepi_tui_ext_call", requestId, extension, method, ...(params === undefined ? {} : { params }) }), EXTENSION_CALL_TIMEOUT_MS);
  }
  respondAuthPrompt(id: string, result: {
    value?: string;
    cancel?: boolean;
  }): void {
    this.sendFrame({ type: "nativepi_tui_auth_respond", id, ...result });
  }
  request<T = unknown>(command: PiCommand): Promise<T> {
    const id = `lc-${nextRequestId++}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: data => {
        if (command.type === "prompt" && data && typeof data === "object" && "disposition" in data && (data.disposition === "started" || data.disposition === "queued")) { this.isRunning = true; this.onOrchestrationRuntime?.(); }
        resolve(data as T);
      }, reject });
      try {
        this.write({ ...command, id });
      }
      catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  private write(command: PiCommand): void {
    if (command.type === "abort") this.cancelComputer();
    this.sendRaw(command);
  }
  private rejectAll(err: Error): void {
    for (const controller of this.orchestrationRequests.values()) controller.abort();
    this.orchestrationRequests.clear();
    for (const waiter of this.orchestrationWaiters.values()) { waiter.cleanup(); waiter.reject(err); }
    this.orchestrationWaiters.clear();
    for (const waiter of this.pending.values())
      waiter.reject(err);
    this.pending.clear();
    for (const waiter of this.frameWaiters.values())
      waiter.reject(err);
    this.frameWaiters.clear();
  }
  stop(): Promise<void> {
    return this.stopTask ??= this.stopChild();
  }
  private async stopChild(): Promise<void> {
    if (this.closed)
      return;
    this.stopping = true;
    this.cancelComputer();
    void computerController.dispose(this);
    this.cancelArtifactPreviews();
    this.terminalError ??= new Error("Pi is stopping");
    this.rejectAll(this.terminalError);
    try {
      this.proc.stdin.end();
    }
    catch {
    }
    if (this.channelError) {
      try {
        this.proc.kill();
      }
      catch { }
    }
    const wait = async (ms: number): Promise<boolean> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          this.ended.then(() => false),
          new Promise<true>(resolve => { timer = setTimeout(() => resolve(true), ms); }),
        ]);
      }
      finally {
        clearTimeout(timer);
      }
    };
    // EOF lets Pi abort work, dispose extensions and settle credential writes on
    // Windows too, where killing the child cannot provide a graceful signal.
    if (await wait(STOP_TIMEOUT_MS)) {
      try {
        this.proc.kill();
      }
      catch { }
      if (await wait(2000)) {
        try {
          this.proc.kill("SIGKILL");
        }
        catch { }
        await this.ended;
      }
    }
  }
}
