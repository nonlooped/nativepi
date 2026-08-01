import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SERVICE_TIER, type ServiceTier, supportsFastServiceTier } from "../../../shared/serviceTier.ts";

const serviceTierBySession = new Map<string, ServiceTier>();
let pendingServiceTier: ServiceTier = DEFAULT_SERVICE_TIER;

/** Update the tier used by the session named by the NativePi side channel. */
export function setNativePiServiceTier(sessionFile: string | null, tier: ServiceTier): void {
  if (sessionFile) serviceTierBySession.set(sessionFile, tier);
  else pendingServiceTier = tier;
}

function serviceTierForSession(sessionFile: string | undefined): ServiceTier {
  return (sessionFile ? serviceTierBySession.get(sessionFile) : undefined) ?? pendingServiceTier;
}

function isPayloadRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}

/**
 * OpenAI's Codex API calls the Fast tier `priority`. Pi's provider hook gives us
 * the assembled request body, so this changes only the transport payload and not
 * the prompt, model selection, tool loop, or session entries.
 */
export function applyServiceTierPayload(payload: unknown, tier: ServiceTier): unknown {
  if (!isPayloadRecord(payload)) return payload;
  const next = { ...payload };
  if (tier === "fast") next["service_tier"] = "priority";
  else delete next["service_tier"];
  return next;
}

function activateServiceTierExtension(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event, context) => {
    if (!supportsFastServiceTier(context.model)) return;
    return applyServiceTierPayload(
      event.payload,
      serviceTierForSession(context.sessionManager.getSessionFile()),
    );
  });
}

export const nativePiServiceTierExtension: InlineExtension = {
  name: "NativePi service tiers",
  factory: activateServiceTierExtension,
  hidden: true,
};
