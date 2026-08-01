import type { ModelInfo } from "./pi-types.ts";

export type ServiceTier = "standard" | "fast";

export const DEFAULT_SERVICE_TIER: ServiceTier = "standard";

/**
 * Pi 0.83 does not expose provider service-tier metadata in its model shape.
 * Keep this allowlist conservative until Pi can provide the catalog's tiers.
 */
const FAST_MODEL_IDS = new Set([
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
]);

export function supportsFastServiceTier(model?: Pick<ModelInfo, "provider" | "id"> | null): boolean {
  return model?.provider === "openai-codex" && FAST_MODEL_IDS.has(model.id);
}

export function serviceTierKey(projectDir: string, sessionFile: string | null | undefined): string {
  return sessionFile ?? `new:${projectDir}`;
}
