import { afterEach, expect, test } from "bun:test";
import { stubInvoke } from "./store/testBridge.ts";
import { primaryStore } from "./store.ts";
import { useWorkspaceEditor } from "./workspaceEditor.ts";
import { readRecovery, restoreRecovery, saveRecovery } from "./recovery.ts";
import { confirmUpdateInstall, requestUpdateInstall, useUpdateInstall } from "./updateInstall.ts";
const original = primaryStore.getState();
const service = window.nativepi!.service;
afterEach(() => { primaryStore.setState(original, true); useWorkspaceEditor.setState({ buffers: {}, selected: {}, loading: {} }); window.localStorage.clear(); window.nativepi!.service = service; useUpdateInstall.setState({ open: false, busy: false, error: undefined }); });

test("an update saves the latest draft before stopping work, and a failed save leaves work running", async () => {
  primaryStore.setState({ ready: true, drafts: { draft: "Keep this latest instruction" } });
  const events: string[] = [];
  window.nativepi!.service = async action => { if (action === "stop") events.push("stop"); return { running: action !== "stop", compatible: true, startAtLogin: false }; };
  let fail = true;
  stubInvoke(async (name, params: any) => {
    if (name === "updateState") return { status: "ready" };
    if (name === "saveState") { events.push("save"); expect(params.state.drafts.draft).toBe("Keep this latest instruction"); if (fail) throw Error("Could not save workspace"); }
    if (name === "installUpdate") events.push("install");
    return { ok: true };
  });
  requestUpdateInstall(); await confirmUpdateInstall();
  expect(useUpdateInstall.getState()).toMatchObject({ open: true, busy: false, error: "Could not save workspace" });
  expect(events).toEqual(["save"]);
  fail = false; events.length = 0;
  await confirmUpdateInstall();
  expect(events).toEqual(["save", "stop", "install"]);
  expect(useUpdateInstall.getState().open).toBe(false);
});
test("installing after work was already stopped preserves a recovery draft without requesting a dead host save", async () => {
  primaryStore.setState({ ready: true, drafts: { draft: "Typed after stopping" } });
  window.nativepi!.service = async () => ({ running: false, compatible: true, startAtLogin: false });
  stubInvoke(async name => {
    if (name === "updateState") return { status: "ready" };
    if (name === "installUpdate") return { ok: true };
    throw Error("Host must not be contacted after stop");
  });
  requestUpdateInstall(); await confirmUpdateInstall();
  expect(useUpdateInstall.getState()).toMatchObject({ open: false, busy: false, error: undefined });
  expect(readRecovery()?.drafts.draft).toBe("Typed after stopping");
});
test("recovery restores unsaved file text conservatively and retains a newer chat draft", async () => {
  const key = JSON.stringify(["/project", "notes.md"]);
  useWorkspaceEditor.setState({ buffers: { [key]: { key, projectDir: "/project", file: "notes.md", text: "Recovered edits", saved: "Original file", revision: "old", saving: false } } });
  primaryStore.setState({ drafts: { draft: "Recovered instructions" }, openProjectPath: async () => {} });
  saveRecovery();
  const copy = readRecovery()!;
  useWorkspaceEditor.setState({ buffers: {}, selected: {} });
  primaryStore.setState({ drafts: { draft: "Newer instructions" } });
  stubInvoke(async name => name === "saveState" ? { ok: true } : { text: "Changed externally", revision: "new" });
  await restoreRecovery(copy);
  expect(useWorkspaceEditor.getState().buffers[key]).toMatchObject({ text: "Recovered edits", conflict: true, revision: "old" });
  expect(primaryStore.getState().drafts.draft).toBe("Newer instructions\n\n— Recovered draft —\nRecovered instructions");
  expect(readRecovery()).toBeNull();
});
