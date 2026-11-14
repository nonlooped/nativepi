import type { AppState } from "./store/types.ts";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "./store/testBridge.ts";
import { useAppStore } from "./store.ts";
import { useWorkspaceShortcuts } from "../App.tsx";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const original = useAppStore.getState();
const noop = () => {};
function Harness() {
  useWorkspaceShortcuts("wide", noop, noop, noop, noop, noop);
  return <><div tabIndex={0} contentEditable data-composer-input="" /><button data-model-picker-trigger="">Model</button></>;
}
async function mount() {
  useAppStore.setState({ activeProjectPath: "/p", settingsOpen: false, extSurfaces: [], keybindingOverrides: {} });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
}
async function press(code: string, extra: KeyboardEventInit = {}) {
  const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const event = new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true,
    ...(mac ? { metaKey: true } : { ctrlKey: true }), ...extra });
  await act(async () => { window.dispatchEvent(event); });
  return event;
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; container?.remove();
  useAppStore.setState(original, true);
});

test("focus and model shortcuts reach the existing controls, including rebindings", async () => {
  await mount();
  const input = container!.querySelector<HTMLElement>("[data-composer-input]")!;
  let opened = 0;
  container!.querySelector("button")!.onclick = () => { opened++; };
  await press("KeyL");
  expect(document.activeElement).toBe(input);
  await press("KeyM", { shiftKey: true });
  expect(opened).toBe(1);
  await act(async () => { useAppStore.setState({ keybindingOverrides: { focusComposer: "$mod+KeyU", selectModel: "" } }); });
  input.blur();
  await press("KeyL");
  expect(document.activeElement).not.toBe(input);
  await press("KeyU");
  expect(document.activeElement).toBe(input);
  await press("KeyM", { shiftKey: true });
  expect(opened).toBe(1);
});

test("focus reaches the composer before a terminal can consume the control key", async () => {
  await mount();
  const terminal = document.createElement("textarea"); container!.append(terminal);
  let shellKeys = 0;
  terminal.addEventListener("keydown", event => { shellKeys++; event.stopPropagation(); });
  terminal.focus();
  const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const event = new KeyboardEvent("keydown", { code: "KeyL", key: "l", bubbles: true, cancelable: true,
    ...(mac ? { metaKey: true } : { ctrlKey: true }) });
  await act(async () => { terminal.dispatchEvent(event); });
  expect(document.activeElement).toBe(container!.querySelector("[data-composer-input]"));
  expect(shellKeys).toBe(0);
  expect(event.defaultPrevented).toBe(true);
});

test("navigation calls existing actions and respects settings, dialogs, extensions, and IME", async () => {
  await mount();
  const calls: unknown[] = [];
  useAppStore.setState({
    selectAdjacentChat: async d => { calls.push(d); },
    setDestination: async d => { calls.push(d); },
    addProject: async () => { calls.push("project"); },
  });
  await press("BracketRight", { shiftKey: true });
  await press("BracketLeft", { shiftKey: true });
  await press("Digit1", { altKey: true }); await press("Digit2", { altKey: true }); await press("KeyO");
  expect(calls).toEqual([1, -1, "chat", "work", "project"]);
  calls.length = 0;
  await act(async () => { useAppStore.setState({ settingsOpen: true }); });
  await press("Digit1", { altKey: true });
  await act(async () => { useAppStore.setState({ settingsOpen: false }); });
  const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
  try { await press("KeyO"); } finally { dialog.remove(); }
  useAppStore.setState({ extSurfaces: [{ placement: "editor" }] as typeof original.extSurfaces });
  await press("BracketRight", { shiftKey: true });
  useAppStore.setState({ extSurfaces: [] });
  await press("Digit2", { altKey: true, isComposing: true });
  expect(calls).toEqual([]);
});

test("each numbered shortcut selects its exact current sidebar index, with 0 selecting the tenth", async () => {
  await mount();
  const calls: unknown[] = [];
  const { createAppState } = await import("./store.ts");
  const { createStore } = await import("zustand/vanilla");
  const state = createStore<AppState>()(createAppState).getState();
  await act(async () => useAppStore.setState({ ...state, activeProjectPath: "/p", destination: "chat", chatRoot: "/chat",
    sessionsByProject: { "/chat": Array.from({ length: 10 }, (_, n) => ({ path: `s${n + 1}` })) as typeof state.sessionsByProject[string] },
    selectChat: async (...args) => { calls.push(args); } }));
  for (let n = 1; n <= 10; n++) await press(`Digit${n % 10}`);
  expect(calls).toEqual(Array.from({ length: 10 }, (_, n) => [`s${n + 1}`, "/chat"]));
  calls.length = 0;
  await act(async () => useAppStore.setState({ keybindingOverrides: { thread1: "", thread10: "$mod+KeyU" } }));
  await press("Digit1"); await press("Digit0"); await press("KeyU");
  expect(calls).toEqual([["s10", "/chat"]]);
  await act(async () => useAppStore.setState({ sessionsByProject: {} }));
  await press("Digit5");
  expect(calls).toHaveLength(1);
});

test("source control opens the pane for Work projects and refresh uses the existing action", async () => {
  await mount();
  let reads = 0;
  await act(async () => useAppStore.setState({ destination: "work", workRoot: "/free", contextPaneOpen: false, contextPaneTab: "files", refreshGit: async () => { reads++; } }));
  await press("KeyG", { shiftKey: true });
  expect(useAppStore.getState().contextPaneTab).toBe("changes");
  expect(useAppStore.getState().contextPaneOpen).toBe(true);
  expect(reads).toBe(1);
  await press("KeyR", { shiftKey: true });
  expect(reads).toBe(2);
  await act(async () => useAppStore.setState({ destination: "chat", contextPaneTab: "files" }));
  await press("KeyG", { shiftKey: true });
  expect(useAppStore.getState().contextPaneTab).toBe("files");
  expect(reads).toBe(2);
});


test("new terminal creates a shell before opening a hidden dock", async () => {
  await mount();
  const calls: unknown[] = [];
  stubInvoke(async (channel, params) => { if (channel === "terminalCreate") calls.push(params); return { terminal: { id: "new" } }; });
  await act(async () => useAppStore.setState({ destination: "work", terminalProjects: new Set() }));
  await press("KeyT", { shiftKey: true });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ projectDir: "/p" });
  expect(useAppStore.getState().terminalProjects.has("/p")).toBe(true);
  await press("KeyT", { shiftKey: true });
  expect(calls).toHaveLength(1); // An open dock owns subsequent creations.
});
