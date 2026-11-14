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
    return ["screenshot", ...(app ? ["--app", app] : []), ...(windowId ? ["--window-id", windowId] : []), ...(screen !== undefined ? ["--screen", String(screen)] : [])];
  }
  if (operation.args.some(arg => ownedFlags.has(arg.split("=")[0]!))) throw new Error("Snapshot namespaces and debug output are managed by NativePi. Use the headed parameter for physical input.");
  return [...(operation.headed ? ["--headed"] : []), operation.command, ...operation.args];
}

/** One lease per Pi turn, shared across every project and delegate in this app. */
export class ComputerController {
  private owner?: object;
  private flight?: { owner: object; abort: AbortController };
  private releasing = false;
  private homes = new Map<object, Promise<string>>();
  constructor(private runner: ComputerRunner = runComputer) {}
  release(owner: object): void {
    if (this.flight?.owner === owner) {
      if (this.owner === owner) this.releasing = true;
      this.flight.abort.abort();
    } else if (this.owner === owner) { this.owner = undefined; this.releasing = false; }
  }
  async dispose(owner: object): Promise<void> {
    this.release(owner);
    const home = this.homes.get(owner);
    this.homes.delete(owner);
    if (home) {
      // The command holds its own cleanup until close if disposal interrupts it.
      const directory = await home.catch(() => undefined);
      if (directory && this.flight?.owner !== owner) await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }
  async run(owner: object, raw: unknown, signal?: AbortSignal): Promise<ComputerResult> {
    const operation = computerOperationSchema.parse(raw);
    const command = operation.kind === "screenshot" ? "screenshot" : operation.command;
    if (signal?.aborted) return computerFailure(command, "CANCELLED", "Computer command cancelled.");
    let args: string[];
    try { args = computerArgs(operation); }
    catch (error) { return computerFailure(command, "INVALID_ARGS", (error as Error).message); }
    const passive = operation.kind === "command" && ["status", "version", "skills", "help", "permissions"].includes(command) && !operation.headed && !operation.args.includes("--guide") && !operation.args.includes("--request");
    if (this.flight || (!passive && ((this.owner && this.owner !== owner) || this.releasing))) return computerFailure(command, "COMPUTER_BUSY", "The computer is in use by another command or Work chat. Wait for its turn to finish, or stop that chat. Do not bypass this through the shell.");
    if (!passive) this.owner = owner;
    const abort = new AbortController();
    this.flight = { owner, abort };
    let home = this.homes.get(owner);
    if (!home) { home = mkdtemp(join(tmpdir(), "nativepi-computer-")); this.homes.set(owner, home); }
    let directory: string | undefined;
    try {
      directory = await home;
      const result = await this.runner(args, directory, signal ? AbortSignal.any([signal, abort.signal]) : abort.signal, operation.kind === "command" ? operation.input : undefined);
      if (command === "screenshot" && result.ok) {
        const image = z.object({ format: z.literal("png"), data: z.string().min(1).max(LIMIT), width: z.number(), height: z.number() }).parse(result.data);
        const { data: _image, ...metadata } = z.record(z.string(), z.unknown()).parse(result.data);
        return { envelope: { ...result, data: jsonValueSchema.parse(metadata) }, image: { type: "image", mimeType: "image/png", data: image.data } };
      }
      return { envelope: result };
    } catch (error) {
      // A killed native action may have landed: never claim it is safe to repeat.
      const message = (error as Error).message;
      return computerFailure(command, signal?.aborted || abort.signal.aborted ? "CANCELLED" : "COMPUTER_UNAVAILABLE", /ENOENT/.test(message) ? "The bundled computer-use binary is missing. Reinstall NativePi." : message, directory ? "unknown" : "not_delivered");
    } finally {
      this.flight = undefined;
      if (this.releasing && this.owner === owner) { this.owner = undefined; this.releasing = false; }
      if (!this.homes.has(owner) && directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
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
