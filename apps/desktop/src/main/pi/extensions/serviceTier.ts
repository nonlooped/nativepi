import type { ExtensionAPI, ExtensionContext, InlineExtension } from "@earendil-works/pi-coding-agent";

type ServiceTier = "standard" | "fast";

const DEFAULT_SERVICE_TIER: ServiceTier = "standard";
const FAST_MODEL_IDS = new Set([
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
]);
const SERVICE_TIER_ENTRY = "nativepi-service-tier";
const SERVICE_TIER_STATUS = "nativepi-service-tier";

/** Keep this extension self-contained: NativePi copies this file to Pi's config. */
export function supportsFastServiceTier(model?: { provider?: string; id?: string } | null): boolean {
  return model?.provider === "openai-codex" && FAST_MODEL_IDS.has(model.id ?? "");
}

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

function activateNativePiServiceTierExtension(pi: ExtensionAPI): void {
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
  factory: activateNativePiServiceTierExtension,
  hidden: true,
};

function persistedTier(context: ExtensionContext): ServiceTier {
  const entries = context.sessionManager.getEntries();
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== SERVICE_TIER_ENTRY) continue;
    const tier = (entry.data as { tier?: unknown } | undefined)?.tier;
    if (tier === "standard" || tier === "fast") return tier;
  }
  return DEFAULT_SERVICE_TIER;
}

function updateStandaloneStatus(context: ExtensionContext, tier: ServiceTier): void {
  context.ui.setStatus(
    SERVICE_TIER_STATUS,
    supportsFastServiceTier(context.model) ? `Speed: ${tier === "fast" ? "Fast" : "Standard"}` : undefined,
  );
}

function activateStandaloneServiceTierExtension(pi: ExtensionAPI): void {
  let tier = DEFAULT_SERVICE_TIER;

  const setTier = (next: ServiceTier, context: ExtensionContext): void => {
    if (next === "fast" && !supportsFastServiceTier(context.model)) {
      context.ui.notify("Fast response speed is only available for supported Codex models.", "warning");
      return;
    }
    tier = next;
    pi.appendEntry(SERVICE_TIER_ENTRY, { tier });
    updateStandaloneStatus(context, tier);
    context.ui.notify(`Response speed: ${tier === "fast" ? "Fast" : "Standard"}`, "info");
  };

  pi.on("session_start", (_event, context) => {
    tier = persistedTier(context);
    updateStandaloneStatus(context, tier);
  });
  pi.on("model_select", (_event, context) => updateStandaloneStatus(context, tier));

  pi.registerCommand("speed", {
    description: "Choose the provider response speed for supported Codex models",
    getArgumentCompletions: (prefix) => {
      const values = ["standard", "fast"].filter((value) => value.startsWith(prefix.toLowerCase()));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, context) => {
      const requested = args.trim().toLowerCase();
      if (requested === "standard" || requested === "fast") {
        setTier(requested, context);
        return;
      }
      if (requested) {
        context.ui.notify("Use /speed standard or /speed fast.", "warning");
        return;
      }
      const choice = await context.ui.select("Response speed", ["Standard", "Fast"]);
      if (choice === "Standard") setTier("standard", context);
      if (choice === "Fast") setTier("fast", context);
    },
  });

  pi.on("before_provider_request", (event, context) => {
    if (!supportsFastServiceTier(context.model)) return;
    return applyServiceTierPayload(event.payload, tier);
  });
}

/**
 * The file copied to Pi's global extension directory is also discovered by the
 * NativePi host. The host already installs the inline version, so leave this
 * factory empty there to avoid applying the payload twice.
 */
export default function nativePiServiceTierFileExtension(pi: ExtensionAPI): void {
  if (process.env["NATIVEPI_HOST"] === "1") return;
  activateStandaloneServiceTierExtension(pi);
}
