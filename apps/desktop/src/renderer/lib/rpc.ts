import type { NativePiApi } from "../../preload/index.ts";
import { createRemoteApi } from "./remoteTransport.ts";
import { z } from "zod";
import type { HostRequestName, HostRequests, } from "../../shared/rpc-schema.ts";
// The browser renderer runs under a strict CSP. Zod's default object-schema
// fast path probes and uses `new Function`, which browsers correctly reject
// without `unsafe-eval`; the interpreter keeps the same validation semantics.
z.config({ jitless: true });
declare global {
  interface Window {
    nativepi?: NativePiApi;
  }
}
export const isRemote = !window.nativepi;
const api = window.nativepi ?? browserApi();
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
function browserApi(): NativePiApi {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const url = new URL("/rpc", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  url.hash = "";
  const port = params.get("rpcPort");
  if (port)
    url.port = port;
  return createRemoteApi({ url: String(url), token: params.get("token"), createSocket: url => new WebSocket(url), reload: () => window.location.reload(), reportError: console.error });
}
