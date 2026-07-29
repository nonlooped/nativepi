import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * A public link for the local server, using a Cloudflare quick tunnel.
 *
 * `cloudflared tunnel --url` dials out to Cloudflare's edge and gets back a
 * throwaway `*.trycloudflare.com` hostname. No account, no DNS record, no
 * inbound firewall rule, and nothing to install on the phone or laptop at the
 * other end — which is the whole reason it is here, because every mesh-VPN
 * design ends at "now install this on every device you want to use".
 *
 * The binary is not shipped in the installer. It is over 50 MB, Cloudflare
 * ships it on their own schedule rather than ours, and most people never turn
 * this on, so it is fetched on first use and cached under user data.
 */

const RELEASE_URL =
  "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
const STARTUP_TIMEOUT_MS = 45_000;

/**
 * Pull the hostname out of cloudflared's output.
 *
 * It arrives inside an ASCII banner, wrapped in timestamps and log levels, and
 * the surrounding text is Cloudflare's to change at any time. Only the hostname
 * itself is matched, which is the one part of that banner that cannot change
 * without the feature changing with it.
 */
export function findTunnelUrl(log: string): string | undefined {
  return /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(log)?.[0];
}

export interface Tunnel {
  url: string;
  stop: () => void;
}

export interface TunnelOptions {
  port: number;
  binDir: string;
  onProgress: (message: string) => void;
}

export async function startTunnel({ port, binDir, onProgress }: TunnelOptions): Promise<Tunnel> {
  const binary = await ensureCloudflared(binDir, onProgress);
  onProgress("Asking Cloudflare for a public link…");

  const child = spawn(
    binary,
    ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`],
    { windowsHide: true },
  );

  return await new Promise<Tunnel>((resolveTunnel, rejectTunnel) => {
    let settled = false;
    // cloudflared prints the hostname inside a banner, and whether it lands on
    // stdout or stderr depends on the build, so both are scanned. Only the tail
    // is kept: it is enough to match against and enough to explain a failure.
    let log = "";

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      const detail = log.trim().slice(-600);
      rejectTunnel(new Error(detail ? `${message}\n${detail}` : message));
    };

    const timer = setTimeout(
      () => fail("Cloudflare did not hand out a public link in time."),
      STARTUP_TIMEOUT_MS,
    );

    const read = (chunk: Buffer) => {
      if (settled) return;
      log = (log + chunk.toString()).slice(-4000);
      const url = findTunnelUrl(log);
      if (!url) return;
      settled = true;
      clearTimeout(timer);
      resolveTunnel({ url, stop: () => child.kill() });
    };

    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("error", (error) => fail(`Could not run the tunnel client. ${error.message}`));
    child.on("exit", (code) => fail(`The tunnel client stopped with exit code ${code}.`));
  });
}

/**
 * GitHub publishes no checksum alongside these assets, so HTTPS to
 * github.com is the trust boundary. The download lands on a temporary name and
 * is moved into place only once complete, so an interrupted download is never
 * mistaken for a usable binary on the next attempt.
 */
async function ensureCloudflared(binDir: string, onProgress: (message: string) => void): Promise<string> {
  const binary = join(binDir, "cloudflared.exe");
  const cached = await stat(binary).catch(() => undefined);
  if (cached?.isFile() && cached.size > 0) return binary;

  onProgress("Downloading the tunnel client…");
  await mkdir(binDir, { recursive: true });
  const partial = `${binary}.partial`;

  try {
    const response = await fetch(RELEASE_URL);
    if (!response.ok || !response.body) {
      throw new Error(`Could not download the tunnel client (HTTP ${response.status}).`);
    }

    const total = Number(response.headers.get("content-length") ?? 0);
    let received = 0;
    let shown = -1;
    // `fetch` is typed with the DOM's ReadableStream while `fromWeb` wants the
    // one from `node:stream/web`. They are the same object at runtime.
    const source = Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
    source.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (total <= 0) return;
      const percent = Math.round((received / total) * 100);
      if (percent === shown) return;
      shown = percent;
      onProgress(`Downloading the tunnel client… ${percent}%`);
    });

    await pipeline(source, createWriteStream(partial));
    await rm(binary, { force: true });
    await rename(partial, binary);
    return binary;
  } catch (error) {
    await rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}
