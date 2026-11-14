import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { z } from "zod";
import { jsonValueSchema } from "../shared/json.ts";
import { computerEnvelopeSchema, computerOperationSchema, computerStatusSchema, type ComputerEnvelope, type ComputerOperation, type ComputerResult, type ComputerStatus } from "../shared/computer-use.ts";

const LIMIT = 24 * 1024 * 1024;
export function computerFailure(command: string, code: string, message: string, delivery = "not_delivered"): ComputerResult {
  return { envelope: { ok: false, command, error: { code, message, disposition: { delivery, retry: delivery === "not_delivered" ? "safe" : "unsafe" } } } };
}

/** Resolve the pinned native executable, never PATH or a system Node launcher. */
export function computerBinary(platform = process.platform, arch = process.arch) {
  if (!["darwin", "win32", "linux"].includes(platform) || !["arm64", "x64"].includes(arch)) throw new Error(`Computer use is unavailable on ${platform}/${arch}.`);
  const packageFile = createRequire(import.meta.url).resolve("agent-desktop/package.json").replace(/app\.asar([/\\])/, "app.asar.unpacked$1");
  const bin = join(dirname(packageFile), "bin");
  return {
    file: join(bin, `agent-desktop-${platform}-${arch}${platform === "win32" ? ".exe" : ""}`),
    helper: platform === "darwin" ? join(bin, `agent-desktop-macos-helper-${platform}-${arch}`) : undefined,
  };
}

export type ComputerRunner = (args: string[], home: string, signal: AbortSignal, input?: string) => Promise<ComputerEnvelope>;
export const runComputer: ComputerRunner = async (args, home, signal, input) => {
  signal.throwIfAborted();
  const { file, helper } = computerBinary();
  return new Promise((resolve, reject) => {
    const environment: NodeJS.ProcessEnv = { ...process.env, AGENT_DESKTOP_HOME: home };
    delete environment.AGENT_DESKTOP_SESSION;
    delete environment.AGENT_DESKTOP_AGENT_ID;
    if (helper) environment.AGENT_DESKTOP_MACOS_HELPER_PATH = helper;
    const child = spawn(file, args, {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      env: environment,
    });
    let output = "";
    let bytes = 0;
    let failure: Error | undefined;
    const cancel = () => { failure ??= new Error("Computer command interrupted; observe the current UI before attempting another action."); child.kill("SIGKILL"); };
    const timer = setTimeout(cancel, 60_000);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > LIMIT) { failure ??= new Error("Computer response exceeded 24 MiB. Use a smaller snapshot or capture one window."); child.kill("SIGKILL"); }
      else output += chunk;
    });
    // Desktop contents must not leak into app logs, including error diagnostics.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", error => { failure ??= error; });
    child.once("close", code => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (failure) { reject(failure); return; }
      // Keep operational envelopes even on nonzero exits. Only help uses text.
      try { resolve(computerEnvelopeSchema.parse(JSON.parse(output))); }
      catch {
        if (code === 0 && output && (args.includes("--help") || args[0] === "help")) resolve({ ok: true, command: "help", data: { text: output.slice(0, 100000) } });
        else reject(new Error("Computer command returned an unreadable response. Observe the UI before retrying any action."));
      }
    });
    child.stdin.end(input);
  });
};

// Flags that could escape the host-owned snapshot namespace or write debug files.
const ownedFlags = new Set(["--session", "--agent-id", "--trace", "--trace-strict", "--debug", "--screenshot", "--headed"]);
export function computerArgs(operation: ComputerOperation): string[] {
  if (operation.kind === "screenshot") {
    const { app, windowId, screen } = operation.target;
    return ["screenshot", ...(app && !windowId ? ["--app", app] : []), ...(windowId ? ["--window-id", windowId] : []), ...(screen !== undefined ? ["--screen", String(screen)] : [])];
  }
  if (operation.args.some(arg => ownedFlags.has(arg.split("=")[0]!))) throw new Error("Snapshot namespaces and debug output are managed by NativePi. Use the headed parameter for physical input.");
  return [...(operation.headed ? ["--headed"] : []), operation.command, ...operation.args];
}

type WindowScope = string | undefined;
type Access = { window: WindowScope; mode: "read" | "write" | "none" };
type Snapshot = { window: WindowScope; stale: boolean };
type ComputerState = { home: Promise<string>; snapshots: Map<string, Snapshot>; jobs: Set<AbortController>; disposed: boolean };
type WaitingAction = { owner: object; access: Access; grant(): void; cancel(): void };
const referenceId = /^@([^:]+):e\d+$/;
const observations = new Set(["snapshot", "find", "get", "is", "list-surfaces", "list-apps", "list-windows", "list-displays", "list-notifications", "clipboard-get"]);
const localActions = new Set(["click", "type", "set-value", "clear", "toggle", "check", "uncheck", "expand", "collapse", "scroll", "scroll-to"]);
function option(args: string[], name: string): string | undefined {
  const end = args.indexOf("--");
  const flags = end < 0 ? args : args.slice(0, end);
  const index = flags.indexOf(name);
  return index >= 0 ? flags[index + 1] : flags.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}
