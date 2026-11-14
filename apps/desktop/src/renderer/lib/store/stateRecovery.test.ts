import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import { emptyConversation } from "./conversation.ts";
import type { AppState, ExtensionPrompt } from "./types.ts";
function fixture() {
  const store = createStore<AppState>()(createAppState);
  store.setState({ activeProjectPath: "/p", activeSessionFile: "/session", conversations: { "/session": { ...emptyConversation(), projectDir: "/p", sessionFile: "/session" } } });
  return store;
}
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
test("history failure settles independently from turn errors and retry restores history", async () => {
  const store = fixture(), pending = deferred<any>();
  stubInvoke(() => pending.promise);
  const read = store.getState().refreshSession("/p", "/session");
  expect(store.getState().conversations['/session']?.historyLoading).toBe(true);
  pending.reject(new Error("Session unreadable")); await expect(read).rejects.toThrow("Session unreadable");
  const failed = store.getState().conversations['/session']!;
  expect(failed.historyLoading).toBe(false); expect(failed.historyError).toBe("Session unreadable"); expect(failed.error).toBeUndefined();
  stubInvoke(async () => ({ consistency: "stable", entries: [], eventWatermark: 0 }));
  await store.getState().refreshSession("/p", "/session");
  expect(store.getState().conversations['/session']?.historyError).toBeUndefined();
});
test("failed Git refresh marks retained status stale and successful retry clears failure", async () => {
  const store = fixture();
  const known = { isRepo: true, branch: "main", ahead: 0, behind: 0, files: [], insertions: 0, deletions: 0 } as NonNullable<AppState['git']>;
  store.setState({ git: known });
  stubInvoke(async () => { throw new Error("Folder unavailable"); });
  await store.getState().refreshGit();
  expect(store.getState().git).toBe(known); expect(store.getState().gitError).toBe("Folder unavailable"); expect(store.getState().gitLoading).toBe(false);
  stubInvoke(async () => ({ status: { ...known, branch: "feature" } })); await store.getState().refreshGit();
  expect(store.getState().git?.branch).toBe("feature"); expect(store.getState().gitError).toBeUndefined();
});
test("extension answer survives rejection and only its acknowledged prompt is removed", async () => {
  const store = fixture();
  const prompt: ExtensionPrompt = { type: "extension_ui_request", id: "question", projectDir: "/p", sessionFile: "/session", method: "input", title: "Continue?" };
  store.setState({ extPrompts: [prompt], extensionPromptsByProject: { "/p": [prompt] } });
  let pending = deferred<any>(); stubInvoke(() => pending.promise);
  store.getState().respondExtension({ value: "yes" });
  expect(store.getState().extPrompts).toEqual([prompt]); expect(store.getState().extResponsePending?.[prompt.id]).toBe(true);
  pending.reject(new Error("Not delivered")); await Bun.sleep(0);
  expect(store.getState().extPrompts).toEqual([prompt]); expect(store.getState().extResponseErrors?.[prompt.id]).toBe("Not delivered");
  pending = deferred<any>(); store.getState().respondExtension({ value: "yes" });
  const next = { ...prompt, id: "second" }; store.setState({ extPrompts: [prompt, next], extensionPromptsByProject: { "/p": [prompt, next] } });
  pending.resolve({ ok: true }); await Bun.sleep(0);
  expect(store.getState().extPrompts).toEqual([next]); expect(store.getState().extensionPromptsByProject['/p']).toEqual([next]); expect(store.getState().extResponsePending?.[prompt.id]).toBeUndefined();
});
test("late model catalogs cannot replace the selected chat's models", async () => {
  const store = fixture(), old = deferred<any>(); stubInvoke(() => old.promise);
  const read = store.getState().refreshModels(); expect(store.getState().modelsLoading).toBe(true);
  store.setState({ activeSessionFile: "/other" });
  stubInvoke(async () => ({ models: [{ provider: "p", id: "current" }] })); await store.getState().refreshModels();
  old.resolve({ models: [{ provider: "p", id: "old" }] }); await read;
  expect(store.getState().models.map(model => model.id)).toEqual(["current"]); expect(store.getState().modelsLoading).toBe(false);
});
test("typed catalog failure settles loading and retry replaces the error", async () => {
  const store = fixture(); stubInvoke(async () => ({ models: [], error: "Catalog unavailable" }));
  await store.getState().refreshModels();
  expect(store.getState().modelsLoading).toBe(false); expect(store.getState().modelsError).toBe("Catalog unavailable");
  stubInvoke(async () => ({ models: [{ provider: "p", id: "recovered" }] })); await store.getState().refreshModels();
  expect(store.getState().modelsError).toBeUndefined(); expect(store.getState().models[0]?.id).toBe("recovered");
});
