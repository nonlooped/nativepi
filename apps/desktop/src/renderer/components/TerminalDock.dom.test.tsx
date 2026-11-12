import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";

mock.module("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
mock.module("@xterm/xterm", () => ({ Terminal: class {
  options: Record<string, unknown>;
  cols = 80; rows = 24;
  constructor(options: Record<string, unknown>) { this.options = options; }
  attachCustomKeyEventHandler() {}
  loadAddon() {}
  open() {}
  registerLinkProvider() { return { dispose() {} }; }
  onData() { return { dispose() {} }; }
  write() {}
  focus() {}
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
