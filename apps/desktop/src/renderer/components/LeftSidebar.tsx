import type { ReactNode } from "react";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { Button } from "@/components/ui/button.tsx";
import { ResizableHandle, ResizablePanel, useCollapsiblePanel } from "@/components/ui/resizable.tsx";
import { DRAG_REGION, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import { useAppStore } from "@/lib/store.ts";
import NativePiWordmark from "./NativePiWordmark.tsx";

export default function LeftSidebar({
  children,
  actionIcon,
  actionLabel,
  onAction,
  onClose,
  open,
  overlay = false,
}: {
  children: ReactNode;
  actionIcon: ReactNode;
  actionLabel: string;
  onAction: () => void;
  onClose: () => void;
  open: boolean;
  overlay?: boolean;
}) {
  const sidebarSize = useAppStore((s) => s.sidebarSize);
  const setSidebarSize = useAppStore((s) => s.setSidebarSize);
  const panelRef = useCollapsiblePanel(open);

  function saveSidebarSize() {
    const size = panelRef.current?.getSize();
    if (size && size.inPixels > 0) setSidebarSize(size.asPercentage);
  }

  const content = (
    <aside className="sidebar-panel flex h-full min-w-[220px] flex-col bg-sidebar text-muted-foreground">
      {/* h-12 matches the conversation and context pane headers: three adjacent
          pane headers on two different baselines is a seam you cannot unsee. */}
      <div className={cn("flex h-12 shrink-0 items-center px-2", !overlay && DRAG_REGION)}>
        <div className={cn("flex items-center gap-2", NO_DRAG_REGION)}>
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close sidebar" aria-label="Close sidebar">
            <SidebarSimpleIcon />
          </Button>
          <NativePiWordmark />
        </div>
      </div>

      {children}

      {/* The bottom padding clears the iOS home indicator, which otherwise sits
          over this button. `env()` is 0 on every other platform. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          NO_DRAG_REGION,
        )}
      >
        <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start text-muted-foreground" onClick={onAction}>
          {actionIcon}
          {actionLabel}
        </Button>
      </div>
    </aside>
  );

  if (overlay) return content;

  return (
    <>
      <ResizablePanel
        id="projects"
        panelRef={panelRef}
        collapsible
        collapsedSize="0%"
        defaultSize={`${sidebarSize}%`}
        minSize="220px"
        maxSize="30%"
        data-pane-motion="left"
        inert={!open || undefined}
        className={cn(
          "h-full transition-[opacity,transform,filter] duration-200 ease-out",
          open ? "translate-x-0 opacity-100 blur-none" : "pointer-events-none -translate-x-2 opacity-0 blur-[2px]",
        )}
        onResize={(size, _id, previousSize) => {
          if (size.inPixels === 0 && previousSize && previousSize.inPixels > 0 && open) onClose();
        }}
      >
        {content}
      </ResizablePanel>
      <ResizableHandle
        disabled={!open}
        className={cn(
          "transition-[width,opacity,background-color] duration-200 ease-out hover:bg-ring focus-visible:bg-ring",
          !open && "w-0 opacity-0 after:hidden",
        )}
        onPointerUp={saveSidebarSize}
        onKeyUp={saveSidebarSize}
      />
    </>
  );
}
