import type { AppState } from "./store/types.ts";
import { expect, test } from "bun:test";
import "./store/testBridge.ts";
import { createStore } from "zustand/vanilla";
import { createAppState } from "./store.ts";
import { sidebarThreads } from "./sidebarThreads.ts";
import type { SessionSummary } from "../../shared/pi-types.ts";
function session(path: string, day: number) { return { path, created: "2026-02-01", modified: `2026-02-${String(day).padStart(2, "0")}` } as SessionSummary; }
function fixture() {
  const store = createStore<AppState>()(createAppState);
  store.setState({ destination: "work", workRoot: "/free", projects: [{ path: "/p", name: "P" }], focusStartedAt: "2026-01-01",
    sessionsByProject: { "/p": [session("older", 2), session("pinned", 1), session("newer", 3), session("done", 4)], "/free": [session("free", 5)] },
    pinnedChats: ["pinned"], finishedChats: { done: "2026-02-04" }, sidebarFinishedOpen: true });
  return store;
}
test("Work index follows pinned order, recency, project scope, No project, and Finished visibility", () => {
  const store = fixture();
  const paths = () => sidebarThreads(store.getState()).map(thread => thread.session);
  expect(paths()).toEqual(["pinned", "free", "newer", "older"]);
  store.setState({ sidebarScope: "/p" });
  expect(paths()).toEqual(["pinned", "newer", "older"]);
  store.setState({ sidebarFinishedOpen: false });
  expect(paths()).toEqual(["pinned", "newer", "older"]);
  store.setState({ sidebarScope: "/free" });
  expect(sidebarThreads(store.getState())).toEqual([{ session: "free", project: "/free" }]);
});
test("Finished chats are excluded even when visible", () => {
  const store = fixture(); store.setState({ sidebarScope: "/p", sidebarFinishedLimit: 1, finishedChats: { done: "2026-02-04", older: "2026-02-03" } });
  expect(sidebarThreads(store.getState()).map(thread => thread.session)).toEqual(["pinned", "newer"]);
});
test("Chat index follows expanded folder order, then unfiled chats, including deleted folder memberships", () => {
  const store = fixture();
  store.setState({ destination: "chat", chatRoot: "/chat", chatFolders: [{ id: "f1", name: "First", color: "red" }, { id: "f2", name: "Second", color: "blue" }],
    chatFolderBySession: { b: "f2", a: "f1", orphan: "deleted" },
    sessionsByProject: { "/chat": [session("b", 5), session("a", 4), session("unfiled", 3), session("orphan", 2)] } });
  expect(sidebarThreads(store.getState()).map(thread => thread.session)).toEqual(["a", "b", "unfiled", "orphan"]);
  store.setState({ collapsedChatFolders: ["f1"] });
  expect(sidebarThreads(store.getState()).map(thread => thread.session)).toEqual(["b", "unfiled", "orphan"]);
});
