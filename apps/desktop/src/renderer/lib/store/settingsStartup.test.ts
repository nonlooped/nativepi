import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { nativePiStateSchema } from "../../../shared/rpc-schema.ts";
import { createAppState } from "../store.ts";
import type { AppState } from "./types.ts";
import { stubInvoke } from "./testBridge.ts";

for (const fails of [false, true]) {
  test(`local settings start before workspace restoration and ${fails ? "failure" : "a slow read"} does not block it`, async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const calls: string[] = [];
    stubInvoke(async channel => {
      calls.push(channel);
      if (channel === "getPiSettings") {
        await pending;
        if (fails) throw new Error("Settings unreadable");
        return { error: "Settings not available" };
      }
      if (channel === "loadState") return nativePiStateSchema.parse({ destination: "work", reopenLastProject: false, focusStartedAt: "2026-11-14T00:00:00Z" });
      if (channel === "chatWorkspace") return { path: "/chat" };
      if (channel === "workWorkspace") return { path: "/work" };
      if (channel === "listProviders") return { providers: [] };
      return { ok: true };
    });
    const store = createStore<AppState>()(createAppState);
    store.setState({ onUpdateState: () => {} });
    await store.getState().init();
    expect(calls.slice(0, 2)).toEqual(["getPiSettings", "loadState"]);
    expect(store.getState().ready).toBe(true);
    expect(store.getState().piSettings).toBeNull();
    finish();
    // Drain the RPC validation and settings action's continuation.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.getState().piSettingsError).toContain(fails ? "Settings unreadable" : "Settings not available");
  });
}
