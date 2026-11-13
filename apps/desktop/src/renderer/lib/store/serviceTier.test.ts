import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import type { AppState } from "./types.ts";
const model = { provider: "openai", id: "model" };
const standard = { tier: "default", tiers: ["default", "priority"] };
function fixture() {
  const store = createStore<AppState>()(createAppState);
  store.setState({ activeProjectPath: "/p", activeSessionFile: "a", model });
  return store;
}
test("loads the saved tier and sends selections with the exact chat and model", async () => {
  const store = fixture(); const writes: unknown[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "setServiceTier") { writes.push(params); return { ok: true, state: { ...standard, tier: "priority" } }; }
    return { state: standard };
  });
  await store.getState().refreshServiceTier();
  expect(store.getState().serviceTier?.tier).toBe("default");
  await store.getState().setServiceTier("priority");
  expect(writes).toEqual([{ projectDir: "/p", sessionFile: "a", provider: "openai", modelId: "model", tier: "priority" }]);
  expect(store.getState().serviceTier?.tier).toBe("priority");
});
test("discards a delayed read after selecting a tier", async () => {
  const store = fixture(); const pending = Promise.withResolvers<unknown>();
  stubInvoke(async channel => channel === "getServiceTier" ? pending.promise : { ok: true, state: { ...standard, tier: "priority" } });
  const read = store.getState().refreshServiceTier();
  await store.getState().setServiceTier("priority");
  pending.resolve({ state: standard }); await read;
  expect(store.getState().serviceTier?.tier).toBe("priority");
});
test("a delayed response from another chat cannot change the visible tier", async () => {
  const store = fixture(); const pending = Promise.withResolvers<unknown>();
  stubInvoke(async () => pending.promise);
  const read = store.getState().refreshServiceTier();
  store.setState({ activeSessionFile: "b" });
  stubInvoke(async () => ({ state: { tier: "default", tiers: [] } }));
  await store.getState().refreshServiceTier();
  pending.resolve({ state: standard }); await read;
  expect(store.getState().serviceTier).toEqual({ tier: "default", tiers: [] });
});
test("failed writes retain the saved value and allow retry", async () => {
  const store = fixture();
  stubInvoke(async channel => channel === "getServiceTier" ? { state: standard } : { ok: false, error: "Chat changed externally" });
  await store.getState().refreshServiceTier();
  await store.getState().setServiceTier("priority");
  expect(store.getState().serviceTier?.tier).toBe("default");
  expect(store.getState().serviceTierError).toBe("Chat changed externally");
  expect(store.getState().serviceTierSaving).toBe(false);
  stubInvoke(async () => ({ state: standard }));
  await store.getState().refreshServiceTier();
  expect(store.getState().serviceTierError).toBeUndefined();
});
test("tier changes from Pi refresh the active chat and ignore background chats", async () => {
  const store = fixture(); let reads = 0;
  stubInvoke(async () => { reads++; return { state: { ...standard, tier: "priority" } }; });
  store.getState().onTuiFrame({ projectDir: "/p", sessionFile: "b", frame: { type: "nativepi_tui_service_tier_changed" } });
  expect(reads).toBe(0);
  store.getState().onTuiFrame({ projectDir: "/p", sessionFile: "a", frame: { type: "nativepi_tui_service_tier_changed" } });
  await Promise.resolve(); await Promise.resolve();
  expect(reads).toBe(1);
  expect(store.getState().serviceTier?.tier).toBe("priority");
});
test("pending writes do not leak a choice into a different chat", async () => {
  const store = fixture(); const pending = Promise.withResolvers<unknown>();
  stubInvoke(async () => pending.promise);
  const write = store.getState().setServiceTier("priority");
  store.setState({ activeSessionFile: "b" });
  stubInvoke(async () => ({ state: standard }));
  await store.getState().refreshServiceTier();
  pending.resolve({ ok: true, state: { ...standard, tier: "priority" } }); await write;
  expect(store.getState().serviceTier?.tier).toBe("default");
  expect(store.getState().serviceTierSaving).toBe(false);
});

test("normalizes a legacy auto snapshot before publishing it to the selector", async () => {
  const store = fixture();
  stubInvoke(async () => ({ state: { tier: "auto", tiers: ["default", "priority"] } }));
  await store.getState().refreshServiceTier();
  expect(store.getState().serviceTier?.tier).toBe("default");
});
