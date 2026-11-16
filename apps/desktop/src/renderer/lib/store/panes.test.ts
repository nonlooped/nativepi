import { expect, test } from "bun:test";
import { stubInvoke } from "./testBridge.ts";
import { createPaneStore, primaryStore, focusPaneStore, useAppStore, releasePaneStore } from "../store.ts";
import { draftKeyFor } from "../../../shared/messages.ts";
import { emptyConversation } from "./conversation.ts";
import { surfaceBuffer } from "../tuiSurfaces.ts";
import { runtime } from "./internals.ts";

test("pane actions own drafts, models, run state and focus independently", () => {
  const left = createPaneStore(), right = createPaneStore();
  left.setState({ activeProjectPath: "/a", activeSessionFile: "/a/session", conversations: { "/a/session": { ...emptyConversation(), running: true } } });
  right.setState({ activeProjectPath: "/b", activeSessionFile: "/b/session", conversations: { "/b/session": emptyConversation() } });
  left.getState().setDraft("left draft"); right.getState().setDraft("right draft");
  expect(left.getState().drafts[draftKeyFor("/a", "/a/session")]).toBe("left draft");
  expect(right.getState().drafts[draftKeyFor("/a", "/a/session")]).toBeUndefined();
  expect(left.getState().conversations["/a/session"]!.running).toBe(true);
  expect(right.getState().conversations["/b/session"]!.running).toBe(false);
  expect(runtime(left.getState).paneId).not.toBe(runtime(right.getState).paneId);
  focusPaneStore(right); expect(useAppStore.getState().activeProjectPath).toBe("/b");
  // A callback captured from the first pane remains bound after focus changes.
  left.getState().setDraft("still left");
  expect(right.getState().drafts[draftKeyFor("/b", "/b/session")]).toBe("right draft");
  releasePaneStore(left); releasePaneStore(right); focusPaneStore(primaryStore);
});
test("two panes receiving the same TUI write append it only once", () => {
  const left = createPaneStore(), right = createPaneStore();
  for (const store of [left, right]) store.setState({ activeProjectPath: "/a", activeSessionFile: "session" });
  const frame = { type: "nativepi_tui_write" as const, surfaceId: "shared-pane-surface", data: "once" };
  for (const store of [left, right]) store.getState().onTuiFrame({ projectDir: "/a", sessionFile: "session", frame });
  expect(surfaceBuffer(frame.surfaceId)).toBe("once");
  releasePaneStore(left); releasePaneStore(right);
});

test("extension events and caret pastes stay with their pane after focus moves", async () => {
  const { registerComposerInserter, insertAtComposerCaret } = await import("../composerInsert.ts");
  const { subscribeToExtension, dispatchExtensionEvent } = await import("../extensionEvents.ts");
  const left = {}, right = {}; const seen: string[] = [];
  const stops = [registerComposerInserter(text => { seen.push(`left:${text}`); return true; }, left), registerComposerInserter(text => { seen.push(`right:${text}`); return true; }, right),
    subscribeToExtension("same-extension", () => seen.push("left:event"), left), subscribeToExtension("same-extension", () => seen.push("right:event"), right)];
  insertAtComposerCaret("paste", left); dispatchExtensionEvent("same-extension", "update", undefined, right);
  expect(seen).toEqual(["left:paste", "right:event"]); stops.forEach(stop => stop());
});
