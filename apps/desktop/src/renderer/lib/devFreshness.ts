import type { DevRuntimeStatus } from "../../shared/rpc-schema.ts";

export type DevFreshness = "current" | "stale" | "unverified";

export function devFreshness(
  rendererGeneration: string,
  preloadGeneration: string,
  runtime: DevRuntimeStatus,
): DevFreshness {
  if (!runtime.development || !runtime.expected) return "unverified";

  const generations = [rendererGeneration, preloadGeneration, runtime.mainGeneration];
  return generations.every((generation) => generation === runtime.expected?.generation)
    ? "current"
    : "stale";
}
