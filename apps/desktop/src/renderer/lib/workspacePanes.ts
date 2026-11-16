import { createContext, useContext } from "react";
export type PaneThread = { projectDir: string; sessionFile: string; title: string };
export type PaneSide = "left" | "right" | "top" | "bottom";
export const THREAD_DRAG_TYPE = "application/x-nativepi-thread";
export type WorkspacePanes = {
  count: number; active: number; activePaneId: string; narrow: boolean; orientation: "horizontal" | "vertical";
  splitting: boolean; select: (index: number) => void; split: (orientation: "horizontal" | "vertical") => void;
  close: (index: number) => void; unsplit: () => void; arrange: (orientation: "horizontal" | "vertical") => void;
  titles: string[];
  openThread: (thread: PaneThread, side: PaneSide, target?: number) => void;
  dragging: PaneThread | null;
  startDrag: (thread: PaneThread) => void;
  endDrag: () => void;
};
export const WorkspacePanesContext = createContext<WorkspacePanes | null>(null);
export const useWorkspacePanes = () => useContext(WorkspacePanesContext);
