import { useState, type ReactNode } from "react";
import { ColumnsIcon } from "@phosphor-icons/react/Columns";
import { RowsIcon } from "@phosphor-icons/react/Rows";
import { THREAD_DRAG_TYPE, useWorkspacePanes, type PaneSide } from "../lib/workspacePanes.ts";
import { cn } from "../lib/utils.ts";

/** Only our sidebar chat drag claims this area; files and text keep their existing behavior. */
export default function ThreadDropTarget({ index, children }: { index: number; children: ReactNode }) {
  const panes = useWorkspacePanes();
  const [side, setSide] = useState<PaneSide | null>(null);
  const dragging = panes?.dragging;
  const accepts = (event: React.DragEvent) => !!dragging && event.dataTransfer.types.includes(THREAD_DRAG_TYPE);
  const full = (panes?.count ?? 0) >= 3;
  return <div className="relative flex h-full min-h-0 min-w-0 flex-col"
    onDragOverCapture={event => {
      if (!accepts(event)) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = full ? "none" : "copy";
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const edges: [PaneSide, number][] = [["right", rect.width - x], ["left", x], ["bottom", rect.height - y], ["top", y]];
      setSide(edges.reduce((closest, edge) => edge[1] < closest[1] ? edge : closest)[0]);
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSide(null); }}
    onDropCapture={event => {
      if (!accepts(event) || !panes || !dragging) return;
      event.preventDefault(); event.stopPropagation();
      const target = side ?? "right";
      setSide(null); panes.endDrag();
      if (!full) panes.openThread(dragging, target, index);
    }}>
    {children}
    {dragging && side ? <div data-thread-drop-side={side} role="status" className={cn(
      "pointer-events-none absolute z-30 flex items-center justify-center rounded-xl border border-ring/50 bg-sidebar/90 p-4 text-center text-sm text-sidebar-foreground shadow-lg backdrop-blur-sm",
      full ? "inset-2" : side === "left" ? "inset-y-2 left-2 w-[calc(50%-0.75rem)]" : side === "right" ? "inset-y-2 right-2 w-[calc(50%-0.75rem)]" : side === "top" ? "inset-x-2 top-2 h-[calc(50%-0.75rem)]" : "inset-x-2 bottom-2 h-[calc(50%-0.75rem)]",
    )}><span className="flex min-w-0 flex-col items-center gap-2">
      {side === "left" || side === "right" ? <ColumnsIcon className="size-5 text-muted-foreground" /> : <RowsIcon className="size-5 text-muted-foreground" />}
      <span className="font-medium">{full ? "Up to three chats can be open" : `Open ${side === "left" || side === "right" ? "beside this chat" : side === "top" ? "above this chat" : "below this chat"}`}</span>
      {!full ? <span className="line-clamp-2 break-words text-xs text-muted-foreground">{dragging.title}</span> : null}
    </span></div> : null}
  </div>;
}
