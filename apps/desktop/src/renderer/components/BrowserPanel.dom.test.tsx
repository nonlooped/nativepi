import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserPanel } from "./BrowserPanel.tsx";

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
