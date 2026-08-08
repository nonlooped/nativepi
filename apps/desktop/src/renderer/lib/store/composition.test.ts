import { expect, test } from "bun:test";

import "./testBridge.ts";

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

test("a conversation reset hands out fresh collections each time", async () => {
  // `emptyConversation()` is a function precisely so two resets cannot end up
  // sharing one array; if it were a constant these would be the same object.
  const { emptyConversation } = await import("./conversation.ts");
  const first = emptyConversation();
  const second = emptyConversation();

  expect(first.entries).not.toBe(second.entries);
  expect(first.queue).not.toBe(second.queue);
  expect(first.pending).not.toBe(second.pending);
});
