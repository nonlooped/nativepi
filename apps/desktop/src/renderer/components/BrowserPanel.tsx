import { NO_DRAG_REGION } from "../lib/utils.ts";
import { useEffect, useRef, useState } from "react";
export function useBrowserPanel(context: string) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => window.nativepi?.browserPanel?.onChange(setId), []);
  useEffect(() => { setId(null); }, [context]);
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
    const observer = new ResizeObserver(update); observer.observe(node);
    const overlays = new MutationObserver(update);
    overlays.observe(document.body, { childList: true, subtree: true });
    overlays.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", update); update();
    return () => { observer.disconnect(); overlays.disconnect(); window.removeEventListener("resize", update); void bridge.layout(id); };
  }, [id, hidden]);
  // A draggable placeholder underneath a native view steals pointer events
  // from that view's toolbar, even when its own buttons use app-no-drag.
  return <div ref={ref} className={`h-full w-full bg-background ${NO_DRAG_REGION}`} aria-label="Shared browser" />;
}
