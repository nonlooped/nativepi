import { createServer, type Server as HttpServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type {
  AccessClient,
  HostEventName,
  HostEvents,
  HostRequestName,
  HostRequests,
  LocalAccessStatus,
} from "../shared/rpc-schema.ts";

type Invoke = <K extends HostRequestName>(
  name: K,
  params: HostRequests[K]["params"],
) => Promise<HostRequests[K]["response"]>;
type Subscribe = (listener: <K extends HostEventName>(name: K, payload: HostEvents[K]) => void) => () => void;

export interface LocalServerOptions {
  rendererDir: string;
  invoke: Invoke;
  subscribe: Subscribe;
}

const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth"), token: z.string() }),
  z.object({
    type: z.literal("request"),
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    params: z.unknown(),
  }),
]);

const desktopOnlyResponses: Partial<Record<HostRequestName, unknown>> = {
  pickProject: { path: null },
  importSession: { ok: false, canceled: true },
  windowMinimize: { ok: false },
  windowToggleMaximize: { maximized: false },
  windowClose: { ok: false },
  confirmQuit: { ok: false },
  windowIsMaximized: { maximized: false },
  openExternal: { ok: false },
  listEditors: { editors: [] },
  openProjectIn: { ok: false, error: "This action is only available in the desktop app." },
  openFileIn: { ok: false, error: "This action is only available in the desktop app." },
  showInFolder: { ok: false },
  saveImage: { ok: false, error: "Save this image from the browser instead." },
  updateState: { status: "unsupported" },
  checkForUpdate: { status: "unsupported" },
  downloadUpdate: { ok: false, error: "Updates can only be managed from the desktop app." },
  installUpdate: { ok: false, error: "Updates can only be managed from the desktop app." },
  accessStatus: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  startLocalAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  stopLocalAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  replaceAccessLink: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  startRemoteAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  stopRemoteAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
};

type RunningServer = {
  http: HttpServer;
  rpcWebSockets: WebSocketServer;
  rpcSockets: Set<WebSocket>;
  authenticatedRpcSockets: Set<WebSocket>;
  clients: Map<WebSocket, AccessClient>;
  unsubscribe: () => void;
  localNetwork: boolean;
  links: string[];
  port: number;
  token: string;
};

let running: RunningServer | undefined;

const gzipAsync = promisify(gzip);

export function localServerStatus(): LocalAccessStatus {
  return {
    running: Boolean(running?.localNetwork),
    link: running?.localNetwork ? running.links[0] : undefined,
    links: running?.localNetwork ? running.links : [],
    clients: running ? [...running.clients.values()] : [],
  };
}

export function localServerConnection(): { port: number; token: string } | undefined {
  return running ? { port: running.port, token: running.token } : undefined;
}

