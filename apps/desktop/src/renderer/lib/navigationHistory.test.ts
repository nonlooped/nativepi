import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import type { AppState } from "./store/types.ts";
import { createNavigationHistory } from "./navigationHistory.ts";

function setup() {
  const app = createStore<AppState>(() => ({
    ready: true, destination: "work", activeProjectPath: "/one", activeSessionFile: "a", isNewChat: false,
    setDestination: async (destination) => { app.setState({ destination }); },
    selectChat: async (session, project) => { app.setState({ activeProjectPath: project, activeSessionFile: session, isNewChat: false }); },
    selectProject: async (project) => { app.setState({ activeProjectPath: project, activeSessionFile: null, isNewChat: false }); },
    newChat: () => { app.setState({ activeSessionFile: null, isNewChat: true }); },
  }) as AppState);
  return { app, ...createNavigationHistory(app) };
}

test("back and forward restore chats across projects and modes without duplicating history", async () => {
  const { app, history, navigate, dispose } = setup();
  app.setState({ activeSessionFile: "b" });
  app.setState({ destination: "chat" });
  app.setState({ activeProjectPath: "/chat", activeSessionFile: "c" });
  expect(history.getState().entries).toHaveLength(3);
  await navigate(-1);
  expect(app.getState()).toMatchObject({ destination: "work", activeProjectPath: "/one", activeSessionFile: "b" });
  await navigate(-1);
  expect(app.getState().activeSessionFile).toBe("a");
  await navigate(-1);
  expect(history.getState().index).toBe(0);
  await navigate(1);
  expect(app.getState().activeSessionFile).toBe("b");
  expect(history.getState().entries).toHaveLength(3);
  dispose();
});

test("new navigation clears forward history, and drafts can be revisited", async () => {
  const { app, history, navigate, dispose } = setup();
  app.getState().newChat();
  app.setState({ activeSessionFile: "b", isNewChat: false });
  await navigate(-1);
  expect(app.getState()).toMatchObject({ activeSessionFile: null, isNewChat: true });
  app.setState({ activeSessionFile: "c", isNewChat: false });
  expect(history.getState().entries.map(entry => entry.session)).toEqual(["a", null, "c"]);
  dispose();
});

test("failed navigation unlocks controls without moving the history cursor", async () => {
  const { app, history, navigate, dispose } = setup();
  app.setState({ activeSessionFile: "b" });
  app.setState({ selectChat: async () => { throw new Error("missing session"); } });
  await expect(navigate(-1)).rejects.toThrow("missing session");
  expect(history.getState()).toMatchObject({ index: 1, busy: false });
  dispose();
});
