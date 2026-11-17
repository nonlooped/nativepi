import { afterEach, expect, test } from "bun:test";
import { act, useCallback, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, useCollapsiblePanel } from "./resizable.tsx";

let root: Root;
let container: HTMLDivElement;
let panel: PanelImperativeHandle | null;

function assignRef(ref: Ref<PanelImperativeHandle | null>, value: PanelImperativeHandle | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function Shell({ ready, open }: { ready: boolean; open: boolean }) {
  const panelRef = useCollapsiblePanel(open);
  const capturePanel = useCallback((value: PanelImperativeHandle | null) => {
    panel = value;
    assignRef(panelRef, value);
  }, [panelRef]);
  if (!ready) return <p>Starting NativePi…</p>;
  return <ResizablePanelGroup orientation="horizontal">
    <ResizablePanel id="conversation">Conversation</ResizablePanel>
    <ResizableHandle />
    <ResizablePanel id="browser" collapsible defaultSize="45%" minSize="320px" panelRef={capturePanel}>Browser</ResizablePanel>
  </ResizablePanelGroup>;
}

async function render(ready: boolean, open = false) {
  await act(async () => { root.render(<Shell ready={ready} open={open} />); });
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test("a closed browser collapses when the shell mounts after startup and still opens and closes", async () => {
  Reflect.set(globalThis, "DOMRect", window.DOMRect);
  Reflect.set(globalThis, "requestAnimationFrame", window.requestAnimationFrame.bind(window));
  Reflect.set(globalThis, "cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
  // happy-dom has no layout engine. Supply the Group's measurement boundary;
  // assertions use the real panel's public state rather than DOM/CSS sizes.
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1280 });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  try {
    await render(false);
    await render(true);
    expect(panel?.isCollapsed()).toBe(true);
    await render(true, true);
    expect(panel?.isCollapsed()).toBe(false);
    await render(true, false);
    expect(panel?.isCollapsed()).toBe(true);
  } finally {
    if (width) Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
    else Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  }
});
