import { rpc } from "../rpc.ts";
import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import type { PiSettings } from "../../../shared/pi-settings.ts";
import { stubInvoke } from "./testBridge.ts";
import { createPiSettingsSlice } from "./piSettings.ts";
import type { AppState } from "./types.ts";

const base: PiSettings = {
  defaultThinkingLevel: "", steeringMode: "all", followUpMode: "all",
  autoCompaction: true, autoRetry: true, hideThinkingBlock: false,
  showCacheMissNotices: false, enableSkillCommands: true, transport: "auto",
  httpIdleTimeoutMs: 0, shellPath: "", shellCommandPrefix: "", npmCommand: "",
  enabledModels: "", defaultProjectTrust: "ask", blockImages: false,
  autoResizeImages: true, warnAnthropicExtraUsage: true,
  enableInstallTelemetry: true, enableAnalytics: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fixture() {
  const writes: ReturnType<typeof deferred<unknown>>[] = [];
  const loads: ReturnType<typeof deferred<unknown>>[] = [];
  stubInvoke((channel) => {
    const request = deferred<unknown>();
    if (channel === "setPiSettings") writes.push(request);
    else if (channel === "getPiSettings") loads.push(request);
    else throw new Error(`Unexpected request: ${channel}`);
    return request.promise;
  });
  const store = createStore<AppState>()((...args) => ({
    ...createPiSettingsSlice(args[0], args[1]),
    restartAllPi: async () => { const result = await rpc.request.restartAllPi({}); if (!result.ok) throw new Error("Could not restart Pi."); },
  }) as AppState);
  store.setState({ piSettings: { ...base } });
  return { store, writes, loads };
}

for (const order of [[0, 1], [1, 0]]) {
  test(`settings snapshots and restart obligations survive reply order ${order}`, async () => {
    const { store, writes } = fixture();
    const first = store.getState().updatePiSetting("shellPath", "/bin/zsh");
    const second = store.getState().updatePiSetting("autoRetry", false);
    const replies = [
      { ok: true, settings: { ...base, shellPath: "/bin/zsh" } },
      { ok: true, settings: { ...base, shellPath: "/bin/zsh", autoRetry: false } },
    ];
    const operations = [first, second];
    for (const index of order) {
      writes[index]!.resolve(replies[index]);
      await operations[index];
    }
    expect(store.getState().piSettings).toEqual(replies[1]!.settings);
    expect(store.getState().piRestartPending).toBe(true);
  });
}

test("an unrelated success cannot hide a failed control or revert another optimistic edit", async () => {
  const { store, writes } = fixture();
  const first = store.getState().updatePiSetting("blockImages", true);
  const second = store.getState().updatePiSetting("hideThinkingBlock", true);
  writes[0]!.resolve({ ok: false, error: "disk full" });
  await first;
  expect(store.getState().piSettings?.blockImages).toBe(false);
  expect(store.getState().piSettings?.hideThinkingBlock).toBe(true);
  expect(store.getState().piSettingsError).toBe("disk full");
  writes[1]!.resolve({ ok: true, settings: { ...base, hideThinkingBlock: true } });
  await second;
  expect(store.getState().piSettings?.hideThinkingBlock).toBe(true);
  expect(store.getState().piSettingsError).toBe("disk full");
});

for (const order of [[0, 1], [1, 0]]) {
  test(`two failed writes to one key restore the confirmed value, order ${order}`, async () => {
    const { store, writes } = fixture();
    const operations = [
      store.getState().updatePiSetting("shellPath", "/first"),
      store.getState().updatePiSetting("shellPath", "/second"),
    ];
    for (const index of order) {
      writes[index]!.resolve({ ok: false, error: `failure ${index}` });
      await operations[index];
    }
    expect(store.getState().piSettings?.shellPath).toBe("");
    expect(store.getState().piSettingsError).toBe("failure 1");
    expect(store.getState().piRestartPending).toBe(false);
  });
}

test("a read begun before or during an edit cannot replace it", async () => {
  const { store, writes, loads } = fixture();
  const oldLoad = store.getState().loadPiSettings();
  const edit = store.getState().updatePiSetting("shellPath", "/new");
  const duringLoad = store.getState().loadPiSettings();
  loads[0]!.resolve({ settings: base });
  await oldLoad;
  expect(store.getState().piSettings?.shellPath).toBe("/new");
  writes[0]!.resolve({ ok: true, settings: { ...base, shellPath: "/new" } });
  await edit;
  loads[1]!.resolve({ settings: base });
  await duringLoad;
  expect(store.getState().piSettings?.shellPath).toBe("/new");
});

test("reads use the latest visit, and rejected reads settle visibly", async () => {
  const { store, loads } = fixture();
  const old = store.getState().loadPiSettings();
  const current = store.getState().loadPiSettings();
  loads[1]!.resolve({ settings: { ...base, shellPath: "/external" } });
  await current;
  loads[0]!.resolve({ error: "old error" });
  await old;
  expect(store.getState().piSettings?.shellPath).toBe("/external");
  expect(store.getState().piSettingsError).toBeUndefined();
  const failed = store.getState().loadPiSettings();
  loads[2]!.reject(new Error("connection closed"));
  await failed;
  expect(store.getState().piSettingsError).toBe("connection closed");
});

test("transport rejection settles only its optimistic edit", async () => {
  const { store, writes } = fixture();
  const first = store.getState().updatePiSetting("shellPath", "/new");
  const second = store.getState().updatePiSetting("autoRetry", false);
  writes[0]!.reject(new Error("connection closed"));
  await first;
  expect(store.getState().piSettings?.shellPath).toBe("");
  expect(store.getState().piSettings?.autoRetry).toBe(false);
  writes[1]!.resolve({ ok: true, settings: { ...base, autoRetry: false } });
  await second;
  expect(store.getState().piSettingsError).toBe("connection closed");
});

test("settings ownership is isolated between stores", async () => {
  const a = fixture().store;
  const { store: b, writes } = fixture();
  const first = a.getState().updatePiSetting("shellPath", "/a");
  const second = b.getState().updatePiSetting("shellPath", "/b");
  writes[1]!.resolve({ ok: true, settings: { ...base, shellPath: "/b" } });
  await second;
  writes[0]!.resolve({ ok: true, settings: { ...base, shellPath: "/a" } });
  await first;
  expect(a.getState().piSettings?.shellPath).toBe("/a");
  expect(a.getState().piRestartPending).toBe(true);
  expect(b.getState().piSettings?.shellPath).toBe("/b");
});

for (const rejected of [false, true]) {
  test(`failed restart retains notice and reports an error (rejection: ${rejected})`, async () => {
    const { store } = fixture();
    store.setState({ piRestartPending: true });
    stubInvoke(async (channel) => {
      expect(channel).toBe("restartAllPi");
      if (rejected) throw new Error("stop failed");
      return { ok: false };
    });
    await store.getState().applyPiSettingsRestart();
    expect(store.getState().piRestartPending).toBe(true);
    expect(store.getState().piSettingsError).toBeTruthy();
  });
}

test("a failed latest edit falls back to Pi's normalized successful value", async () => {
  const { store, writes } = fixture();
  const first = store.getState().updatePiSetting("shellPath", " /bin/zsh ");
  const second = store.getState().updatePiSetting("shellPath", "/missing");
  writes[0]!.resolve({ ok: true, settings: { ...base, shellPath: "/bin/zsh" } });
  await first;
  expect(store.getState().piSettings?.shellPath).toBe("/missing");
  writes[1]!.resolve({ ok: false, error: "cannot write" });
  await second;
  expect(store.getState().piSettings?.shellPath).toBe("/bin/zsh");
  expect(store.getState().piRestartPending).toBe(true);
});

test("a newer snapshot is authoritative even while an older failed reply is pending", async () => {
  const { store, writes } = fixture();
  const first = store.getState().updatePiSetting("blockImages", true);
  const second = store.getState().updatePiSetting("autoRetry", false);
  writes[1]!.resolve({ ok: true, settings: { ...base, autoRetry: false } });
  await second;
  expect(store.getState().piSettings?.blockImages).toBe(false);
  writes[0]!.resolve({ ok: false, error: "first failed" });
  await first;
  expect(store.getState().piSettingsError).toBe("first failed");
  expect(store.getState().piSettings?.autoRetry).toBe(false);
});

test("successful acknowledgements without snapshots cannot lose another key's edit", async () => {
  const { store, writes } = fixture();
  const first = store.getState().updatePiSetting("blockImages", true);
  const second = store.getState().updatePiSetting("autoRetry", false);
  writes[1]!.resolve({ ok: true });
  await second;
  writes[0]!.resolve({ ok: true });
  await first;
  expect(store.getState().piSettings?.blockImages).toBe(true);
  expect(store.getState().piSettings?.autoRetry).toBe(false);
});

test("restart requests are shared and new saves remain pending across the restart", async () => {
  const { store } = fixture();
  store.setState({ piRestartPending: true });
  const stop = deferred<{ ok: boolean }>();
  const edit = deferred<unknown>();
  let calls = 0;
  stubInvoke((channel) => {
    if (channel === "restartAllPi") { calls++; return stop.promise; }
    if (channel === "setPiSettings") return edit.promise;
    throw new Error(channel);
  });
  const restart = store.getState().applyPiSettingsRestart();
  expect(store.getState().applyPiSettingsRestart()).toBe(restart);
  const update = store.getState().updatePiSetting("shellPath", "/new");
  edit.resolve({ ok: true, settings: { ...base, shellPath: "/new" } });
  await update;
  stop.resolve({ ok: true });
  await restart;
  expect(calls).toBe(1);
  expect(store.getState().piRestartPending).toBe(true);
  await store.getState().applyPiSettingsRestart();
  expect(calls).toBe(2);
  expect(store.getState().piRestartPending).toBe(false);
});

test("a failed selected-runtime refresh retains the global restart notice", async () => {
  const { store } = fixture();
  store.setState({ piRestartPending: true, restartAllPi: async () => { throw new Error("refresh failed"); } });
  stubInvoke(async () => ({ ok: true }));
  await store.getState().applyPiSettingsRestart();
  expect(store.getState().piRestartPending).toBe(true);
  expect(store.getState().piSettingsError).toBe("refresh failed");
});
