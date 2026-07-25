import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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
 * need in order to reply outside the request/response envelope.
 *
 * If Pi ever accepts an executable override, most of this class can go.
 */

function resolvePiEntry(): string {
  // The package exposes "./rpc-entry" only under the `import` condition of its
  // `exports` map. `require.resolve` resolves under the `require` condition and
  // would report "not defined by exports", so resolve it as an ESM specifier via
  // `import.meta.resolve` (which applies the `import` condition).
  return fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"));
}

let nextRequestId = 1;

export class PiProcess {
  readonly projectDir: string;
  boundSessionFile: string | undefined;

  private proc: ChildProcessWithoutNullStreams;
  private onEvent: (msg: PiMessage) => void;
  private pending = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
  private buffer = "";

  constructor(projectDir: string, onEvent: (msg: PiMessage) => void, onExit: (code: number | null) => void) {
    this.projectDir = projectDir;
    this.onEvent = onEvent;

    // Electron's process.execPath is the Electron binary; ELECTRON_RUN_AS_NODE
    // makes it behave as plain Node so Pi's rpc-entry.js runs correctly.
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
    this.onEvent(msg);
  }

  send(command: PiCommand): void {
    this.write(command);
  }

  sendRaw(payload: object): void {
    this.proc.stdin.write(JSON.stringify(payload) + "\n");
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
