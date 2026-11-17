import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserPanel, BrowserPanelSlot } from "./BrowserPanel.tsx";

test("native browser bounds follow the settled window resize without waiting for a ResizeObserver frame", async () => {
  const originalObserver = globalThis.ResizeObserver;
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const originalBridge = window.nativepi!.browserPanel;
  // A native child can own input while the app renderer defers observer frames.
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  let rect = { x: 704, y: 0, width: 576, height: 840 };
  HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
  let nativeViewport: unknown;
  Object.assign(window.nativepi!, { browserPanel: { layout: async (id: string, bounds: unknown) => { nativeViewport = { id, bounds }; } } });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const id = "00000000-0000-4000-8000-000000000001";
  const settlePanels = () => { rect = { x: 396, y: 0, width: 324, height: 740 }; };
  try {
    await act(async () => root.render(<BrowserPanel id={id} hidden={false} />));
    // React/panel layout settles later in the same window event, after the
    // browser's first measurement. The native viewport must not retain 576px.
    window.addEventListener("resize", settlePanels, { once: true });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(nativeViewport).toEqual({ id, bounds: { x: 396, y: 0, width: 324, height: 740 } });
  } finally {
    window.removeEventListener("resize", settlePanels);
    await act(async () => root.unmount()); container.remove();
    globalThis.ResizeObserver = originalObserver;
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    window.nativepi!.browserPanel = originalBridge;
  }
});


test("a closed browser reserves no space when Files mounts, and opening and closing it preserves the draft", async () => {
  const { ResizablePanel, ResizablePanelGroup } = await import("./ui/resizable.tsx");
  const { usePanelCallbackRef } = await import("react-resizable-panels");
  const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1280 });
  Reflect.set(globalThis, "DOMRect", window.DOMRect);
  Reflect.set(globalThis, "requestAnimationFrame", window.requestAnimationFrame.bind(window));
  Reflect.set(globalThis, "cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
  let conversation: import("react-resizable-panels").PanelImperativeHandle | null = null;
  function Shell({ files, browser }: { files: boolean; browser: string | null }) {
    const [panel, ref] = usePanelCallbackRef();
    conversation = panel;
    return <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel id="conversation" panelRef={ref}><textarea aria-label="Draft" /></ResizablePanel>
      {files ? <ResizablePanel id="files" defaultSize="20%">Files</ResizablePanel> : null}
      <BrowserPanelSlot id={browser} hidden={false} />
    </ResizablePanelGroup>;
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  async function render(files: boolean, browser: string | null = null) {
    await act(async () => root.render(<Shell files={files} browser={browser} />));
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  }
  try {
    await render(false);
    expect(conversation!.getSize().asPercentage).toBe(100);
    const draft = container.querySelector("textarea")!;
    draft.value = "Keep this draft"; draft.focus();
    await render(true);
    expect(conversation!.getSize().asPercentage).toBe(80);
    await render(true, "browser-session");
    expect(container.querySelector('[aria-label="Shared browser"]')).not.toBeNull();
    expect(conversation!.getSize().asPercentage).toBe(35);
    await render(true);
    expect(container.querySelector('[aria-label="Shared browser"]')).toBeNull();
    expect(conversation!.getSize().asPercentage).toBe(80);
    expect(document.activeElement).toBe(draft);
    expect(draft.value).toBe("Keep this draft");
  } finally {
    await act(async () => root.unmount()); container.remove();
    if (originalWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  }
});
