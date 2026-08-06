import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isTuiFrameType, tuiHostFrameSchema, type TuiClientFrame, type TuiHostFrame } from "../../shared/tui-frames.ts";
import type { AuthProviderInfo } from "../../shared/rpc-schema.ts";
import type { ContextInspector } from "../../shared/pi-types.ts";
import { contextInspectorSchema } from "../../shared/tui-frames.ts";
import { jsonValueSchema, type JsonValue } from "../../shared/json.ts";
import { drainLines, serializeCommand, type PiCommand, type PiMessage } from "./protocol.ts";

/**
 * Why this is hand-rolled rather than Pi's own `RpcClient`.
 *
 * Pi exports an `RpcClient` covering every command below, and it is the obvious
 * thing to reach for. It cannot be used here: it spawns with a hardcoded
 * `spawn("node", [cliPath])`, and its options expose `cliPath`, `args` and `env`
 * but not the executable. A packaged Electron app has no system `node` to find,
 * so NativePi has to launch Pi through `process.execPath` with
 * `ELECTRON_RUN_AS_NODE` — see the constructor.
 *
 * `RpcClient` also has no equivalent of `sendRaw`, which extension UI responses
 * need in order to reply outside the request/response envelope — and neither it
 * nor Pi's protocol knows about the pi-tui frames NativePi carries on the same
 * pipe, which is the other half of what this class routes.
 */

/**
 * NativePi's Pi entry point, which sits beside this bundle in `out/main`.
 *
 * Pi's own `rpc-entry` is not used: it builds an extension UI context that drops
 * every pi-tui component, and the context is not injectable. `pi-host` is that
 * entry plus the context that renders them — see `pi/host/entry.ts`.
 */
function resolvePiEntry(): string {
  return fileURLToPath(new URL("./pi-host.js", import.meta.url));
}

let nextRequestId = 1;

/** How long the composer waits for an extension's completions before giving up. */
const FRAME_REQUEST_TIMEOUT_MS = 2000;
const EXTENSION_CALL_TIMEOUT_MS = 30_000;

export class PiProcess {
  readonly projectDir: string;
  boundSessionFile: string | undefined;

  private proc: ChildProcessWithoutNullStreams;
  private onEvent: (msg: PiMessage) => void;
  private onFrame: (frame: TuiHostFrame) => void;
  private pending = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
  private frameWaiters = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
  private buffer = "";

  constructor(
    projectDir: string,
    onEvent: (msg: PiMessage) => void,
    onExit: (code: number | null) => void,
    onFrame: (frame: TuiHostFrame) => void = () => {},
  ) {
    this.projectDir = projectDir;
    this.onEvent = onEvent;
    this.onFrame = onFrame;

    // Electron's process.execPath is the Electron binary; ELECTRON_RUN_AS_NODE
    // makes it behave as plain Node so the Pi host entry runs correctly.
    this.proc = spawn(process.execPath, [resolvePiEntry()], {
      cwd: projectDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      const { messages, rest } = drainLines(this.buffer);
      this.buffer = rest;
      for (const msg of messages) this.dispatch(msg);
    });

    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk: string) => {
      if (chunk.trim()) console.error(`[pi ${projectDir}]`, chunk.trimEnd());
    });

    this.proc.on("exit", (code) => {
      this.rejectAll(new Error(`Pi exited (${code ?? "?"})`));
      onExit(code);
    });
  }

  private dispatch(msg: PiMessage): void {
    if (msg.type === "response") {
      const id = typeof msg["id"] === "string" ? (msg["id"] as string) : undefined;
      const waiter = id ? this.pending.get(id) : undefined;
      if (waiter && id) {
        this.pending.delete(id);
        if (msg["success"] === false) waiter.reject(new Error(String(msg["error"] ?? "Pi command failed")));
        else waiter.resolve(msg["data"]);
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
          if (error) waiter.reject(new Error(error));
          else waiter.resolve(data);
        }
        return;
      }
      this.onFrame(frame.data);
      return;
    }
    this.onEvent(msg);
  }

  send(command: PiCommand): void {
    this.write(command);
  }

  sendRaw(payload: object): void {
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
          if (timer) clearTimeout(timer);
          resolve(data as T);
        },
        reject: (error) => {
          if (timer) clearTimeout(timer);
          reject(error);
        },
      });
      this.sendFrame(build(requestId));
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
    return this.frameRequest<unknown>((requestId) => ({ type: "nativepi_tui_get_context_inspector", requestId })).then(
      (data) => contextInspectorSchema.parse(data),
    );
  }

  loginProvider(providerId: string, authType: "api_key" | "oauth"): Promise<void> {
    return this.frameRequest<true>(
      (requestId) => ({ type: "nativepi_tui_login", requestId, providerId, authType }),
      0,
    ).then(() => undefined);
  }

  logoutProvider(providerId: string): Promise<void> {
    return this.frameRequest<true>((requestId) => ({ type: "nativepi_tui_logout", requestId, providerId }), 0).then(
      () => undefined,
    );
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
    return this.frameRequest<JsonValue>(
      (requestId) => ({ type: "nativepi_tui_ext_call", requestId, extension, method, ...(params === undefined ? {} : { params }) }),
      EXTENSION_CALL_TIMEOUT_MS,
    );
  }

  respondAuthPrompt(id: string, result: { value?: string; cancel?: boolean }): void {
    this.sendFrame({ type: "nativepi_tui_auth_respond", id, ...result });
  }

  request<T = unknown>(command: PiCommand): Promise<T> {
    const id = `lc-${nextRequestId++}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (d: unknown) => void, reject });
      this.write({ ...command, id });
    });
  }

  private write(command: PiCommand): void {
    this.proc.stdin.write(serializeCommand(command));
  }

  private rejectAll(err: Error): void {
    for (const waiter of this.pending.values()) waiter.reject(err);
    this.pending.clear();
    for (const waiter of this.frameWaiters.values()) waiter.reject(err);
    this.frameWaiters.clear();
  }

  async stop(): Promise<void> {
    try {
      this.proc.stdin.end();
    } catch {
    }
    if (!this.proc.killed) this.proc.kill();
    await new Promise<void>((resolve) => {
      if (this.proc.exitCode !== null) resolve();
      else this.proc.once("exit", () => resolve());
    });
  }
}
