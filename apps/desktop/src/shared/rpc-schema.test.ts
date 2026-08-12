import { expect, test } from "bun:test";
import { DEFAULT_PREFERENCES, extensionCallParamsSchema, nativePiStateSchema } from "./rpc-schema.ts";
import { NATIVE_THEME } from "./themes.ts";

test("an empty object yields the full set of defaults", () => {
  const state = nativePiStateSchema.parse({});
  expect(state).toEqual({
    version: 1,
    projects: [],
    lastProjectPath: undefined,
    lastChatByProject: {},
    drafts: {},
    favoriteModels: [],
    commitMessageModel: "active",
    pinnedChats: [],
    finishedChats: {},
    focusedChats: [],
    focusStartedAt: undefined,
    panes: undefined,
    reopenLastProject: true,
    preferences: DEFAULT_PREFERENCES,
    keybindingOverrides: {},
  });
});

test("a corrupt commit message model falls back to the current chat model", () => {
  expect(nativePiStateSchema.parse({ commitMessageModel: 42 }).commitMessageModel).toBe("active");
});

test("a corrupt keybinding overrides value costs the whole map, not the workspace", () => {
  const state = nativePiStateSchema.parse({ keybindingOverrides: "not an object" });
  expect(state.keybindingOverrides).toEqual({});
});

test("a corrupt preference costs that preference, not the rest", () => {
  const state = nativePiStateSchema.parse({
    preferences: { diffStyle: "sideways", interfaceScale: 9, terminalFontSize: 18 },
  });
  expect(state.preferences.diffStyle).toBe("unified");
  expect(state.preferences.interfaceScale).toBe(1.4);
  expect(state.preferences.terminalFontSize).toBe(18);
});

test("corrupt custom themes do not cost the readable themes", () => {
  const good = { ...NATIVE_THEME, id: "custom:good", name: "Good" };
  const state = nativePiStateSchema.parse({
    preferences: {
      customThemes: [
        good,
        { ...good, id: "custom:bad", colors: { ...good.colors, light: { ...good.colors.light, background: "purple" } } },
        good,
      ],
    },
  });

  expect(state.preferences.customThemes).toEqual([good]);
});

test("interface scale preserves a readable floor", () => {
  const state = nativePiStateSchema.parse({ preferences: { interfaceScale: 0.8 } });
  expect(state.preferences.interfaceScale).toBe(0.9);
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

test("pinned chats keep valid unique paths", () => {
  const state = nativePiStateSchema.parse({
    pinnedChats: ["C:\\one.jsonl", 12, "C:\\one.jsonl", "", "C:\\two.jsonl"],
  });

  expect(state.pinnedChats).toEqual(["C:\\one.jsonl", "C:\\two.jsonl"]);
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
  expect(nativePiStateSchema.parse({ panes: { sidebarSize: Infinity } }).panes?.sidebarSize).toBe(14);
});

test("graphical extension calls only accept JSON parameters", () => {
  expect(
    extensionCallParamsSchema.safeParse({
      projectDir: "C:\\project",
      extension: "@acme/ext",
      method: "save",
      params: { nested: [true, null, "ok"] },
    }).success,
  ).toBe(true);
  expect(
    extensionCallParamsSchema.safeParse({
      projectDir: "C:\\project",
      extension: "@acme/ext",
      method: "save",
      params: 1n,
    }).success,
  ).toBe(false);
});

test("focus organization keeps only readable persisted values", () => {
  const state = nativePiStateSchema.parse({
    focusedChats: ["one.jsonl", "one.jsonl", 42],
    focusStartedAt: "2026-08-12T10:00:00.000Z",
  });
  expect(state.focusedChats).toEqual(["one.jsonl"]);
  expect(state.focusStartedAt).toBe("2026-08-12T10:00:00.000Z");
});

test("finished chats keep only paths with valid completion timestamps", () => {
  expect(
    nativePiStateSchema.parse({
      finishedChats: {
        "one.jsonl": "2026-08-12T10:00:00.000Z",
        broken: "not-a-date",
      },
    }).finishedChats,
  ).toEqual({ "one.jsonl": "2026-08-12T10:00:00.000Z" });
});

test("absent panes stay absent, so a first run can still open the pane itself", () => {
  // `init` treats `panes === undefined` as "the user has never chosen", which is
  // what lets NativePi open the changes pane once it sees the repo is dirty.
  expect(nativePiStateSchema.parse({}).panes).toBeUndefined();
  expect(nativePiStateSchema.parse({ panes: {} }).panes).toEqual({
    sidebarOpen: true,
    sidebarSize: 14,
    contextPaneOpen: false,
  });
});
