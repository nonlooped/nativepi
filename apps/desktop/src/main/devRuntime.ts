import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const markerPath = join(tmpdir(), "nativepi-dev-run.json");
const markerSchema = z.object({
  generation: z.string().uuid(),
  startedAt: z.number().int().positive(),
  gitHead: z.string().optional(),
  dirty: z.boolean(),
});

export async function devRuntimeStatus() {
  if (!__NATIVEPI_DEV_GENERATION__) return { development: false as const };

  try {
    const marker = markerSchema.parse(JSON.parse(await readFile(markerPath, "utf8")));
    return {
      development: true as const,
      mainGeneration: __NATIVEPI_DEV_GENERATION__,
      expected: marker,
    };
  } catch {
    return {
      development: true as const,
      mainGeneration: __NATIVEPI_DEV_GENERATION__,
    };
  }
}
