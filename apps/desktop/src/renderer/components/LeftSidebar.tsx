import type { ReactNode } from "react";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { Button } from "@/components/ui/button.tsx";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable.tsx";
import { DRAG_REGION, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import { useAppStore } from "@/lib/store.ts";
import NativePiWordmark from "./NativePiWordmark.tsx";

export default function LeftSidebar({
  children,
  actionIcon,
  actionLabel,
  onAction,
  onClose,
  overlay = false,
}: {
  children: ReactNode;
  actionIcon: ReactNode;
  actionLabel: string;
  onAction: () => void;
  onClose: () => void;
  overlay?: boolean;
}) {
  const sidebarSize = useAppStore((s) => s.sidebarSize);
  const setSidebarSize = useAppStore((s) => s.setSidebarSize);

  const content = (
    <aside className="sidebar-panel flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* h-12 matches the conversation and context pane headers: three adjacent
          pane headers on two different baselines is a seam you cannot unsee. */}
      <div className={cn("flex h-12 shrink-0 items-center px-4", !overlay && DRAG_REGION)}>
        <div className={cn("flex items-center gap-2", NO_DRAG_REGION)}>
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close sidebar" aria-label="Close sidebar">
            <SidebarSimpleIcon />
          </Button>
          <NativePiWordmark />
        </div>
      </div>

      {children}

      <div className={cn("shrink-0 border-t border-sidebar-border p-3", NO_DRAG_REGION)}>
        <Button variant="ghost" className="w-full justify-start" onClick={onAction}>
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
        defaultSize={`${sidebarSize}%`}
        minSize="14%"
        maxSize="30%"
        onResize={(size) => setSidebarSize(size.asPercentage)}
      >
        {content}
      </ResizablePanel>
      <ResizableHandle className="hover:bg-ring focus-visible:bg-ring" />
    </>
  );
}
