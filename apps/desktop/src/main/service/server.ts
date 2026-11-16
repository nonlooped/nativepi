import { attachBrowserDesktop } from "../browser/relay.ts";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { SERVICE_PROTOCOL, serviceMessageSchema } from "../../shared/background-service.ts";
import type { HostEventName, HostEvents, HostRequestName, HostRequests } from "../../shared/rpc-schema.ts";
import { sendHostEvent } from "../localServer.ts";
import { validateHostRequest } from "../../shared/request-params.ts";
import type { HostClient } from "../ipc.ts";

/** Private desktop transport. Deliberately separate from user-revocable Local Access. */
export async function serveHost(options: {
  createClient: () => HostClient;
  invoke: <K extends HostRequestName>(name: K, params: HostRequests[K]["params"], client: HostClient) => Promise<HostRequests[K]["response"]>;
  subscribe: (listener: <K extends HostEventName>(name: K, payload: HostEvents[K]) => void) => () => void;
  stop: () => Promise<void>;
}) {
  const token = randomBytes(32).toString("base64url");
  const http = createServer((_req, res) => { res.writeHead(404); res.end(); });
  const sockets = new WebSocketServer({ server: http, path: "/host", maxPayload: 70 * 1024 * 1024 });
  sockets.on("connection", socket => {
    let client: HostClient | undefined;
    let compatible = false;
    let detachBrowser: (() => void) | undefined;
    const browserPending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
    const timeout = setTimeout(() => socket.close(1008, "Authentication required"), 5000);
    const unsubscribe = options.subscribe((name, payload) => {
      if (client) sendHostEvent(socket, JSON.stringify({ type: "event", name, payload }));
    });
    socket.on("error", () => socket.terminate());
    socket.once("close", () => { clearTimeout(timeout); unsubscribe(); client?.dispose(); detachBrowser?.(); for (const pending of browserPending.values()) pending.reject(new Error("Browser desktop disconnected.")); browserPending.clear(); });
    socket.on("message", data => { void (async () => {
      let raw: unknown;
      try { raw = JSON.parse(String(data)); } catch { socket.close(1008, "Invalid message"); return; }
      const parsed = serviceMessageSchema.safeParse(raw);
      if (!parsed.success) { socket.close(1008, "Invalid message"); return; }
      const message = parsed.data;
      if (!client) {
        if (message.type !== "auth") { socket.close(1008, "Authentication required"); return; }
        const supplied = Buffer.from(message.token);
        const expected = Buffer.from(token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { socket.close(1008, "Authentication failed"); return; }
        compatible = message.protocol === SERVICE_PROTOCOL;
        clearTimeout(timeout);
        client = options.createClient();
        socket.send(JSON.stringify({ type: "ready", compatible }));
        return;
      }
      if (message.type === "auth") { socket.close(1008, "Already authenticated"); return; }
      if (message.type === "browserAttach") {
        if (!compatible || detachBrowser) return;
        detachBrowser = attachBrowserDesktop(command => new Promise((resolve, reject) => {
          const timer = setTimeout(() => { browserPending.delete(command.id); reject(new Error("Browser desktop timed out.")); }, 25000);
          browserPending.set(command.id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
          socket.send(JSON.stringify(command));
        }));
        socket.send(JSON.stringify({ type: "response", id: message.id, result: { ok: true } }));
        return;
      }
      if (message.type === "browserReply") {
        const pending = browserPending.get(message.id); browserPending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error)); else pending?.resolve(message.result);
        return;
      }
      try {
        if (message.type === "stop") {
          // Respond after shutdown drains Pi sessions and credentials. No restart
          // or resubmission is performed by this endpoint.
          await options.stop();
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "response", id: message.id, result: { ok: true } }));
          return;
        }
        if (!compatible) throw new Error("Host protocol incompatible; stop the old service explicitly");
        const name = message.name as HostRequestName;
        const params = validateHostRequest(name, message.params);
        const result = await options.invoke(name, params as never, client);
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "response", id: message.id, result }));
      } catch (error) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "response", id: message.id, error: error instanceof Error ? error.message : "Host request failed" }));
      }
    })().catch(() => socket.close(1011, "Host request failed")); });
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", () => { http.off("error", reject); resolve(); });
  });
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Host did not bind loopback");
  return { port: address.port, token, close: async () => {
    for (const socket of sockets.clients) socket.terminate();
    await new Promise<void>(resolve => sockets.close(() => resolve()));
    await new Promise<void>(resolve => http.close(() => resolve()));
  } };
}
