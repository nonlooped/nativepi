import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { createPaneStore, PaneStoreContext, releasePaneStore, type PaneStore } from "../lib/store.ts";
import { paneWorkspaceTabs, tabId } from "../lib/workspaceTabs.ts";
import { useWorkspaceEditor } from "../lib/workspaceEditor.ts";
mock.module("./FileTypeIcon.tsx", () => ({ default: () => null }));
const { default: WorkspaceTabs } = await import("./WorkspaceTabs.tsx");
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let root: Root, container: HTMLDivElement, app: PaneStore;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); if (app) releasePaneStore(app); useWorkspaceEditor.setState({ buffers: {}, selected: {}, loading: {} }); });
async function mount() {
  stubInvoke(async () => ({ text: "saved", revision: "v1" }));
  app = createPaneStore();
  app.setState({ ready: true, activeProjectPath: "/project", activeSessionFile: "a", sessionsByProject: { "/project": [{ path: "a", name: "Plan release", providers: [] }, { path: "b", name: "Review settings", providers: [] }] as any },
    selectChat: async session => { app.setState(s => ({ activeSessionFile: session, selectionVersion: s.selectionVersion + 1 })); },
    keybindingOverrides: { nextWorkspaceTab: "Alt+KeyN", closeWorkspaceTab: "Alt+KeyW" },
  });
  const tabs = paneWorkspaceTabs(app);
  await tabs.activate({ kind: "thread", projectDir: "/project", session: "b" }); await tabs.activate({ kind: "file", projectDir: "/project", file: "one.ts" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<PaneStoreContext value={app}><WorkspaceTabs><input aria-label="Editor" /></WorkspaceTabs></PaneStoreContext>));
  return tabs;
}
function button(label: string) { return [...document.querySelectorAll<HTMLElement>("button")].find(b => b.getAttribute("aria-label") === label || b.textContent === label)!; }
function active() { return container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("aria-label"); }
test("tab close asks before discarding edits; cancel keeps the buffer and discard selects its neighbour", async () => {
  await mount(); const key = Object.keys(useWorkspaceEditor.getState().buffers)[0]!;
  await act(async () => useWorkspaceEditor.getState().edit(key, "unsaved"));
  await act(async () => button("Close one.ts").click());
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Discard unsaved edits?");
  await act(async () => button("Cancel").click());
  expect(active()).toContain("one.ts"); expect(useWorkspaceEditor.getState().buffers[key]?.text).toBe("unsaved");
  await act(async () => button("Close one.ts").click());
  await act(async () => button("Discard edits").click());
  expect(active()).toBe("Review settings"); expect(useWorkspaceEditor.getState().buffers[key]).toBeUndefined();
});
test("rebound tab shortcuts work from content, respect dialogs, and arrow navigation moves tab focus", async () => {
  await mount(); const input = container.querySelector("input")!;
  const key = async (target: Element, value: string, code: string, altKey = false, ctrlKey = false) => { await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: value, code, altKey, ctrlKey })); }); };
  await key(input, "Tab", "Tab", false, true); expect(active()).toContain("one.ts");
  await key(input, "n", "KeyN", true); expect(active()).toBe("Plan release");
  const tab = container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!; tab.focus();
  await key(tab, "ArrowRight", "ArrowRight");
  expect(active()).toBe("Review settings");
  const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
  await key(input, "w", "KeyW", true); expect(active()).toBe("Review settings"); dialog.remove();
  await key(input, "w", "KeyW", true); expect(active()).toContain("one.ts");
});


test("restoring mixed-project tabs loads their names even when another folder is selected", async () => {
  await mount();
  await act(async () => {
    app.setState({ sessionsByProject: {}, sessionLoadStates: {}, refreshSessions: async project => {
      await Promise.resolve();
      app.setState(s => ({ sessionsByProject: { ...s.sessionsByProject, [project]: [{ path: project === "/other" ? "c" : "a", name: project === "/other" ? "Migration" : "Release" }] as any }, sessionLoadStates: { ...s.sessionLoadStates, [project]: "loaded" } }));
    } });
    const other = { kind: "thread" as const, projectDir: "/other", session: "c" };
    paneWorkspaceTabs(app, { work: { tabs: [{ kind: "thread", projectDir: "/project", session: "a" }, other], active: tabId({ kind: "thread", projectDir: "/project", session: "a" }) } });
  });
  expect([...container.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(["Releaseproject", "Migrationother"]);
});


test("overflow keeps the selected tab visible and the menu follows selection with conventional radio feedback", async () => {
  const OriginalObserver = globalThis.ResizeObserver;
  let resize = () => {};
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) { if (element.querySelector(':scope > [role="tablist"]')) resize = () => this.callback([], this as unknown as ResizeObserver); }
    disconnect() {} unobserve() {}
  } as typeof ResizeObserver;
  try {
    await mount();
    const lane = container.querySelector('[role="tablist"]')!.parentElement!;
    let width = 160;
    Object.defineProperty(lane, "clientWidth", { get: () => width });
    await act(async () => resize());
    expect([...container.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute("aria-label"))).toEqual(["one.ts"]);
    await act(async () => button("All open tabs").click());
    const current = document.querySelector('[role="menuitemradio"][aria-checked="true"]');
    expect(current?.textContent).toBe("one.ts");
    const review = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(item => item.textContent === "Review settings")!;
    await act(async () => review.click());
    expect(app.getState().activeSessionFile).toBe("b");
    expect(active()).toBe("Review settings");
    width = 384;
    await act(async () => resize());
    expect(button("All open tabs")).toBeUndefined();
    expect([...container.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute("aria-label"))).toEqual(["Plan release", "Review settings", "one.ts"]);
  } finally { globalThis.ResizeObserver = OriginalObserver; }
});
