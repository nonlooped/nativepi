import { afterEach, expect, test } from "bun:test";
import { createStore, type StoreApi } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import { flushPersist, runtime } from "./internals.ts";
import { nativePiStateSchema } from "../../../shared/rpc-schema.ts";
import type { AppState } from "./types.ts";
const stores: StoreApi<AppState>[] = [];
const workRoot = "/managed/work", chatRoot = "/managed/chat";
function fixture() {
  const store = createStore<AppState>()(createAppState); stores.push(store);
  store.setState({ workRoot, chatRoot, onUpdateState: () => {} }); return store;
}
function base(channel: string): any {
  if (channel === "checkTrust") return { required: false, trusted: false };
  if (channel === "getState") return { state: { model: { provider: "test", id: "test" }, thinkingLevel: "off", isStreaming: false, isCompacting: false } };
  if (channel === "getThinkingLevels") return { levels: ["off"] };
  if (channel === "getModels") return { models: [] };
  if (channel === "getSessionProviders" || channel === "listProviders") return { providers: [] };
  if (channel === "loadGraphicalExtensions") return { extensions: [] };
  if (channel === "readSessionSnapshot") return { consistency: "stable", entries: [], eventWatermark: 0 };
  if (channel === "listSessions") return { sessions: [] };
  return { ok: true };
}
afterEach(() => { for (const store of stores.splice(0)) { const owner = runtime(store.getState); clearTimeout(owner.saveTimer); for (const timer of owner.draftReports.values()) clearTimeout(timer); } });
test("project-free Work sends normally without pinning the managed directory", async () => {
  const store = fixture(); const submits: any[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "submit") { submits.push(params); return { ok: true, sessionFile: "/work-session" }; }
    return base(channel);
  });
  await store.getState().newChatIn(workRoot);
  store.getState().setDraft("Diagnose my device"); await store.getState().send();
  expect(submits).toHaveLength(1); expect(submits[0]).toMatchObject({ projectDir: workRoot });
  expect(store.getState()).toMatchObject({ destination: "work", activeProjectPath: workRoot, activeSessionFile: "/work-session", projects: [] });
});
test("failed project-free sends preserve drafts and never become Chat", async () => {
  const store = fixture();
  stubInvoke(async channel => channel === "submit" ? { ok: false, error: "Offline" } : base(channel));
  await store.getState().newChatIn(workRoot); store.getState().setDraft("Install an app"); await store.getState().send();
  expect(store.getState()).toMatchObject({ destination: "work", activeSessionFile: null, projects: [] });
  expect(store.getState().drafts[`new:${workRoot}`]).toBe("Install an app");
});
test("project-free selection and Pi session restore after reload and a Chat round trip", async () => {
  let saved = nativePiStateSchema.parse({});
  stubInvoke(async (channel, params: any) => {
    if (channel === "saveState") { saved = nativePiStateSchema.parse(params.state); return { ok: true }; }
    if (channel === "loadState") return saved;
    if (channel === "workWorkspace") return { path: workRoot };
    if (channel === "chatWorkspace") return { path: chatRoot };
    return base(channel);
  });
  const first = fixture(); first.setState({ ready: true });
  await first.getState().newChatIn(workRoot); await first.getState().selectChat("/work-session", workRoot); await flushPersist(first.getState);
  expect(saved.projects).toEqual([]); expect(saved.lastWorkProject).toBe(workRoot);
  const restored = fixture(); await restored.getState().init();
  expect(restored.getState()).toMatchObject({ destination: "work", activeProjectPath: workRoot, activeSessionFile: "/work-session", projects: [] });
  await restored.getState().setDestination("chat");
  expect(restored.getState().activeProjectPath).toBe(chatRoot);
  await restored.getState().setDestination("work");
  expect(restored.getState()).toMatchObject({ destination: "work", activeProjectPath: workRoot, activeSessionFile: "/work-session", projects: [] });
});
