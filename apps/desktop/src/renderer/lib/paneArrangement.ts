import { workspaceTabsSchema } from "./workspaceTabs.ts";
import { z } from "zod";
export const paneArrangementSchema = z.object({
  orientation: z.enum(["horizontal", "vertical"]), active: z.number().int().min(0).max(2),
  panes: z.array(z.object({ project: z.string().nullable(), session: z.string().nullable(), tabs: workspaceTabsSchema.catch({}).optional() })).min(1).max(3),
  sizes: z.record(z.string(), z.number().min(0).max(100)).optional(),
});
export function readPaneArrangement() {
  try { return paneArrangementSchema.parse(JSON.parse(localStorage.getItem("nativepi-conversation-panes") ?? "null")); } catch { return undefined; }
}


export async function restorePaneSelection(store: Pick<import("./store.ts").PaneStore, "getState">, pane: { project: string | null; session: string | null } | undefined) {
  if (!pane?.project) return;
  const state = store.getState();
  if (!state.reopenLastProject && pane.project !== state.chatRoot) return;
  if (pane.session) await store.getState().selectChat(pane.session, pane.project);
  else await store.getState().selectProject(pane.project);
}
