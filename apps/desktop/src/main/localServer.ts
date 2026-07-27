import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server as HttpServer,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { networkInterfaces } from "node:os";
import { extname, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import type {
  HostEventName,
  HostEvents,
  HostRequestName,
  HostRequests,
  LocalServerStatus,
} from "../shared/rpc-schema.ts";

type Invoke = <K extends HostRequestName>(
  name: K,
  params: HostRequests[K]["params"],
) => Promise<HostRequests[K]["response"]>;
type Subscribe = (listener: <K extends HostEventName>(name: K, payload: HostEvents[K]) => void) => () => void;

export interface LocalServerOptions {
  rendererDir: string;
  rendererUrl?: string;
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
  watchSession: { ok: true },
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
  startLocalServer: {
    running: true,
    links: [],
    error: "The local server can only be managed from the desktop app.",
  },
  stopLocalServer: { ok: false },
};

type RunningServer = {
  http: HttpServer;
  webSockets: WebSocketServer[];
  sockets: Set<WebSocket>;
  unsubscribe: () => void;
  links: string[];
};

let running: RunningServer | undefined;

export function localServerStatus(): LocalServerStatus {
  return { running: Boolean(running), links: running?.links ?? [] };
}

export async function startLocalServer(options: LocalServerOptions): Promise<LocalServerStatus> {
  if (running) return localServerStatus();

  const token = randomBytes(24).toString("base64url");
  const sockets = new Set<WebSocket>();
  const rpcWebSockets = new WebSocketServer({ noServer: true, maxPayload: 70 * 1024 * 1024 });
  const devWebSockets = options.rendererUrl ? new WebSocketServer({ noServer: true }) : undefined;
  const http = createServer((request, response) => {
    void serveRenderer(request.url ?? "/", response, options).catch(() => {
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
    if (options.rendererUrl && devWebSockets) {
      proxyRendererWebSocket(request, socket, head, options.rendererUrl, devWebSockets, sockets);
      return;
    }
    socket.destroy();
  });

  rpcWebSockets.on("connection", (socket) => {
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
          sockets.add(socket);
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
      sockets.delete(socket);
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
    http.listen(0, "0.0.0.0");
  });

  if (!http.address() || typeof http.address() === "string") {
    http.close();
    throw new Error("NativePi could not determine the local server address.");
  }
  const links = localAddresses().map((address) => `http://${address}:${addressPort(http)}/#token=${token}`);
  const unsubscribe = options.subscribe((name, payload) => {
    const message = JSON.stringify({ type: "event", name, payload });
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  });

  running = {
    http,
    webSockets: devWebSockets ? [rpcWebSockets, devWebSockets] : [rpcWebSockets],
    sockets,
    unsubscribe,
    links,
  };
  return localServerStatus();
}

export async function stopLocalServer(): Promise<void> {
  const server = running;
  running = undefined;
  if (!server) return;
  server.unsubscribe();
  for (const socket of server.sockets) {
    socket.close(1001, "Server stopped");
    socket.terminate();
  }
  for (const webSockets of server.webSockets) webSockets.close();
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
      Boolean(entry && entry.family === "IPv4" && !entry.internal),
    )
    .map((entry) => entry.address);
  const unique = [...new Set(addresses)];
  unique.sort((a, b) => privateAddressRank(a) - privateAddressRank(b) || a.localeCompare(b));
  return unique.length > 0 ? unique : ["127.0.0.1"];
}

function privateAddressRank(address: string): number {
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  const second = Number(address.split(".")[1]);
  if (address.startsWith("172.") && second >= 16 && second <= 31) return 2;
  return 3;
}

async function serveRenderer(
  urlValue: string,
  response: import("node:http").ServerResponse,
  options: LocalServerOptions,
): Promise<void> {
  if (options.rendererUrl) {
    await proxyRenderer(urlValue, response, options.rendererUrl);
    return;
  }

  const pathname = decodeURIComponent(new URL(urlValue, "http://nativepi.local").pathname);
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
  response.setHeader("Content-Type", contentType(file));
  response.setHeader("Cache-Control", extname(file) ? "no-cache" : "no-store");
  response.writeHead(200);
  response.end(content);
}

function proxyRenderer(
  urlValue: string,
  response: import("node:http").ServerResponse,
  rendererUrl: string,
): Promise<void> {
  return new Promise((resolveProxy, rejectProxy) => {
    const target = new URL(urlValue, rendererUrl);
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = send(target, { headers: { host: target.host } }, (upstreamResponse) => {
      if (String(upstreamResponse.headers["content-type"]).includes("text/html")) {
        const chunks: Buffer[] = [];
        upstreamResponse.on("data", (chunk: Buffer) => chunks.push(chunk));
        upstreamResponse.on("end", () => {
          const nonce = randomBytes(18).toString("base64url");
          const html = secureViteHtml(Buffer.concat(chunks).toString("utf8"), nonce);
          const headers = { ...upstreamResponse.headers };
          delete headers["content-length"];
          response.writeHead(upstreamResponse.statusCode ?? 502, headers);
          response.end(html);
          resolveProxy();
        });
        return;
      }
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
      upstreamResponse.on("end", resolveProxy);
    });
    upstream.on("error", rejectProxy);
    upstream.end();
  });
}

function secureViteHtml(html: string, nonce: string): string {
  return html
    .replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
    .replace(/<script(?![^>]*\bsrc=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`);
}

/**
 * Development serves the renderer through Vite. Its HMR client connects back
 * to the page origin, so upgrades other than `/rpc` must follow the HTTP proxy
 * to Vite as well; production assets contain no HMR client.
 */
function proxyRendererWebSocket(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  rendererUrl: string,
  server: WebSocketServer,
  sockets: Set<WebSocket>,
): void {
  server.handleUpgrade(request, socket, head, (client) => {
    sockets.add(client);
    const target = new URL(request.url ?? "/", rendererUrl);
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
    const requested = request.headers["sec-websocket-protocol"];
    const protocols = requested
      ?.split(",")
      .map((protocol) => protocol.trim())
      .filter(Boolean);
    const upstream = new WebSocket(target, protocols);
    sockets.add(upstream);
    const queued: { data: RawData; binary: boolean }[] = [];

    client.on("message", (data, binary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
      else if (upstream.readyState === WebSocket.CONNECTING) queued.push({ data, binary });
    });
    upstream.on("open", () => {
      for (const message of queued) upstream.send(message.data, { binary: message.binary });
      queued.length = 0;
    });
    upstream.on("message", (data, binary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary });
    });

    const close = (peer: WebSocket, code: number, reason: Buffer) => {
      if (peer.readyState !== WebSocket.OPEN) return;
      if (code === 1005) peer.terminate();
      else peer.close(code, reason);
    };
    client.on("close", (code, reason) => {
      sockets.delete(client);
      close(upstream, code, reason);
    });
    upstream.on("close", (code, reason) => {
      sockets.delete(upstream);
      close(client, code, reason);
    });
    client.on("error", () => upstream.terminate());
    upstream.on("error", () => client.terminate());
  });
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
