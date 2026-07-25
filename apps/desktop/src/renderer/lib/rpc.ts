import type { NativePiApi } from "../../preload/index.ts";
import type { HostRequestName, HostRequests } from "../../shared/rpc-schema.ts";

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
    nativepi: NativePiApi;
  }
}

const api = window.nativepi;

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
    return (params: unknown) => api.invoke(channel as HostRequestName, params as never);
  },
});

export const rpc = {
  request,
  events: api.events,
};
