import { expect, mock, test } from "bun:test";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PaneStoreContext, createPaneStore, releasePaneStore } from "../lib/store.ts";
import { paneWorkspaceTabs, tabId } from "../lib/workspaceTabs.ts";
mock.module("./SourceControlReview.tsx", () => ({ default: () => <div className="overflow-auto" ref={element => {
  if (element) { Object.defineProperty(element, "clientHeight", { value: 300, configurable: true }); Object.defineProperty(element, "scrollHeight", { value: 1200, configurable: true }); }
}}>Saved commit contents</div> }));
const { default: WorkspaceDiff } = await import("./WorkspaceDiff.tsx");
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const settle = async () => act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); });

test("returning from another folder restores a diff's reading position under Strict Mode", async () => {
  const app = createPaneStore(); app.setState({ ready: true, activeProjectPath: "/project", activeSessionFile: "a" });
  const tabs = paneWorkspaceTabs(app);
  const tab = { kind: "diff" as const, projectDir: "/project", path: "one.ts", staged: false, hash: "1234567" };
  tabs.diffPositions.set(tabId(tab), new Map([[0, { top: 250, left: 0 }]]));
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const render = async () => act(async () => root.render(<StrictMode><PaneStoreContext value={app}><WorkspaceDiff tab={tab} review={{ projectDir: "/project", path: tab.path, staged: false, hash: tab.hash }} active /></PaneStoreContext></StrictMode>));
  try {
    await render(); await settle();
    const scroller = container.querySelector<HTMLElement>(".overflow-auto")!;
    expect(scroller.scrollTop).toBe(250);
    await act(async () => { scroller.scrollTop = 700; scroller.dispatchEvent(new Event("scroll")); });
    await act(async () => root.render(null));
    await render(); await settle();
    expect(container.querySelector<HTMLElement>(".overflow-auto")!.scrollTop).toBe(700);
  } finally { await act(async () => root.unmount()); container.remove(); releasePaneStore(app); }
});
