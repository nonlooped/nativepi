import { afterEach, expect, test } from "bun:test";
import { createStore, type StoreApi } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import { flushPersist, persist, runtime } from "./internals.ts";
import type { AppState } from "./types.ts";
const stores: StoreApi<AppState>[] = [];
function fixture() { const store = createStore<AppState>()(createAppState); store.setState({ onUpdateState: () => {} }); stores.push(store); return store; }
afterEach(() => { for (const store of stores.splice(0)) clearTimeout(runtime(store.getState).saveTimer); });
test("unloading a fresh store cannot overwrite the saved workspace before initialization", async () => {
  const store = fixture();
  const writes: unknown[] = [];
  stubInvoke(async (channel, params) => { if (channel === "saveState") writes.push(params); return { ok: true }; });
  await flushPersist(store.getState);
  expect(writes).toEqual([]);
});
test("pre-initialization changes cannot schedule a workspace overwrite", () => {
  const store = fixture();
  persist(store.getState);
  expect(runtime(store.getState).saveTimer).toBeUndefined();
});
test("initialized workspaces still save explicit project removals and chat organization", async () => {
  const store = fixture(); const writes: any[] = [];
  stubInvoke(async (channel, params) => { if (channel === "saveState") writes.push(params); return { ok: true }; });
  store.setState({ ready: true, projects: [], focusStartedAt: "2026-01-01T00:00:00.000Z", focusedChats: ["chat"] });
  await flushPersist(store.getState);
  expect(writes).toHaveLength(1);
  expect(writes[0].state).toMatchObject({ projects: [], focusedChats: ["chat"], focusStartedAt: "2026-01-01T00:00:00.000Z" });
});

test("reload during a pending state read preserves projects and the original chat cutoff", async () => {
  const { nativePiStateSchema } = await import("../../../shared/rpc-schema.ts");
  const saved = nativePiStateSchema.parse({ projects: [{ path: "/work", name: "Work" }], focusStartedAt: "2026-01-01T00:00:00.000Z", focusedChats: ["chat"] });
  const pending = Promise.withResolvers<typeof saved>();
  const writes: unknown[] = [];
  const store = fixture();
  stubInvoke(async (channel, params) => {
    if (channel === "loadState") return pending.promise;
    if (channel === "saveState") writes.push(params);
    if (channel === "listProviders") return { providers: [] };
    return { status: "unsupported", channel: "stable" };
  });
  const init = store.getState().init();
  await flushPersist(store.getState);
  expect(writes).toEqual([]);
  pending.resolve(saved); await init;
  expect(store.getState().projects).toEqual(saved.projects);
  expect(store.getState().focusStartedAt).toBe(saved.focusStartedAt!);
  expect(store.getState().focusedChats).toEqual(["chat"]);
});
test("a retired hot-reload store cannot save even after an old async callback completes", async () => {
  const store = fixture(); const writes: unknown[] = [];
  stubInvoke(async (channel, params) => { if (channel === "saveState") writes.push(params); return { ok: true }; });
  store.setState({ ready: true });
  runtime(store.getState).disposed = true;
  persist(store.getState);
  await flushPersist(store.getState);
  expect(writes).toEqual([]);
});