function overlaps(a: WindowScope, b: WindowScope): boolean { return a === undefined || b === undefined || a === b; }
function conflicts(a: WaitingAction, b: WaitingAction): boolean {
  if (a.owner === b.owner) return true;
  return a.access.mode !== "none" && b.access.mode !== "none" && (a.access.mode === "write" || b.access.mode === "write") && overlaps(a.access.window, b.access.window);
}

/** Schedule individual actions, keeping each chat's snapshots private. */
export class ComputerController {
  private states = new Map<object, ComputerState>();
  private queue: WaitingAction[] = [];
  private active = new Set<WaitingAction>();
  constructor(private runner: ComputerRunner = runComputer) {}
  release(owner: object): void {
    for (const job of this.states.get(owner)?.jobs ?? []) job.abort();
  }
  async dispose(owner: object): Promise<void> {
    const state = this.states.get(owner);
    if (!state) return;
    this.states.delete(owner);
    state.disposed = true;
    for (const job of state.jobs) job.abort();
    if (!state.jobs.size) await this.clean(state);
  }
  private async clean(state: ComputerState): Promise<void> {
    const directory = await state.home.catch(() => undefined);
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
  private pump(): void {
    for (const job of [...this.queue]) {
      const index = this.queue.indexOf(job);
      // Preserve arrival order for overlapping resources, without blocking
      // independent windows behind a busy window or starving physical input.
      if ([...this.active, ...this.queue.slice(0, index)].some(other => conflicts(job, other))) continue;
      this.queue.splice(index, 1);
      this.active.add(job);
      job.grant();
    }
  }
  private acquire(owner: object, access: Access, signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const job: WaitingAction = {
        owner, access,
        grant: () => {
          signal.removeEventListener("abort", job.cancel);
          resolve(() => { this.active.delete(job); this.pump(); });
        },
        cancel: () => {
          const index = this.queue.indexOf(job);
          if (index >= 0) this.queue.splice(index, 1);
          signal.removeEventListener("abort", job.cancel);
          reject(new Error("Computer command cancelled while waiting for another action."));
          this.pump();
        },
      };
      if (signal.aborted) { reject(new Error("Computer command cancelled.")); return; }
      this.queue.push(job);
      signal.addEventListener("abort", job.cancel, { once: true });
      this.pump();
    });
  }
  private references(operation: ComputerOperation): string[] {
    if (operation.kind !== "command") return [];
    const { command, args } = operation;
    const id = (value?: string) => value ? referenceId.exec(value)?.[1] : undefined;
    if (command === "snapshot" || command === "find" || command === "wait") {
      const ref = id(option(args, command === "wait" ? "--element" : "--root"));
      return ref ? [ref] : [];
    }
    if (command === "drag") return args.flatMap(arg => id(arg.startsWith("--") && arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : arg) ?? []);
    if (localActions.has(command) || ["get", "is", "focus", "select", "right-click", "double-click", "triple-click", "hover"].includes(command)) return args.flatMap(arg => id(arg) ?? []).slice(0, 1);
    return [];
  }
  private access(operation: ComputerOperation, state: ComputerState): Access {
    if (operation.kind === "screenshot") return { window: operation.target.windowId, mode: "read" };
    const { command, args, headed } = operation;
    const help = args.indexOf("--help") >= 0 && (args.indexOf("--") < 0 || args.indexOf("--help") < args.indexOf("--"));
    const permissionCheck = command === "permissions" && !args.some(arg => arg.startsWith("--guide") || arg.startsWith("--request"));
    if (!headed && (["status", "version", "skills", "help", "wait"].includes(command) || help || permissionCheck)) return { window: undefined, mode: "none" };
    const refs = this.references(operation).map(id => state.snapshots.get(id)?.window);
    const explicitWindow = option(args, "--window-id");
    if (refs.length && explicitWindow) refs.push(explicitWindow);
    let window = explicitWindow;
    if (refs.length) window = refs.every(value => value === refs[0]) ? refs[0] : undefined;
    // Menu selection, focus, clipboard writes and window/app management can
    // affect other windows. Treat them like physical input, even when semantic.
    const surface = option(args, "--surface");
    if (headed || (!observations.has(command) && !localActions.has(command))) return { window: undefined, mode: "write" };
    return { window: surface && surface !== "window" ? undefined : window, mode: observations.has(command) ? "read" : "write" };
  }
  private remember(state: ComputerState, result: ComputerEnvelope, access: Access, operation: ComputerOperation): void {
    const data = result.data;
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.snapshot_id !== "string") return;
    const surface = operation.kind === "command" ? option(operation.args, "--surface") : undefined;
    let window = access.window;
    if (data.window && typeof data.window === "object" && !Array.isArray(data.window) && typeof data.window.id === "string") window = data.window.id;
    if (surface && surface !== "window") window = undefined;
    // A subtree drill must never turn an already invalidated snapshot fresh.
    const previous = state.snapshots.get(data.snapshot_id);
    if (previous && previous.window !== window) window = undefined;
    state.snapshots.set(data.snapshot_id, { window, stale: previous?.stale ?? false });
    while (state.snapshots.size > 128) state.snapshots.delete(state.snapshots.keys().next().value!);
  }
  private invalidate(owner: object, window: WindowScope): void {
    for (const [other, state] of this.states) {
      if (other === owner) continue;
      for (const snapshot of state.snapshots.values()) if (overlaps(window, snapshot.window)) snapshot.stale = true;
    }
  }
  async run(owner: object, raw: unknown, signal?: AbortSignal): Promise<ComputerResult> {
    const operation = computerOperationSchema.parse(raw);
    const command = operation.kind === "screenshot" ? "screenshot" : operation.command;
    if (signal?.aborted) return computerFailure(command, "CANCELLED", "Computer command cancelled.");
    let args: string[];
    try { args = computerArgs(operation); }
    catch (error) { return computerFailure(command, "INVALID_ARGS", (error as Error).message); }
    let state = this.states.get(owner);
    if (!state) {
      state = { home: mkdtemp(join(tmpdir(), "nativepi-computer-")), snapshots: new Map(), jobs: new Set(), disposed: false };
      // Queued actions may not await the directory immediately.
      void state.home.catch(() => {});
      this.states.set(owner, state);
    }
    const abort = new AbortController();
    state.jobs.add(abort);
    // Bound both queueing and native execution within the tool IPC deadline.
    const timer = setTimeout(() => abort.abort(), 60_000);
    const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
    const access = this.access(operation, state);
    let unlock: (() => void) | undefined;
    let delivered = false;
    try {
      unlock = await this.acquire(owner, access, combined);
      combined.throwIfAborted();
      // Recheck after queueing: another chat may have changed the window while
      // this action waited. Refuse before delivery rather than guessing intent.
      if (this.references(operation).some(id => !state.snapshots.has(id) || state.snapshots.get(id)!.stale)) return computerFailure(command, "STALE_REF", "Another chat may have changed this window, or the snapshot expired. Take a fresh snapshot or find before acting on its refs.");
      const directory = await state.home;
      combined.throwIfAborted();
      delivered = true;
      const result = await this.runner(args, directory, combined, operation.kind === "command" ? operation.input : undefined);
      const disposition = (result.ok && result.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data.disposition : result.error?.disposition);
      const notDelivered = disposition && typeof disposition === "object" && !Array.isArray(disposition) && disposition.delivery === "not_delivered";
      if (access.mode === "write" && !notDelivered) this.invalidate(owner, access.window);
      this.remember(state, result, access, operation);
      if (command === "screenshot" && result.ok) {
        const image = z.object({ format: z.literal("png"), data: z.string().min(1).max(LIMIT), width: z.number(), height: z.number() }).parse(result.data);
        const { data: _image, ...metadata } = z.record(z.string(), z.unknown()).parse(result.data);
        return { envelope: { ...result, data: jsonValueSchema.parse(metadata) }, image: { type: "image", mimeType: "image/png", data: image.data } };
      }
      return { envelope: result };
    } catch (error) {
      if (delivered && access.mode === "write") this.invalidate(owner, access.window);
      const message = (error as Error).message;
      return computerFailure(command, combined.aborted ? "CANCELLED" : "COMPUTER_UNAVAILABLE", /ENOENT/.test(message) ? "The bundled computer-use binary is missing. Reinstall NativePi." : message, delivered ? "unknown" : "not_delivered");
    } finally {
      // A cancelled native command retains its slot until its process closes.
      unlock?.();
      clearTimeout(timer);
      state.jobs.delete(abort);
      if (state.disposed && !state.jobs.size) await this.clean(state);
    }
  }
}
export const computerController = new ComputerController();

/** A short-lived owner for the settings permission check/guide, never a chat. */
export async function computerStatus(guide = false): Promise<ComputerStatus> {
  const owner = {};
  try {
    const { envelope } = await computerController.run(owner, { kind: "command", command: guide ? "permissions" : "status", args: guide ? ["--guide"] : [] });
    if (!envelope.ok) return { available: false, permissions: {}, error: envelope.error?.message ?? "Computer use is unavailable." };
    if (guide) return computerStatus();
    const data = z.object({ version: z.string(), platform: z.string(), permissions: computerStatusSchema.shape.permissions }).parse(envelope.data);
    return { available: true, ...data };
  } catch (error) { return { available: false, permissions: {}, error: (error as Error).message }; }
  finally { await computerController.dispose(owner); }
}
