import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
mock.module("./FileTypeIcon.tsx", () => ({ default: () => null }));
const { default: WorkspaceEditor } = await import("./WorkspaceEditor.tsx");
import { useAppStore } from "../lib/store.ts";
import { useWorkspaceEditor } from "../lib/workspaceEditor.ts";
import { runtime } from "../lib/store/internals.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";
let root: Root; let host: HTMLDivElement;
const original = useAppStore.getState();
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); useAppStore.setState(original, true); useWorkspaceEditor.setState({ buffers: {}, selected: {} }); });
test("file commands follow rebindings, stay within the editor and save the edited text", async () => {
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  let written = "";
  stubInvoke(async (channel, params) => {
    if (channel === "saveWorkspaceFile") { written = (params as { text: string }).text; return { ok: true, revision: "r2" }; }
    return { text: "before", revision: "r1" };
  });
  useAppStore.setState({ settingsOpen: false, appPanel: null, extSurfaces: [], keybindingOverrides: { saveFile: "$mod+Shift+KeyS", findInFile: "$mod+KeyU" } });
  const key = "audit";
  useWorkspaceEditor.setState({ buffers: { [key]: { key, projectDir: "/p", file: "test.txt", text: "after", saved: "before", revision: "r1", saving: false } }, selected: { [`${runtime(useAppStore.getState).paneId}:/p`]: key } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<WorkspaceEditor projectDir="/p" />));
  const editor = host.querySelector<HTMLElement>(".cm-content")!;
  const press = async (code: string, shiftKey = false) => {
    const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const event = new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true, shiftKey, ...(mac ? { metaKey: true } : { ctrlKey: true }) });
    await act(async () => { host.querySelector<HTMLElement>(".cm-content")!.dispatchEvent(event); });
    return event;
  };
  await press("KeyS"); expect(written).toBe("");
  await press("KeyS", true); expect(written).toBe("after");
  expect(useWorkspaceEditor.getState().buffers[key]!.saved).toBe("after");
  await press("KeyU");
  expect(host.querySelector('[aria-label="Find in file"]')).not.toBeNull();
});
