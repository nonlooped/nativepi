import { ResizableHandle, ResizablePanel } from "./ui/resizable.tsx";
import { usePaneStore } from "../lib/store.ts";
import { insertBrowserAnnotation } from "../lib/browserAnnotations.ts";
import { showHint } from "../lib/toast.tsx";
import { NO_DRAG_REGION } from "../lib/utils.ts";
import { useEffect, useRef, useState } from "react";
export function useBrowserPanel(context: string) {
  const store = usePaneStore();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => window.nativepi?.browserPanel?.onChange(setId), []);
  useEffect(() => { setId(null); }, [context]);
  useEffect(() => window.nativepi?.browserPanel?.onAnnotation(raw => {
    const result = insertBrowserAnnotation(store, raw);
    if (result.error) showHint(result.error);
    if (!result.added) return;
    const { activeProjectPath, activeSessionFile } = store.getState();
    requestAnimationFrame(() => {
      // A chat change during the frame must not focus a different draft.
      const current = store.getState();
      if (current.activeProjectPath !== activeProjectPath || current.activeSessionFile !== activeSessionFile) return;
      const pane = document.querySelector('[data-workspace-pane][data-pane-active="true"]') ?? document;
      pane.querySelector<HTMLElement>('[data-composer-input][contenteditable="true"]')?.focus();
    });
  }), [store]);
  return id;
}
export function BrowserPanel({ id, hidden }: { id: string; hidden: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bridge = window.nativepi?.browserPanel;
    const node = ref.current;
    if (!bridge || !node) return;
    let previous = "";
    const update = () => {
      const rect = node.getBoundingClientRect();
      // Native views cover DOM controls regardless of z-index. Reserve the
      // actual window controls' row, including interface scaling.
      const controls = document.querySelector('[data-slot="window-controls"]')?.getBoundingClientRect();
      const titleBar = controls ? Math.max(0, controls.bottom - rect.top) : 0;
      const bounds = hidden || !!document.querySelector('[role="dialog"], [role="alertdialog"], [data-slot="dropdown-menu-content"], [data-slot="popover-content"]') || rect.width < 1 || rect.height <= titleBar ? undefined : { x: Math.round(rect.x), y: Math.round(rect.y + titleBar), width: Math.round(rect.width), height: Math.round(rect.height - titleBar) };
      const signature = JSON.stringify(bounds) ?? "hidden";
      if (signature !== previous) { previous = signature; void bridge.layout(id, bounds); }
    };
    // The panel library may finish its resize after the window event. Native
    // child views must also follow that settled layout when Chromium defers a
    // ResizeObserver frame (for example while a child view owns input).
    let resizeTask: ReturnType<typeof setTimeout> | undefined;
    const resized = () => {
      update();
      clearTimeout(resizeTask);
      resizeTask = setTimeout(update, 0);
    };
    const observer = new ResizeObserver(update); observer.observe(node);
    const overlays = new MutationObserver(update);
    overlays.observe(document.body, { childList: true, subtree: true });
    overlays.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", resized); update();
    return () => { observer.disconnect(); overlays.disconnect(); window.removeEventListener("resize", resized); clearTimeout(resizeTask); void bridge.layout(id); };
  }, [id, hidden]);
  // A draggable placeholder underneath a native view steals pointer events
  // from that view's toolbar, even when its own buttons use app-no-drag.
  return <div ref={ref} className={`h-full w-full bg-background ${NO_DRAG_REGION}`} aria-label="Shared browser" />;
}

/** The browser's place in the shared workspace layout. */
export function BrowserPanelSlot({ id, hidden }: { id: string | null; hidden: boolean }) {
  // A mounted, collapsed panel can regain its default width when a sibling
  // registers (for example Files after startup or a responsive layout change).
  // Keep a closed browser out of the layout instead of collapsing it later.
  if (!id) return null;
  return <>
    <ResizableHandle withHandle />
    <ResizablePanel id="browser" defaultSize="45%" minSize="320px">
      <BrowserPanel id={id} hidden={hidden} />
    </ResizablePanel>
  </>;
}
