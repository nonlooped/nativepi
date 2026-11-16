import { z } from "zod";
export const paneArrangementSchema = z.object({
  orientation: z.enum(["horizontal", "vertical"]), active: z.number().int().min(0).max(2),
  panes: z.array(z.object({ project: z.string().nullable(), session: z.string().nullable() })).min(1).max(3),
  sizes: z.record(z.string(), z.number().min(0).max(100)).optional(),
});
export function readPaneArrangement() {
  try { return paneArrangementSchema.parse(JSON.parse(localStorage.getItem("nativepi-conversation-panes") ?? "null")); } catch { return undefined; }
}
