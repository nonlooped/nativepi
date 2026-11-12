import type { NativePiApi } from "../../preload/index.ts";
import { validHostEvent } from "../../shared/host-events.ts";
import { hostEventKeys, type HostEventName } from "../../shared/rpc-schema.ts";
import { z } from "zod";
const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("response"), id: z.string(), result: z.unknown().optional(), error: z.string().optional() }),
  z.object({ type: z.literal("event"), name: z.string(), payload: z.unknown() }),
]);
export function createRemoteApi(options: {
  url: string;
  token: string | null;
  createSocket: (url: string) => WebSocket;
  reload: () => void;
  reportError?: (error: unknown) => void;
  handshakeMs?: number;
}): NativePiApi & {
  dispose(): void;
} {
  let disposed = false;
  let stopConnection: ((error: Error) => void) | undefined;
  let socket: WebSocket | undefined;
  let authenticated: WebSocket | undefined;
  let connecting: Promise<WebSocket> | undefined;
  let connectedOnce = false;
  let nextId = 0;
  let delay = 500;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  const listeners = new Map<HostEventName, Set<(payload: never) => void>>();
  function connect(): Promise<WebSocket> {
    if (disposed)
      return Promise.reject(new Error("Transport disposed"));
    if (!options.token)
      return Promise.reject(new Error("This NativePi link is missing its access token."));
    if (authenticated && authenticated.readyState === 1)
      return Promise.resolve(authenticated);
    if (connecting)
      return connecting;
    const task = new Promise<WebSocket>((resolve, reject) => {
      const next = options.createSocket(options.url);
      socket = next;
      let finished = false;
      const fail = (error: Error) => {
        if (finished)
          return;
        finished = true;
        clearTimeout(handshake);
        if (socket !== next)
          return;
        authenticated = undefined;
        socket = undefined;
        connecting = undefined;
        reject(error);
        for (const item of pending.values())
          item.reject(error);
        pending.clear();
        clearTimeout(retry);
        if (!disposed)
          retry = setTimeout(() => { void connect().catch(() => { }); }, delay);
        delay = Math.min(delay * 2, 10000);
        next.close();
      };
      stopConnection = fail;
      const handshake = setTimeout(() => fail(new Error("NativePi authentication timed out.")), options.handshakeMs ?? 10000);
      next.addEventListener("open", () => {
        try {
          next.send(JSON.stringify({ type: "auth", token: options.token }));
        }
        catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
      next.addEventListener("error", () => fail(new Error("NativePi could not connect to the desktop server.")));
      next.addEventListener("close", () => fail(new Error("The NativePi desktop server disconnected.")));
      next.addEventListener("message", event => {
        if (socket !== next || finished)
          return;
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data));
        }
        catch {
          return;
        }
        const parsed = messageSchema.safeParse(raw);
        if (!parsed.success)
          return;
        const message = parsed.data;
        if (message.type === "ready") {
          if (authenticated === next)
            return;
          clearTimeout(handshake);
          authenticated = next;
          delay = 500;
          resolve(next);
          if (connectedOnce)
            options.reload();
          connectedOnce = true;
          return;
        }
        if (authenticated !== next)
          return;
        if (message.type === "response") {
          const item = pending.get(message.id);
          if (!item)
            return;
          pending.delete(message.id);
          if (message.error)
            item.reject(new Error(message.error));
          else
            item.resolve(message.result);
          return;
        }
        if (validHostEvent(message.name, message.payload))
          for (const listener of listeners.get(message.name as HostEventName) ?? []) {
            try {
              listener(message.payload as never);
            }
            catch (error) {
              options.reportError?.(error);
            }
          }
      });
    });
    connecting = task;
    void task.catch(() => {
      if (connecting === task)
        connecting = undefined;
    });
    return task;
  }
  return {
    dispose() { disposed = true; clearTimeout(retry); stopConnection?.(new Error("Transport disposed")); },
    filePath: () => "",
    async invoke(channel, params) {
      const active = await connect();
      if (active !== authenticated || active.readyState !== 1)
        throw new Error("The NativePi desktop server disconnected.");
      const id = String(++nextId);
      return await new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          active.send(JSON.stringify({ type: "request", id, name: channel, params }));
        }
        catch (error) {
          pending.delete(id);
          reject(error);
        }
      }) as never;
    },
    events: {
      on(channel, listener) {
        if (!Object.hasOwn(hostEventKeys, channel))
          throw new Error(`Unknown host event: ${channel}`);
        const set = listeners.get(channel) ?? new Set();
        set.add(listener as (payload: never) => void);
        listeners.set(channel, set);
        void connect().catch(() => { });
        return () => { set.delete(listener as (payload: never) => void); };
      }
    },
  };
}
