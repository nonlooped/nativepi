import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "./store/testBridge.ts";
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
  await press("Digit1"); await press("Digit2"); await press("KeyO");
  expect(calls).toEqual([1, -1, "chat", "work", "project"]);
  calls.length = 0;
  await act(async () => { useAppStore.setState({ settingsOpen: true }); });
  await press("Digit1");
  await act(async () => { useAppStore.setState({ settingsOpen: false }); });
  const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
  try { await press("KeyO"); } finally { dialog.remove(); }
  useAppStore.setState({ extSurfaces: [{ placement: "editor" }] as typeof original.extSurfaces });
  await press("BracketRight", { shiftKey: true });
  useAppStore.setState({ extSurfaces: [] });
  await press("Digit2", { isComposing: true });
  expect(calls).toEqual([]);
});
