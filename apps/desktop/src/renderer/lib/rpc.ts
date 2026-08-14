import type { NativePiApi } from "../../preload/index.ts";
import { z } from "zod";
import type {
  HostEventName,
  HostEvents,
  HostRequestName,
  HostRequests,
} from "../../shared/rpc-schema.ts";

// The browser renderer runs under a strict CSP. Zod's default object-schema
// fast path probes and uses `new Function`, which browsers correctly reject
// without `unsafe-eval`; the interpreter keeps the same validation semantics.
z.config({ jitless: true });

/**
 * Transport only.
 *
 * This module deliberately knows nothing about the store. It used to subscribe
 * host events to store actions here, which made `rpc -> store -> slices -> rpc`
 * a cycle that only worked because of the order modules happened to load in.
 * The subscriptions now live in the store's composition root.
 */

declare global {
  interface Window {
    nativepi?: NativePiApi;
  }
}

export const isRemote = !window.nativepi;
const api = window.nativepi ?? createRemoteApi();

/**
 * `rpc.request.someCall(params)` over the bridge's single `invoke`.
 *
 * The Proxy has to be built here rather than in the preload: contextBridge
 * clones the object it exposes, which strips the traps. Because every property
 * access resolves to an invoke of that same name, a channel added to
 * `HostRequests` works the moment its handler exists — there is no second list
 * to keep in step.
 */
type RequestApi = {
  [K in HostRequestName]: (params: HostRequests[K]["params"]) => Promise<HostRequests[K]["response"]>;
};

const request = new Proxy({} as RequestApi, {
  get(_target, channel: string) {
    if (isRemote && channel === "openExternal") {
      return ({ url }: HostRequests["openExternal"]["params"]) => {
        window.open(url, "_blank", "noopener,noreferrer");
        return Promise.resolve({ ok: true });
      };
    }
    if (isRemote && channel === "saveImage") {
      return ({ data, mimeType, suggestedName }: HostRequests["saveImage"]["params"]) => {
        const download = document.createElement("a");
        download.href = `data:${mimeType};base64,${data}`;
        download.download = suggestedName;
        download.click();
        return Promise.resolve({ ok: true });
      };
    }
    return (params: unknown) => api.invoke(channel as HostRequestName, params as never);
  },
});

export const rpc = {
  request,
  events: api.events,
  filePath: (file: File) => api.filePath(file),
};

const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({
    type: z.literal("response"),
    id: z.string(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("event"),
    name: z.string(),
    payload: z.unknown(),
  }),
]);

const allowedEvents: Record<HostEventName, true> = {
  piStatus: true,
  piEvent: true,
  piError: true,
  sessionChangedExternally: true,
  sessionsChanged: true,
  projectFilesChanged: true,
  authPrompt: true,
  authNotice: true,
  windowMaximized: true,
  updateState: true,
  quitRequested: true,
  terminalData: true,
  terminalExit: true,
  terminalRestart: true,
  tuiFrame: true,
};

function createRemoteApi(): NativePiApi {
  const linkParams = new URLSearchParams(window.location.hash.slice(1));
  const token = linkParams.get("token");
  const rpcPort = linkParams.get("rpcPort");
  let nextRequestId = 0;
  let socket: WebSocket | undefined;
  let connection: Promise<WebSocket> | undefined;
  let connectedOnce = false;
  let retryDelay = 500;
  let retryTimer: number | undefined;
  const pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  const listeners = new Map<HostEventName, Set<(payload: never) => void>>();

  const connect = (): Promise<WebSocket> => {
    if (!token) return Promise.reject(new Error("This NativePi link is missing its access token."));
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (connection) return connection;

    connection = new Promise<WebSocket>((resolveConnection, rejectConnection) => {
      const rpcUrl = new URL("/rpc", window.location.href);
      rpcUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      rpcUrl.hash = "";
      if (rpcPort) rpcUrl.port = rpcPort;
      const next = new WebSocket(rpcUrl);
      socket = next;
      let ready = false;

      next.addEventListener("open", () => {
        next.send(JSON.stringify({ type: "auth", token }));
      });
      next.addEventListener("message", (event) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const parsed = serverMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "ready") {
          ready = true;
          retryDelay = 500;
          resolveConnection(next);
          if (connectedOnce) window.location.reload();
          connectedOnce = true;
          return;
        }
        if (message.type === "response") {
          const request = pending.get(message.id);
          if (!request) return;
          pending.delete(message.id);
          if (message.error) request.reject(new Error(message.error));
          else request.resolve(message.result);
          return;
        }
        if (Object.hasOwn(allowedEvents, message.name)) {
          for (const listener of listeners.get(message.name as HostEventName) ?? []) {
            listener(message.payload as never);
          }
        }
      });
      next.addEventListener("error", () => {
        if (!ready) rejectConnection(new Error("NativePi could not connect to the desktop server."));
      });
      next.addEventListener("close", () => {
        const error = new Error("The NativePi desktop server disconnected.");
        if (!ready) rejectConnection(error);
        for (const request of pending.values()) request.reject(error);
        pending.clear();
        socket = undefined;
        connection = undefined;
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
          void connect().catch(() => {});
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10_000);
      });
    });
    return connection;
  };

  return {
    // A browser hands over bytes, never a path, so every drop that depends on
    // one is inert here and the callers fall back to what a `File` can do.
    filePath: () => "",
    async invoke(channel, params) {
      const activeSocket = await connect();
      // `crypto.randomUUID` is restricted to secure contexts in Firefox, while
      // a LAN URL is intentionally plain HTTP. IDs only correlate responses on
      // this socket, so a monotonic per-page value is sufficient.
      const id = String(++nextRequestId);
      return await new Promise<unknown>((resolveRequest, rejectRequest) => {
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
        activeSocket.send(JSON.stringify({ type: "request", id, name: channel, params }));
      }) as never;
    },
    events: {
      on(channel, listener) {
        const channelListeners = listeners.get(channel) ?? new Set<(payload: never) => void>();
        channelListeners.add(listener as (payload: never) => void);
        listeners.set(channel, channelListeners);
        void connect().catch(() => {});
        return () => channelListeners.delete(listener as (payload: never) => void);
      },
    },
  };
}
