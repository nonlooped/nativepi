import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { getPackageDir, truncateTail, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";

const SHUTDOWN_GRACE_MS = 5_000;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function getPiInvocation(args: string[]) {
  if (process.env["NATIVEPI_HOST"] === "1") {
    return { command: process.execPath, args: [join(getPackageDir(), "dist", "cli.js"), ...args] };
  }

  const currentScript = process.argv[1];
  const virtualBunScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !virtualBunScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const executable = basename(process.execPath).toLowerCase();
  if (!/^(node|bun)(\.exe)?$/.test(executable)) return { command: process.execPath, args };
  return { command: "pi", args };
}

export function createJsonLineReader(onLine: (line: string) => void) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  const accept = (text: string, final: boolean) => {
    pending += text;
    const lines = pending.split(/\r?\n/);
    if (!final) pending = lines.pop() ?? "";
    else pending = "";
    for (const line of lines) if (line.trim()) onLine(line);
  };
  return {
    push(chunk: Uint8Array) {
      accept(decoder.write(Buffer.from(chunk)), false);
    },
    end() {
      accept(decoder.end(), true);
    },
  };
}

export function execStreaming(
  command: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  onLine: (line: string) => void,
) {
  return new Promise<{ stderr: string; code: number; killed: boolean }>((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = createJsonLineReader(onLine);
    const stderrDecoder = new StringDecoder("utf8");
    let stderr = "";
    let killed = false;
    let settled = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      if (killed || settled) return;
      killed = true;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), SHUTDOWN_GRACE_MS);
    };
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (forceTimer) clearTimeout(forceTimer);
      signal.removeEventListener("abort", kill);
      stdout.end();
      stderr += stderrDecoder.end();
      resolve({ stderr, code, killed });
    };

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncateTail(stderr + stderrDecoder.write(chunk), { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES }).content;
    });
    child.once("error", (error) => {
      stderr += errorMessage(error);
      finish(1);
    });
    child.once("close", (code) => finish(code ?? 0));
    if (signal.aborted) kill();
    else signal.addEventListener("abort", kill, { once: true });
  });
}
