import { z } from "zod";

export const MAX_DIFF_PREVIEW_BYTES = 1024 * 1024;
export const diffPreviewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("diff"), patch: z.string() }),
  z.object({ kind: z.literal("large"), bytes: z.number() }),
]);
export type DiffPreviewResult = z.infer<typeof diffPreviewSchema>;
