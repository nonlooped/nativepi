import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { RemoteAccessStatus } from "../shared/rpc-schema.ts";

const tailscaleStatusSchema = z.object({
  BackendState: z.string().optional(),
  Self: z.object({ DNSName: z.string().optional() }).optional(),
});

let executable: string | undefined;
let serveProcess: ChildProcessWithoutNullStreams | undefined;
let status: RemoteAccessStatus = { state: "checking" };

export async function remoteAccessStatus(refresh = false): Promise<RemoteAccessStatus> {
  if (serveProcess) return status;
  if (!refresh && status.state !== "checking") return status;
  status = await detectTailscale();
  return status;
}

export async function startRemoteAccess(port: number, token: string): Promise<RemoteAccessStatus> {
  if (serveProcess) return status;
  const detected = await remoteAccessStatus(true);
  if (detected.state !== "available" || !executable) return detected;

  status = { state: "starting" };
  const child = spawn(executable, ["serve", "--yes", `http://127.0.0.1:${port}`], {
    windowsHide: true,
    stdio: "pipe",
  });
  serveProcess = child;

  let output = "";
  const collect = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-16_384);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const result = await new Promise<RemoteAccessStatus>((resolveStart) => {
    let settled = false;
    const finish = (next: RemoteAccessStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveStart(next);
    };
    const inspect = () => {
      const remoteUrl = findUrl(output, true);
      if (remoteUrl) finish({ state: "running", link: `${remoteUrl}/#token=${token}` });
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("error", (error) => finish({ state: "error", error: error.message }));
    child.once("exit", (code) => {
      const setupUrl = findUrl(output, false);
      finish({
        state: "error",
        error: cleanError(output) || `Tailscale Serve stopped with exit code ${code ?? "unknown"}.`,
        setupUrl,
      });
    });
    const timer = setTimeout(() => {
      const setupUrl = findUrl(output, false);
      finish({
        state: "error",
        error: setupUrl
          ? "Tailscale needs permission to serve NativePi. Finish setup, then try again."
          : cleanError(output) || "Tailscale did not finish starting Remote Access.",
        setupUrl,
      });
    }, 10_000);
  });

  status = result;
  if (result.state !== "running") {
    child.kill();
    if (serveProcess === child) serveProcess = undefined;
    return status;
  }

  child.once("exit", (code) => {
    if (serveProcess !== child) return;
    serveProcess = undefined;
    status = { state: "error", error: `Tailscale Serve stopped with exit code ${code ?? "unknown"}.` };
  });
  return status;
}

export async function stopRemoteAccess(): Promise<void> {
  const child = serveProcess;
  serveProcess = undefined;
  status = executable ? { state: "available" } : { state: "checking" };
  if (!child) return;
  const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
  child.kill();
  await Promise.race([
    exited,
    new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ]);
}

export function remoteAccessRunning(): boolean {
  return Boolean(serveProcess && status.state === "running");
}

async function detectTailscale(): Promise<RemoteAccessStatus> {
  for (const candidate of tailscaleCandidates()) {
    if (candidate.includes("\\") && !existsSync(candidate)) continue;
    const result = await run(candidate, ["status", "--json"]);
    if (result.notFound) continue;
    executable = candidate;

    const parsed = parseTailscaleStatus(result.stdout);
    if (parsed?.BackendState === "Running" && parsed.Self?.DNSName) {
      return { state: "available" };
    }
    if (parsed?.BackendState === "NeedsLogin" || parsed?.BackendState === "Stopped") {
      return { state: "signed-out" };
    }
    return {
      state: "error",
      error: cleanError(result.stderr) || "Tailscale is installed but is not ready.",
    };
  }
  executable = undefined;
  return { state: "not-installed" };
}

export function parseTailscaleStatus(output: string): z.infer<typeof tailscaleStatusSchema> | undefined {
  try {
    return tailscaleStatusSchema.parse(JSON.parse(output));
  } catch {
    return undefined;
  }
}

function tailscaleCandidates(): string[] {
  const programFiles = processEnv("ProgramFiles");
  return [
    ...(programFiles ? [join(programFiles, "Tailscale", "tailscale.exe")] : []),
    "tailscale.exe",
  ];
}

function processEnv(name: string): string | undefined {
  return globalThis.process.env[name];
}

function run(file: string, args: string[]): Promise<{ stdout: string; stderr: string; notFound: boolean }> {
  return new Promise((resolveRun) => {
    execFile(file, args, { windowsHide: true, timeout: 5_000 }, (error, stdout, stderr) => {
      resolveRun({
        stdout,
        stderr,
        notFound: Boolean(error && "code" in error && error.code === "ENOENT"),
      });
    });
  });
}

function findUrl(output: string, tailscaleHost: boolean): string | undefined {
  for (const value of output.match(/https:\/\/[^\s|]+/gi) ?? []) {
    try {
      const url = new URL(value);
      const isTailscale = url.hostname.toLowerCase().endsWith(".ts.net");
      if (isTailscale === tailscaleHost) return url.origin;
    } catch {
      // Ignore malformed CLI output.
    }
  }
  return undefined;
}

function cleanError(output: string): string | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("https://"));
  return lines.at(-1);
}