export async function startLocalServer(
  options: LocalServerOptions,
  localNetwork = true,
): Promise<LocalAccessStatus> {
  if (running?.localNetwork === localNetwork) return localServerStatus();
  if (running) await stopLocalServer();

  const token = randomBytes(24).toString("base64url");
  const rpcSockets = new Set<WebSocket>();
  const authenticatedRpcSockets = new Set<WebSocket>();
  const clients = new Map<WebSocket, AccessClient>();
  const rpcWebSockets = new WebSocketServer({ noServer: true, maxPayload: 70 * 1024 * 1024 });
  const http = createServer((request, response) => {
    void serveRenderer(request, response, options).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end("NativePi could not serve this page.");
    });
  });

  http.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://nativepi.local");
    if (url.pathname === "/rpc") {
      rpcWebSockets.handleUpgrade(request, socket, head, (webSocket) => {
        rpcWebSockets.emit("connection", webSocket, request);
      });
      return;
    }
    socket.destroy();
  });

  rpcWebSockets.on("connection", (socket, request) => {
    rpcSockets.add(socket);
    let authenticated = false;
    const authTimer = setTimeout(() => socket.close(1008, "Authentication required"), 5000);

    socket.on("message", (raw) => {
      void (async () => {
        let parsed: z.infer<typeof clientMessageSchema>;
        try {
          parsed = clientMessageSchema.parse(JSON.parse(raw.toString()));
        } catch {
          socket.close(1003, "Invalid message");
          return;
        }

        if (!authenticated) {
          if (parsed.type !== "auth" || !tokensMatch(parsed.token, token)) {
            socket.close(1008, "Invalid access token");
            return;
          }
          authenticated = true;
          clearTimeout(authTimer);
          authenticatedRpcSockets.add(socket);
          clients.set(socket, clientFromRequest(request));
          socket.send(JSON.stringify({ type: "ready" }));
          return;
        }

        if (parsed.type !== "request") return;
        const name = parsed.name as HostRequestName;
        try {
          const result = Object.hasOwn(desktopOnlyResponses, name)
            ? desktopOnlyResponses[name]
            : await options.invoke(name, (parsed.params ?? {}) as never);
          socket.send(JSON.stringify({ type: "response", id: parsed.id, result }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          socket.send(JSON.stringify({ type: "response", id: parsed.id, error: message }));
        }
      })();
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      rpcSockets.delete(socket);
      authenticatedRpcSockets.delete(socket);
      clients.delete(socket);
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      http.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      http.off("error", onError);
      resolveListen();
    };
    http.once("error", onError);
    http.once("listening", onListening);
    http.listen(0, localNetwork ? "::" : "127.0.0.1");
  });

  if (!http.address() || typeof http.address() === "string") {
    http.close();
    throw new Error("NativePi could not determine the local server address.");
  }
  const port = addressPort(http);
  const links = localNetwork
    ? localAddresses().map((address) => `http://${formatAddress(address)}:${port}/#token=${token}`)
    : [];
  const unsubscribe = options.subscribe((name, payload) => {
    const message = JSON.stringify({ type: "event", name, payload });
    for (const socket of authenticatedRpcSockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  });

  running = {
    http,
    rpcWebSockets,
    rpcSockets,
    authenticatedRpcSockets,
    clients,
    unsubscribe,
    localNetwork,
    links,
    port,
    token,
  };
  return localServerStatus();
}

export async function stopLocalServer(): Promise<void> {
  const server = running;
  running = undefined;
  if (!server) return;
  server.unsubscribe();
  for (const socket of server.rpcSockets) {
    socket.close(1001, "Server stopped");
    socket.terminate();
  }
  server.rpcWebSockets.close();
  server.http.closeAllConnections();
  await new Promise<void>((resolveClose) => server.http.close(() => resolveClose()));
}

function tokensMatch(value: string, expected: string): boolean {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function addressPort(server: HttpServer): number {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local server is not listening.");
  return address.port;
}

function localAddresses(): string[] {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry): entry is NonNullable<typeof entry> =>
      Boolean(entry && !entry.internal),
    )
    .map((entry) => entry.address);
  const unique = [...new Set(addresses)];
  unique.sort((a, b) => privateAddressRank(a) - privateAddressRank(b) || a.localeCompare(b));
  return unique.length > 0 ? unique : ["127.0.0.1"];
}

function formatAddress(address: string): string {
  return address.includes(":") ? `[${address}]` : address;
}

function clientFromRequest(request: import("node:http").IncomingMessage): AccessClient {
  const socketAddress = normalizeAddress(request.socket.remoteAddress);
  // Everything through the tunnel arrives from cloudflared on loopback, so the
  // host header is what separates a browser on the sofa from one on the Wi-Fi.
  const remote = isLoopback(socketAddress) && isTunnelHost(request.headers.host);
  // Cloudflare sets `CF-Connecting-IP` to the real client and appends to
  // `X-Forwarded-For`; neither is trustworthy on the local network, which is
  // why they are only read for a request that came in over the tunnel.
  const forwarded = request.headers["x-forwarded-for"];
  const forwardedAddress = header(request, "cf-connecting-ip")
    ?? (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim();
  const address = remote && forwardedAddress ? forwardedAddress : socketAddress;
  return {
    id: randomBytes(8).toString("hex"),
    address: remote && isLoopback(address) ? "Public link" : address,
    connectedAt: new Date().toISOString(),
    device: describeUserAgent(request.headers["user-agent"]),
    location: remote ? "remote" : "local",
  };
}

function isTunnelHost(host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(`http://${host}`).hostname.toLowerCase().endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

function header(request: import("node:http").IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeAddress(address: string | undefined): string {
  if (!address) return "Unknown address";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function isLoopback(address: string): boolean {
  return address === "::1" || address === "127.0.0.1";
}

function describeUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return "Browser";
  const platform =
    /iPhone/i.test(userAgent) ? "iPhone"
      : /iPad/i.test(userAgent) ? "iPad"
        : /Android/i.test(userAgent) ? "Android"
          : /Windows/i.test(userAgent) ? "Windows"
            : /Macintosh/i.test(userAgent) ? "Mac"
              : /Linux/i.test(userAgent) ? "Linux"
                : "device";
  const browser =
    /Edg\//i.test(userAgent) ? "Edge"
      : /Firefox\//i.test(userAgent) ? "Firefox"
        : /Chrome\//i.test(userAgent) ? "Chrome"
          : /Safari\//i.test(userAgent) ? "Safari"
            : "Browser";
  return `${browser} on ${platform}`;
}

function privateAddressRank(address: string): number {
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  const second = Number(address.split(".")[1]);
  if (address.startsWith("172.") && second >= 16 && second <= 31) return 2;
  return 3;
}

/**
 * Serve the built renderer.
 *
 * Two things here exist because the public link runs over a Cloudflare quick
 * tunnel, which measured at a few hundred KB/s regardless of how fast either
 * end's connection is. Bytes on that hop are the scarce resource:
 *
 * Everything under `assets/` carries a content hash in its name, so it can be
 * cached forever and a reload costs nothing. Only `index.html` is revalidated,
 * and an ETag turns that into a 304.
 *
 * Compression happens here rather than being left to Cloudflare, because the
 * edge only compresses what it sends onward to the browser. The origin hop is
 * the slow one, and the entry chunk alone is over 5 MB uncompressed.
 */
async function serveRenderer(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  options: LocalServerOptions,
): Promise<void> {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://nativepi.local").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let file = resolve(options.rendererDir, relative);
  const root = resolve(options.rendererDir);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }

  let content: Buffer;
  try {
    content = await readFile(file);
  } catch {
    file = resolve(root, "index.html");
    content = await readFile(file);
  }

  const hashed = file.startsWith(resolve(root, "assets") + sep);
  const etag = `"${createHash("sha1").update(content).digest("base64url")}"`;
  // A proxy that recompresses on the way through downgrades the tag to
  // `W/"..."`, so the prefix is ignored rather than counted as a mismatch that
  // would quietly make every revalidation a full download.
  if (request.headers["if-none-match"]?.replace(/^W\//, "") === etag) {
    response.writeHead(304).end();
    return;
  }

  response.setHeader("Content-Type", contentType(file));
  response.setHeader("ETag", etag);
  response.setHeader(
    "Cache-Control",
    hashed ? "public, max-age=31536000, immutable" : "no-cache",
  );

  if (compressible(file) && /\bgzip\b/.test(String(request.headers["accept-encoding"] ?? ""))) {
    // Async: compressing the multi-megabyte entry chunk synchronously would
    // stall the same event loop the RPC socket runs on.
    content = await gzipAsync(content);
    response.setHeader("Content-Encoding", "gzip");
    response.setHeader("Vary", "Accept-Encoding");
  }
  // Explicit length rather than chunked: the tunnel and the browser both get to
  // show real progress on the megabyte-scale entry chunk.
  response.setHeader("Content-Length", content.byteLength);
  response.writeHead(200);
  response.end(content);
}

function compressible(file: string): boolean {
  switch (extname(file)) {
    case ".html": case ".js": case ".css": case ".json": case ".svg": return true;
    default: return false;
  }
}

function contentType(file: string): string {
  switch (extname(file)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".woff2": return "font/woff2";
    default: return "application/octet-stream";
  }
}
