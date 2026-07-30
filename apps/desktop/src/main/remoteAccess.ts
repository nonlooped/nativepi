import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RemoteAccessStatus } from "../shared/rpc-schema.ts";

/**
 * Remote access, as a Cloudflare quick tunnel.
 *
 * `cloudflared tunnel --url` dials out to Cloudflare's edge and gets back a
 * throwaway `*.trycloudflare.com` hostname. No account, no DNS record, no
 * inbound firewall rule, and nothing to install on the phone or laptop at the
 * other end. That last part is the whole reason this replaced a mesh VPN: the
 * setup cost fell on every device someone wanted to connect from, which is far
 * too much ceremony for reading a diff from the couch.
 *
 * The binary is not shipped in the installer. It is over 50 MB, Cloudflare
 * ships it on their own schedule rather than ours, and most people never turn
 * this on, so it is fetched on first use and cached under user data.
 */

const RELEASE_URL =
  "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
const STARTUP_TIMEOUT_MS = 45_000;

/**
 * How long to wait for a freshly minted hostname to start answering.
 *
 * Cloudflare hands out the name well before its edge will route it, and it
 * warns as much on startup. A phone that scans during the gap gets a connection
 * error, and mobile browsers cache that failure for long enough that the owner
 * gives up and blames the app.
 *
 * The budget is generous because the delay is wildly variable: two measurements
 * on the same machine came back at 7 seconds and 63 seconds. Waiting behind an
 * honest "waiting" message costs nothing, whereas giving up early turns a link
 * that was about to work into an error.
 */
const REACHABLE_TIMEOUT_MS = 180_000;
const REACHABLE_POLL_MS = 1_000;

/**
 * How often a live link is re-checked.
 *
 * A quick tunnel can stop routing while its client keeps running, and the exit
 * code that would otherwise report a dead link never arrives. Sixty seconds is
 * slow enough to be free — one HEAD an hour of use — and fast enough that the
 * settings screen is not the last to know.
 */
const HEALTH_POLL_MS = 60_000;

/**
 * How long the download may go without delivering a byte.
 *
 * A stall rather than a total budget: the file is over 50 MB and a slow line is
 * not a failure, but a proxy that accepts the request and then goes quiet would
 * otherwise leave the settings screen saying "Downloading" forever.
 */
const DOWNLOAD_STALL_MS = 30_000;

/**
 * A public link is this machine's terminals and projects on the open internet,
 * guarded by the token in the URL fragment. The likeliest way that goes wrong
 * is not someone guessing a 192 bit token, it is the owner forgetting the link
 * is up, so it closes itself after half a day either way.
 */
const LINK_LIFETIME_MS = 12 * 60 * 60 * 1000;

let tunnel: ChildProcessWithoutNullStreams | undefined;
let expiry: NodeJS.Timeout | undefined;
let health: NodeJS.Timeout | undefined;
let status: RemoteAccessStatus = { state: "idle" };

export function remoteAccessStatus(): RemoteAccessStatus {
  return status;
}

export function remoteAccessRunning(): boolean {
  return Boolean(tunnel && status.state === "running");
}

export async function startRemoteAccess(
  port: number,
  token: string,
  binDir: string,
): Promise<RemoteAccessStatus> {
  if (tunnel) return status;

  try {
    const binary = await ensureCloudflared(binDir, (preparing) => {
      // Polled by the settings screen, so progress needs nowhere else to go.
      status = { state: "starting", preparing };
    });
    status = { state: "starting", preparing: "Asking Cloudflare for a public link…" };

    const url = await openTunnel(binary, port);
    const child = tunnel;
    status = { state: "starting", preparing: "Waiting for the link to come online…" };
    await waitForReachable(url);
    // The client can die while that wait is in flight, and a request already
    // forwarded can still come back 200 afterwards. A replacement tunnel is
    // no better: its address is different, so only the process that printed
    // this URL may publish it.
    if (!child || tunnel !== child) throw new Error("The tunnel client stopped before the link came online.");
    status = {
      state: "running",
      link: `${url}/#token=${token}`,
      expiresAt: Date.now() + LINK_LIFETIME_MS,
      reachable: true,
      checkedAt: Date.now(),
    };
    health = setInterval(() => void checkHealth(url), HEALTH_POLL_MS);
    expiry = setTimeout(() => {
      void stopRemoteAccess().then(() => {
        status = { state: "idle", error: "The public link reached its twelve hour limit and was closed." };
      });
    }, LINK_LIFETIME_MS);
  } catch (error) {
    await stopRemoteAccess();
    status = { state: "error", error: error instanceof Error ? error.message : String(error) };
  }
  return status;
}

export async function stopRemoteAccess(): Promise<void> {
  const child = tunnel;
  tunnel = undefined;
  if (expiry) clearTimeout(expiry);
  expiry = undefined;
  if (health) clearInterval(health);
  health = undefined;
  status = { state: "idle" };
  if (!child) return;

  const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
  child.kill();
  await Promise.race([
    exited,
    new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ]);
}

/**
 * Drop a cached binary that cannot be run, and describe why.
 *
 * A spawn failure is the file's fault rather than the network's: missing, not
 * executable, or not a real binary at all. Removing it means the next attempt
 * fetches a fresh copy instead of failing on the same bad cache forever.
 * Windows reports some of these by throwing from `spawn` and others by emitting
 * `error`, so both paths come through here.
 */
function unusableBinary(binary: string, message: string): string {
  void rm(binary, { force: true }).catch(() => {});
  return `Could not run the tunnel client. ${message}`;
}

