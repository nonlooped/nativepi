import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import "./testBridge.ts";
import { createAppState } from "../store.ts";
import type { AppState } from "./types.ts";
function fixture() { const store = createStore<AppState>()(createAppState); store.setState({ chatRoot: "/chat", activeProjectPath: "/work", projects: [{ path: "/work", name: "Work" }] }); return store; }
test("folders have unique stable colors and memberships are organization only", () => {
  const store = fixture();
  for (let i=0;i<30;i++) store.getState().addChatFolder(`Folder ${i}`);
  const folders = store.getState().chatFolders;
  expect(new Set(folders.map(f => f.color)).size).toBe(30);
  store.getState().moveToChatFolder("/session", folders[0]!.id);
  expect(store.getState().activeProjectPath).toBe("/work");
  store.getState().toggleChatFolder(folders[0]!.id);
  expect(store.getState().collapsedChatFolders).toEqual([folders[0]!.id]);
});
test("destinations restore their own folder and never add Chat as a pinned project", async () => {
  const store = fixture(); const selected: string[] = [];
  store.setState({ selectProject: async path => { selected.push(path); store.setState({ activeProjectPath: path }); } });
  await store.getState().setDestination("chat"); await store.getState().setDestination("work");
  expect(selected).toEqual(["/chat", "/work"]); expect(store.getState().projects).toHaveLength(1);
});
test("folder deletion deletes its own chats and retains the folder on partial failure", async () => {
  const store = fixture(); store.getState().addChatFolder("Research");
  const folder = store.getState().chatFolders[0]!;
  store.getState().moveToChatFolder("/one", folder.id); store.getState().moveToChatFolder("/two", folder.id);
  const deleted: string[] = [];
  store.setState({ deleteChat: async path => { deleted.push(path); return path === "/two" ? { ok: false, error: "External session changed" } : { ok: true }; } });
  await expect(store.getState().deleteChatFolder(folder.id)).rejects.toThrow("External session changed");
  expect(deleted).toEqual(["/one", "/two"]); expect(store.getState().chatFolders).toEqual([folder]);
  expect(store.getState().chatFolderBySession["/one"]).toBeUndefined();
  expect(store.getState().chatFolderBySession["/two"]).toBe(folder.id);
  store.setState({ deleteChat: async () => ({ ok: true }) });
  await store.getState().deleteChatFolder(folder.id); expect(store.getState().chatFolders).toEqual([]);
});
