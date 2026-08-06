import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import type { ServiceTier, TierState } from "../types.ts";

const DEFAULT_TIER: ServiceTier = "standard";

/**
 * Pi does not expose provider service-tier metadata in its model shape, so the
 * models known to offer the faster tier are listed here. Keep it conservative:
 * sending the field to a model without the tier is a rejected request.
 */
const FAST_MODEL_IDS = new Set(["gpt-5.4", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"]);

const TIER_ENTRY = "service-tier";
const LEGACY_TIER_ENTRY = "nativepi-service-tier";
const TIER_STATUS = "service-tier";

export function supportsFastServiceTier(model?: { provider?: string; id?: string } | null): boolean {
  return model?.provider === "openai-codex" && FAST_MODEL_IDS.has(model.id ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTier(value: unknown): ServiceTier | undefined {
  return value === "standard" || value === "fast" ? value : undefined;
}

/**
 * OpenAI's Codex API calls the Fast tier `priority`. Pi's provider hook gives us
 * the assembled request body, so this changes only the transport payload and not
 * the prompt, model selection, tool loop, or session entries.
 */
export function applyServiceTierPayload(payload: unknown, tier: ServiceTier): unknown {
  if (!isRecord(payload)) return payload;
  const next = { ...payload };
  if (tier === "fast") next["service_tier"] = "priority";
  else delete next["service_tier"];
  return next;
}

/** The tier this session last recorded, which is what makes the choice outlive a restart. */
export function persistedServiceTier(entries: readonly unknown[]) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (!isRecord(entry) || entry["type"] !== "custom") continue;
    if (entry["customType"] !== TIER_ENTRY && entry["customType"] !== LEGACY_TIER_ENTRY) continue;
    const tier = asTier(isRecord(entry["data"]) ? entry["data"]["tier"] : undefined);
    if (tier) return tier;
  }
  return undefined;
}

function persistedTier(context: ExtensionContext): ServiceTier | undefined {
  return persistedServiceTier(context.sessionManager.getEntries());
}

export default function serviceTierExtension(pi: ExtensionAPI): void {
  const ui = connect("@nativepi/service-tier");

  let tier = DEFAULT_TIER;
  let latest: ExtensionContext | undefined;

  const state = (context: ExtensionContext | undefined): TierState => ({
    supported: supportsFastServiceTier(context?.model),
    tier,
  });

  const showStatus = (context: ExtensionContext): void => {
    context.ui.setStatus(
      TIER_STATUS,
      supportsFastServiceTier(context.model) ? `Speed: ${tier === "fast" ? "Fast" : "Standard"}` : undefined,
    );
  };

  const setTier = (next: ServiceTier, context: ExtensionContext): void => {
    tier = next;
    pi.appendEntry(TIER_ENTRY, { tier });
    if (!ui.connected) showStatus(context);
    ui.emit("changed", state(context));
  };

  pi.on("session_start", (_event, context) => {
    latest = context;
    // A tier chosen before the first message has nothing to be recorded against
    // yet, so an unrecorded session keeps the pending choice rather than
    // resetting to the default the moment the session appears.
    const recorded = persistedTier(context);
    if (recorded) tier = recorded;
    else if (tier !== DEFAULT_TIER) pi.appendEntry(TIER_ENTRY, { tier });
    if (!ui.connected) showStatus(context);
    ui.emit("changed", state(context));
  });

  pi.on("model_select", (_event, context) => {
    latest = context;
    if (!ui.connected) showStatus(context);
    ui.emit("changed", state(context));
  });

  pi.on("before_provider_request", (event, context) => {
    latest = context;
    if (!supportsFastServiceTier(context.model)) return;
    return applyServiceTierPayload(event.payload, tier);
  });

  ui.method("state", () => state(latest));

  ui.method("set", (params) => {
    const next = asTier(isRecord(params) ? params["tier"] : undefined);
    if (!next) throw new Error("Choose either the standard or the fast tier.");
    if (!latest) throw new Error("No active Pi session.");
    if (next === "fast" && !supportsFastServiceTier(latest.model)) {
      throw new Error("Fast response speed is only available for supported Codex models.");
    }
    setTier(next, latest);
    return state(latest);
  });

  pi.registerCommand("speed", {
    description: "Choose the provider response speed for supported Codex models",
    getArgumentCompletions: (prefix) => {
      const values = ["standard", "fast"].filter((value) => value.startsWith(prefix.toLowerCase()));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, context) => {
      latest = context;
      const choose = (next: ServiceTier): void => {
        if (next === "fast" && !supportsFastServiceTier(context.model)) {
          context.ui.notify("Fast response speed is only available for supported Codex models.", "warning");
          return;
        }
        setTier(next, context);
        context.ui.notify(`Response speed: ${next === "fast" ? "Fast" : "Standard"}`, "info");
      };

      const requested = asTier(args.trim().toLowerCase());
      if (requested) {
        choose(requested);
        return;
      }
      if (args.trim()) {
        context.ui.notify("Use /speed standard or /speed fast.", "warning");
        return;
      }
      const choice = await context.ui.select("Response speed", ["Standard", "Fast"]);
      if (choice === "Standard") choose("standard");
      if (choice === "Fast") choose("fast");
    },
  });
}
