import { createContext, useContext } from "react";
export type WorkspacePanes = {
  count: number; active: number; activePaneId: string; narrow: boolean; orientation: "horizontal" | "vertical";
  splitting: boolean; select: (index: number) => void; split: (orientation: "horizontal" | "vertical") => void;
  close: (index: number) => void; unsplit: () => void; arrange: (orientation: "horizontal" | "vertical") => void;
  titles: string[];
};
export const WorkspacePanesContext = createContext<WorkspacePanes | null>(null);
export const useWorkspacePanes = () => useContext(WorkspacePanesContext);
