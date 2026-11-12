import { afterEach, expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import type { AppState } from "./types.ts";
const domTest = test.skipIf(typeof document === "undefined");
const originalUUID = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
afterEach(() => {
  if (originalUUID) Object.defineProperty(crypto, "randomUUID", originalUUID);
  else delete (crypto as { randomUUID?: unknown }).randomUUID;
});
domTest("HTTP LAN auth attempts keep distinct host-compatible flow IDs without randomUUID", async () => {
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
  const store = createStore<AppState>()(createAppState);
  store.setState({ activeProjectPath: "/p", activeSessionFile: "a" });
  const replies: ((value: any) => void)[] = [], requests: any[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "login") { requests.push(params); return new Promise(resolve => replies.push(resolve)); }
    return { ok: true };
  });
  const first = store.getState().startLogin("p", "oauth");
  const old = store.getState().authFlow!.flowId!; store.getState().cancelLogin();
  const second = store.getState().startLogin("p", "oauth");
  const current = store.getState().authFlow!.flowId!;
  expect(old).not.toBe(current);
  for (const flow of [old, current]) { expect(flow.length).toBeGreaterThan(0); expect(flow.length).toBeLessThanOrEqual(128); }
  expect(requests.map(params => params.flowId)).toEqual([old, current]);
  replies[0]({ ok: true }); await first;
  expect(store.getState().authFlow?.flowId).toBe(current);
  replies[1]({ ok: false, error: "fixture cancellation" }); await second;
  expect(store.getState().authFlow?.error).toBe("fixture cancellation");
});