/**
 * Block until the hostname actually serves the app.
 *
 * Only a successful status counts. Cloudflare registers the name before it has
 * a working route to the connector, and in that window it answers with an error
 * page of its own rather than refusing the connection: a tunnel aimed at a dead
 * port returns 502 from the edge. Treating any completed exchange as proof of
 * life would publish a link to precisely the broken state this wait exists to
 * rule out.
 */
async function waitForReachable(url: string): Promise<void> {
  const deadline = Date.now() + REACHABLE_TIMEOUT_MS;
  for (;;) {
    if (await responds(url)) return;
    if (Date.now() >= deadline) {
      throw new Error("Cloudflare created the link but it never came online. Try again.");
    }
    await new Promise((settle) => setTimeout(settle, REACHABLE_POLL_MS));
  }
}

async function responds(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(REACHABLE_POLL_MS * 5),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Re-check a live link and record the answer.
 *
 * The reading is reported rather than acted on: a tunnel that misses one probe
 * is usually back on the next, and tearing the link down over a single failed
 * request would replace a brief hiccup with a new address nobody has.
 */
async function checkHealth(url: string): Promise<void> {
  if (status.state !== "running") return;
  const link = status.link;
  if (!link || !link.startsWith(`${url}/`)) return;
  const reachable = await responds(url);
  // The link may have been stopped or replaced while the request was in flight.
  if (status.state !== "running" || status.link !== link) return;
  status = { ...status, reachable, checkedAt: Date.now() };
}

function openTunnel(binary: string, port: number): Promise<string> {
  let child: ChildProcessWithoutNullStreams;
  try {
    // `--protocol http2` rather than the default QUIC: measured at roughly
    // 1.7x the throughput here (230 KB/s to 400 KB/s), and a quick tunnel gets
    // a single connection either way, so the transport is the whole ceiling.
    child = spawn(
      binary,
      ["tunnel", "--no-autoupdate", "--protocol", "http2", "--url", `http://127.0.0.1:${port}`],
      { windowsHide: true, stdio: "pipe" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Promise.reject(new Error(unusableBinary(binary, message)));
  }
  tunnel = child;

  return new Promise<string>((resolveUrl, rejectUrl) => {
    let settled = false;
    // The hostname arrives inside an ASCII banner, and whether that lands on
    // stdout or stderr depends on the build, so both are watched. Only the tail
    // is kept: enough to match against, and enough to explain a failure.
    let log = "";

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const detail = log.trim().slice(-600);
      rejectUrl(new Error(detail ? `${message}\n${detail}` : message));
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
      resolveUrl(url);
    };

    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("error", (error) => fail(unusableBinary(binary, error.message)));
    child.once("exit", (code) => {
      // `stopRemoteAccess` clears `tunnel` before it kills, so a child still
      // registered here died on its own rather than being asked to.
      const deliberate = tunnel !== child;
      if (!deliberate) tunnel = undefined;
      if (!settled) fail(`The tunnel client stopped with exit code ${code ?? "unknown"}.`);
      // A tunnel that drops hours later leaves the link dead, and the settings
      // screen is polling, so say so rather than keep advertising the address.
      else if (!deliberate) {
        if (health) clearInterval(health);
        health = undefined;
        status = { state: "error", error: `The tunnel stopped with exit code ${code ?? "unknown"}.` };
      }
    });
  });
}

/**
 * Pull the hostname out of cloudflared's output.
 *
 * The surrounding banner is Cloudflare's to change at any time, so only the
 * hostname is matched. It is the one part that cannot change without the
 * feature changing with it.
 */
export function findTunnelUrl(log: string): string | undefined {
  return /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(log)?.[0];
}

/**
 * GitHub publishes no checksum beside these assets, so HTTPS to github.com is
 * the trust boundary. The download lands on a temporary name and is moved into
 * place only once complete, so an interrupted download is never mistaken for a
 * usable binary on the next attempt.
 */
async function ensureCloudflared(binDir: string, onProgress: (message: string) => void): Promise<string> {
  const binary = join(binDir, "cloudflared.exe");
  const cached = await stat(binary).catch(() => undefined);
  if (cached?.isFile() && cached.size > 0) return binary;

  onProgress("Downloading the tunnel client…");
  await mkdir(binDir, { recursive: true });
  const partial = `${binary}.partial`;

  const abort = new AbortController();
  let stall = setTimeout(() => abort.abort(), DOWNLOAD_STALL_MS);

  try {
    const response = await fetch(RELEASE_URL, { signal: abort.signal });
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
      clearTimeout(stall);
      stall = setTimeout(() => abort.abort(), DOWNLOAD_STALL_MS);
      received += chunk.length;
      if (total <= 0) return;
      const percent = Math.round((received / total) * 100);
      if (percent === shown) return;
      shown = percent;
      onProgress(`Downloading the tunnel client… ${percent}%`);
    });

    await pipeline(source, createWriteStream(partial));
    // A body that ends early still ends cleanly, so the length is the only
    // thing separating a whole binary from a half of one.
    if (total > 0 && received !== total) {
      throw new Error("The tunnel client download ended before it was complete.");
    }
    await rm(binary, { force: true });
    await rename(partial, binary);
    return binary;
  } catch (error) {
    await rm(partial, { force: true }).catch(() => {});
    if (abort.signal.aborted) {
      throw new Error("The tunnel client download stopped responding. Check this computer's connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(stall);
  }
}
