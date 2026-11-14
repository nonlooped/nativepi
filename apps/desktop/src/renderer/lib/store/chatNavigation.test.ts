import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import "./testBridge.ts";
import { createAppState } from "../store.ts";
import type { AppState } from "./types.ts";
import type { SessionSummary } from "../../../shared/pi-types.ts";

function fixture(current: string | null, isNewChat = false) {
  const store = createStore<AppState>()(createAppState);
  const selections: unknown[] = [];
  store.setState({
    activeProjectPath: "/p", activeSessionFile: current, isNewChat,
    sessionsByProject: { "/p": ["a", "b", "c"].map(path => ({ path }) as SessionSummary) },
    selectChat: async (...args) => { selections.push(args); },
  });
  return { store, selections };
}

test("chat navigation follows the current project's session order and wraps", async () => {
  for (const [current, direction, expected] of [["a", 1, "b"], ["c", 1, "a"], ["a", -1, "c"], ["b", -1, "a"]] as const) {
    const { store, selections } = fixture(current);
    await store.getState().selectAdjacentChat(direction);
    expect(selections).toEqual([[expected, "/p"]]);
  }
});

test("new and missing chats enter the list from either end", async () => {
  for (const current of [null, "missing", "b"]) {
    for (const direction of [1, -1] as const) {
      const { store, selections } = fixture(current, current === "b");
      await store.getState().selectAdjacentChat(direction);
      expect(selections).toEqual([[direction === 1 ? "a" : "c", "/p"]]);
    }
  }
});

test("missing projects, empty lists, and an already selected only chat do nothing", async () => {
  const patches: Partial<AppState>[] = [
    { activeProjectPath: null },
    { sessionsByProject: {} },
    { sessionsByProject: { "/p": [{ path: "a" } as SessionSummary] } },
  ];
  for (const patch of patches) {
    const { store, selections } = fixture("a");
    store.setState(patch);
    await store.getState().selectAdjacentChat(1);
    await store.getState().selectAdjacentChat(-1);
    expect(selections).toEqual([]);
  }
});

test("Work navigation skips finished chats, including from a finished current chat", async () => {
  for (const [current, direction, expected] of [["a", 1, "c"], ["b", -1, "a"], ["c", 1, "a"]] as const) {
    const { store, selections } = fixture(current);
    store.setState({ destination: "work", finishedChats: { b: "2026-02-04" } });
    await store.getState().selectAdjacentChat(direction);
    expect(selections).toEqual([[expected, "/p"]]);
  }
});
