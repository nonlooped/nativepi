import { expect, test } from "bun:test";

Object.assign(globalThis, {
  window: {
    nativepi: { invoke: async () => ({}), events: { on: () => () => {} } },
  },
});

const { createAuthSlice } = await import("./auth.ts");
const { createChatSlice } = await import("./chat.ts");
const { createModelSlice } = await import("./models.ts");
const { createProjectContextSlice } = await import("./projectContext.ts");
const { createUiSlice } = await import("./ui.ts");
const { createWorkspaceSlice } = await import("./workspace.ts");
const { useAppStore } = await import("../store.ts");

const noopSet = () => {};
const noopGet = () => useAppStore.getState();

const slices = {
  workspace: createWorkspaceSlice(noopSet, noopGet),
  chat: createChatSlice(noopSet, noopGet),
  models: createModelSlice(noopSet, noopGet),
  auth: createAuthSlice(noopSet, noopGet),
  projectContext: createProjectContextSlice(noopSet, noopGet),
  ui: createUiSlice(noopSet, noopGet),
};

test("no two slices define the same key", () => {
  // The slices are spread into one object, so a collision would be silently won
  // by whichever is spread last — and TypeScript permits it.
  const seen = new Map<string, string>();
  const collisions: string[] = [];

  for (const [sliceName, slice] of Object.entries(slices)) {
    for (const key of Object.keys(slice)) {
      const owner = seen.get(key);
      if (owner) collisions.push(`${key}: ${owner} and ${sliceName}`);
      else seen.set(key, sliceName);
    }
  }

  expect(collisions).toEqual([]);
});

test("the composed store exposes every key its slices declare", () => {
  const expected = new Set(Object.values(slices).flatMap((slice) => Object.keys(slice)));
  const actual = new Set(Object.keys(useAppStore.getState()));

  expect([...expected].filter((key) => !actual.has(key))).toEqual([]);
});

test("the initial state is what the app starts from", () => {
  // Composed fresh rather than read off `useAppStore`: the singleton is shared
  // across test files, and another file's `setState` would decide this result.
  const s = { ...slices.workspace, ...slices.chat, ...slices.models, ...slices.auth, ...slices.projectContext, ...slices.ui };

  expect(s.ready).toBe(false);
  expect(s.projects).toEqual([]);
  expect(s.activeProjectPath).toBeNull();
  expect(s.activeSessionFile).toBeNull();
  expect(s.entries).toEqual([]);
  expect(s.running).toBe(false);
  expect(s.queue).toEqual({ steering: [], followUp: [] });
  expect(s.sendBehavior).toBe("followUp");
  expect(s.thinkingLevel).toBe("off");
  expect(s.thinkingLevels).toEqual(["off"]);
  expect(s.sidebarOpen).toBe(true);
  expect(s.sidebarSize).toBe(18);
  expect(s.reopenLastProject).toBe(true);
  expect(s.contextPaneOpen).toBe(false);
  expect(s.contextPaneChosen).toBe(false);
  expect(s.git).toBeNull();
  expect(s.trust).toBeNull();
});

test("a conversation reset hands out fresh collections each time", () => {
  // `emptyConversation()` is a function precisely so two resets cannot end up
  // sharing one array; if it were a constant these would be the same object.
  const first = createChatSlice(noopSet, noopGet);
  const second = createChatSlice(noopSet, noopGet);

  expect(first.entries).not.toBe(second.entries);
  expect(first.queue).not.toBe(second.queue);
  expect(first.pending).not.toBe(second.pending);
});
