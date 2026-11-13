import type { ReactNode } from "react";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { Button } from "@/components/ui/button.tsx";
import { ResizableHandle, ResizablePanel, useCollapsiblePanel } from "@/components/ui/resizable.tsx";
import { DRAG_REGION, NO_DRAG_REGION, TRAFFIC_LIGHTS_CLEARANCE, cn } from "@/lib/utils.ts";
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
  layoutKey,
}: {
  children: ReactNode;
  actionIcon: ReactNode;
  actionLabel: string;
  onAction: () => void;
  onClose: () => void;
  open: boolean;
  overlay?: boolean;
  /** Reapply the collapsed state after a sibling pane changes the group layout. */
  layoutKey?: unknown;
}) {
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const panelRef = useCollapsiblePanel(open, layoutKey);

  const content = (
    <aside
      className="sidebar-panel flex h-full min-w-0 flex-col bg-sidebar text-muted-foreground"
    >
      {/* h-12 matches the conversation and context pane headers: three adjacent
          pane headers on two different baselines is a seam you cannot unsee. */}
      <div className={cn("flex h-12 shrink-0 items-center px-3", TRAFFIC_LIGHTS_CLEARANCE, !overlay && DRAG_REGION)}>
        <div className={cn("native-header-content flex min-w-0 flex-1 items-center gap-2", NO_DRAG_REGION)}>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={onClose} title="Close sidebar" aria-label="Close sidebar">
            <SidebarSimpleIcon className="size-5" />
          </Button>
          <NativePiWordmark compact />
        </div>
      </div>

      {children}

      {/* The bottom padding clears the iOS home indicator, which otherwise sits
          over this button. `env()` is 0 on every other platform. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]",
          NO_DRAG_REGION,
        )}
      >
        <Button variant="ghost" className="min-w-0 flex-1 justify-start text-muted-foreground" onClick={onAction}>
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
        defaultSize={`${sidebarWidth}px`}
        groupResizeBehavior="preserve-pixel-size"
        minSize="192px"
        maxSize="480px"
        data-pane-motion="left"
        inert={!open || undefined}
        className={cn(
          "h-full transition-[opacity,translate] duration-200 ease-out",
          open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-2 opacity-0",
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
          "transition-[opacity,background-color] duration-200 ease-out hover:bg-ring focus-visible:bg-ring",
          !open && "w-0 opacity-0 after:hidden",
        )}
      />
    </>
  );
}
