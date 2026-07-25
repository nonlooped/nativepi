import { expect, test } from "bun:test";
import { nativePiStateSchema } from "./rpc-schema.ts";

test("an empty object yields the full set of defaults", () => {
  const state = nativePiStateSchema.parse({});
  expect(state).toEqual({
    version: 1,
    projects: [],
    lastProjectPath: undefined,
    lastChatByProject: {},
    drafts: {},
    favoriteModels: [],
    panes: undefined,
    reopenLastProject: true,
  });
});

test("a corrupt field costs that field, not the whole workspace", () => {
  const state = nativePiStateSchema.parse({
    projects: [{ path: "/a", name: "A" }],
    drafts: "not an object at all",
    favoriteModels: [1, "openai/gpt-5", null],
    reopenLastProject: "yes",
  });

  expect(state.projects).toEqual([{ path: "/a", name: "A" }]);
  expect(state.drafts).toEqual({});
  expect(state.favoriteModels).toEqual([]);
  expect(state.reopenLastProject).toBe(true);
});

test("one unreadable project does not cost the others", () => {
  const state = nativePiStateSchema.parse({
    projects: [{ path: "/good" }, { name: "no path" }, null, { path: "/also-good", name: "Good" }],
  });
  expect(state.projects).toEqual([
    { path: "/good", name: "/good" },
    { path: "/also-good", name: "Good" },
  ]);
});

test("a project without a name falls back to its path", () => {
  const state = nativePiStateSchema.parse({ projects: [{ path: "/x/y" }, { path: "/z", name: "" }] });
  expect(state.projects).toEqual([
    { path: "/x/y", name: "/x/y" },
    { path: "/z", name: "/z" },
  ]);
});

test("sidebar size is clamped rather than discarded", () => {
  expect(nativePiStateSchema.parse({ panes: { sidebarSize: 99 } }).panes?.sidebarSize).toBe(30);
  expect(nativePiStateSchema.parse({ panes: { sidebarSize: 2 } }).panes?.sidebarSize).toBe(14);
  expect(nativePiStateSchema.parse({ panes: { sidebarSize: 22 } }).panes?.sidebarSize).toBe(22);
  expect(nativePiStateSchema.parse({ panes: { sidebarSize: Infinity } }).panes?.sidebarSize).toBe(18);
});

test("absent panes stay absent, so a first run can still open the pane itself", () => {
  // `init` treats `panes === undefined` as "the user has never chosen", which is
  // what lets NativePi open the changes pane once it sees the repo is dirty.
  expect(nativePiStateSchema.parse({}).panes).toBeUndefined();
  expect(nativePiStateSchema.parse({ panes: {} }).panes).toEqual({
    sidebarOpen: true,
    sidebarSize: 18,
    contextPaneOpen: false,
  });
});
