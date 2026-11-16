import { afterEach, expect, test } from "bun:test";
import { stubInvoke } from "./store/testBridge.ts";
import { useWorkspaceEditor as editor } from "./workspaceEditor.ts";
afterEach(() => editor.setState({ buffers: {}, selected: {}, loading: {} }));
const revision = "a".repeat(64);
async function open() {
  stubInvoke(async () => ({ text: "disk", revision }));
  await editor.getState().open("/project", "a.ts", undefined, "left");
  return Object.keys(editor.getState().buffers)[0]!;
}
test("disk refresh updates clean text but preserves a dirty buffer and reports conflict", async () => {
  const key = await open();
  stubInvoke(async () => ({ text: "new disk", revision: "b".repeat(64) }));
  await editor.getState().refresh(key);
  expect(editor.getState().buffers[key]!.text).toBe("new disk");
  editor.getState().edit(key, "my changes");
  stubInvoke(async () => ({ text: "another change", revision: "c".repeat(64) }));
  await editor.getState().refresh(key);
  expect(editor.getState().buffers[key]).toMatchObject({ text: "my changes", saved: "new disk", conflict: true });
  await editor.getState().refresh(key, true);
  expect(editor.getState().buffers[key]).toMatchObject({ text: "another change", saved: "another change", conflict: false });
});
test("failed saves preserve edits; typing during save stays dirty after success", async () => {
  const key = await open(); editor.getState().edit(key, "mine");
  stubInvoke(async () => { throw new Error("disk full"); });
  expect(await editor.getState().save(key)).toBe(false);
  expect(editor.getState().buffers[key]).toMatchObject({ text: "mine", saved: "disk", saving: false });
  let resolve!: (value: unknown) => void;
  stubInvoke(() => new Promise(r => { resolve = r; }));
  const pending = editor.getState().save(key);
  editor.getState().edit(key, "newer typing");
  resolve({ ok: true, revision: "b".repeat(64) }); await pending;
  expect(editor.getState().buffers[key]).toMatchObject({ text: "newer typing", saved: "mine", saving: false });
});
test("opening a file targets only its pane and leaves other workspace drafts available", async () => {
  const first = await open(); editor.getState().edit(first, "unsaved");
  await editor.getState().open("/other", "b.ts", undefined, "right");
  expect(editor.getState().selected["left:/project"]).toBe(first);
  expect(editor.getState().selected["right:/project"]).toBeUndefined();
  expect(editor.getState().buffers[first]!.text).toBe("unsaved");
});

test("a slow file read cannot replace a newer selection in the same pane", async () => {
  const first = Promise.withResolvers<unknown>();
  stubInvoke(async (_name, params) => (params as { file: string }).file === "slow.ts" ? first.promise : { text: "fast", revision });
  const slow = editor.getState().open("/project", "slow.ts", undefined, "left");
  expect(editor.getState().loading["left:/project"]).toBe("slow.ts");
  await editor.getState().open("/project", "fast.ts", undefined, "left");
  first.resolve({ text: "slow", revision }); await slow;
  const selected = editor.getState().selected["left:/project"]!;
  expect(editor.getState().buffers[selected]!.file).toBe("fast.ts");
  expect(editor.getState().loading).toEqual({});
});
