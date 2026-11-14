import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import { THEME_CHANGE_EVENT } from "../lib/themes.ts";

const terminalOptions: Record<string, unknown>[] = [];

mock.module("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
mock.module("@xterm/xterm", () => ({ Terminal: class {
  options: Record<string, unknown>;
  cols = 80; rows = 24;
  constructor(options: Record<string, unknown>) { this.options = options; terminalOptions.push(options); }
  attachCustomKeyEventHandler() {}
  loadAddon() {}
  element?: HTMLTextAreaElement;
  open(container: HTMLElement) { this.element = document.createElement("textarea"); this.element.className = "xterm-helper-textarea"; container.append(this.element); }
  registerLinkProvider() { return { dispose() {} }; }
  onData() { return { dispose() {} }; }
  write() {}
  focus() { this.element?.focus(); }
  dispose() {}
} }));

const domTest = test.skipIf(typeof document === "undefined");
if (typeof document !== "undefined") {
  Object.defineProperty(globalThis, "DOMRect", { value: window.DOMRect, configurable: true });
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
}
const { default: TerminalDock } = await import("./TerminalDock.tsx");
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove(); root = undefined;
  terminalOptions.length = 0;
  document.documentElement.style.removeProperty("--sidebar");
});
async function render() {
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<TerminalDock projectDir="/project" onMinimize={() => {}} />); });
}
async function click(label: string) {
  const target = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(target).not.toBeNull();
  await act(async () => { target!.click(); });
}
const session = (id: string) => ({ id, projectDir: "/project", name: `Terminal ${id}`, shellId: "default", exited: false });

domTest("terminal cells let the dock surface show through and keep their contrast color on theme changes", async () => {
  stubInvoke(async channel => {
    if (channel === "terminalEnsure") return { terminals: [session("1")] };
    if (channel === "terminalListShells") return { shells: [] };
    if (channel === "terminalAttach") return { output: "", sequence: 0 };
    return { ok: true };
  });
  document.documentElement.style.setProperty("--sidebar", "#18252a");
  await render();
  expect(terminalOptions).toHaveLength(1);
  expect(terminalOptions[0]!.allowTransparency).toBe(true);
  expect(terminalOptions[0]!.theme).toMatchObject({ background: "#18252a00" });
  document.documentElement.style.setProperty("--sidebar", "#ece9e4");
  await act(() => { window.dispatchEvent(new Event(THEME_CHANGE_EVENT)); });
  expect(terminalOptions).toHaveLength(1);
  expect(terminalOptions[0]!.theme).toMatchObject({ background: "#ece9e400" });
});

domTest("split controls create shells in either direction without closing or restarting existing shells", async () => {
  const calls: string[] = [];
  let count = 1;
  stubInvoke(async channel => {
    calls.push(channel);
    if (channel === "terminalEnsure") return { terminals: [session("1")] };
    if (channel === "terminalCreate") return { terminal: session(String(++count)) };
    if (channel === "terminalListShells") return { shells: [] };
    if (channel === "terminalAttach") return { output: "", sequence: 0 };
    return { ok: true };
  });
  await render();
  await click("Split terminal above and below");
  expect(document.querySelector<HTMLElement>('[data-slot="resizable-panel-group"]')!.style.flexDirection).toBe("column");
  expect(document.querySelectorAll(".terminal-surface")).toHaveLength(2);
  await click("Split terminal side by side");
  expect(document.querySelector<HTMLElement>('[data-slot="resizable-panel-group"]')!.style.flexDirection).toBe("row");
  await click("New terminal");
  expect(document.querySelectorAll(".terminal-surface")).toHaveLength(4);
  expect(calls.filter(call => call === "terminalEnsure")).toHaveLength(1);
  expect(calls).not.toContain("terminalClose");
  expect(calls).not.toContain("terminalRestart");
});

domTest("a failed shell startup can be retried from the dock", async () => {
  let attempts = 0;
  stubInvoke(async channel => {
    if (channel === "terminalEnsure") {
      if (++attempts === 1) throw new Error("posix_spawnp failed.");
      return { terminals: [session("1")] };
    }
    if (channel === "terminalListShells") return { shells: [] };
    if (channel === "terminalAttach") return { output: "", sequence: 0 };
    return { ok: true };
  });
  await render();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("posix_spawnp failed.");
  await act(async () => { [...document.querySelectorAll("button")].find(button => button.textContent === "Retry")!.click(); });
  expect(attempts).toBe(2);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector(".terminal-surface")).not.toBeNull();
});

domTest("terminal keyboard commands switch focus, split, and close only the current project's dock", async () => {
  const original = useAppStore.getState();
  let count = 2;
  const closed: unknown[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "terminalEnsure") return { terminals: [session("1"), session("2")] };
    if (channel === "terminalCreate") return { terminal: session(String(++count)) };
    if (channel === "terminalClose") { closed.push(params); return { ok: true }; }
    if (channel === "terminalListShells") return { shells: [] };
    if (channel === "terminalAttach") return { output: "", sequence: 0 };
    return { ok: true };
  });
  useAppStore.setState({ activeProjectPath: "/project", destination: "work", settingsOpen: false, extSurfaces: [], keybindingOverrides: {} });
  const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const press = async (code: string, extra: KeyboardEventInit = {}) => {
    const target = document.activeElement ?? window;
    await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true,
      ...(mac ? { metaKey: true } : { ctrlKey: true }), ...extra })));
  };
  try {
    await render();
    const inputs = () => [...container!.querySelectorAll<HTMLTextAreaElement>("textarea")];
    inputs()[0]!.focus();
    await press("ArrowRight", { altKey: true });
    expect(document.activeElement).toBe(inputs()[1]);
    await press("ArrowRight", { altKey: true });
    expect(document.activeElement).toBe(inputs()[0]);
    await press("ArrowLeft", { altKey: true });
    expect(document.activeElement).toBe(inputs()[1]);
    await press("KeyD", { shiftKey: true, altKey: true });
    expect(inputs()).toHaveLength(3);
    expect(container!.querySelector<HTMLElement>('[data-slot="resizable-panel-group"]')!.style.flexDirection).toBe("column");
    inputs()[1]!.focus();
    await press("KeyW", { altKey: true });
    expect(closed).toEqual([{ projectDir: "/project", terminalId: "2" }]);
    await press("KeyT", { shiftKey: true });
    expect(inputs()).toHaveLength(3);
    await act(async () => useAppStore.setState({ settingsOpen: true }));
    await press("KeyT", { shiftKey: true });
    expect(inputs()).toHaveLength(3);
    await act(async () => useAppStore.setState({ settingsOpen: false, activeProjectPath: "/other" }));
    await press("KeyT", { shiftKey: true });
    expect(inputs()).toHaveLength(3);
  } finally { await act(async () => useAppStore.setState(original, true)); }
});
