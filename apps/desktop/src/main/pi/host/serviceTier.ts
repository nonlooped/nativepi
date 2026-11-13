import { type ServiceTier, serviceTierStateSchema } from "../../../shared/service-tier.ts";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { normalizeContext, clampThinkingLevel } from "@earendil-works/pi-ai";
import { buildBaseOptions } from "@earendil-works/pi-ai/api/simple-options";

export const SERVICE_TIER_ENTRY = "nativepi-service-tier";
export function serviceTiers(model?: { provider: string; api: string } | null): readonly ServiceTier[] {
  if (model?.provider === "openai" && model.api === "openai-responses") return ["default", "priority"];
  if (model?.provider === "openai-codex" && model.api === "openai-codex-responses") return ["default", "priority"];
  if (model?.provider === "anthropic" && model.api === "anthropic-messages") return ["default", "priority"];
  return [];
}
export function recordedServiceTier(entries: readonly unknown[]): ServiceTier {
  for (const value of entries.toReversed()) {
    if (!value || typeof value !== "object" || !("type" in value) || value.type !== "custom" || !("customType" in value) || (value.customType !== SERVICE_TIER_ENTRY && value.customType !== "service-tier") || !("data" in value)) continue;
    const data = value.data;
    if (!data || typeof data !== "object" || !("tier" in data)) continue;
    if (data.tier === "fast") return "priority";
    if (data.tier === "priority") return "priority";
    if (typeof data.tier === "string" && ["standard", "auto", "default", "flex", "standard_only"].includes(data.tier)) return "default";
  }
  return "default";
}

/** Use Pi's typed API options, including its tier pricing, rather than patching OpenAI payloads. */
export function installServiceTier(session: AgentSession): () => void {
  const runtime = session.modelRuntime;
  const previous = runtime.streamSimple;
  const original = previous.bind(runtime);
  const wrapped: typeof previous = (model, context, options) => {
    const tier = recordedServiceTier(session.sessionManager.getEntries());
    if (!serviceTiers(model).includes(tier)) return original(model, context, options);
    if (model.api === "openai-responses" || model.api === "openai-codex-responses") {
      const effort = options?.reasoning ? clampThinkingLevel(model, options.reasoning) : undefined;
      return runtime.stream(model, context, {
        ...buildBaseOptions(model, normalizeContext(context), options, options?.apiKey),
        toolChoice: options?.toolChoice,
        transformHeaders: options?.transformHeaders,
        serviceTier: tier,
        reasoningEffort: effort === "off" ? undefined : effort,
      });
    }
    // Pi has no typed Anthropic tier option yet. Its documented payload hook preserves all other options.
    return original(model, context, { ...options, onPayload: async (payload, selected) => {
      const transformed = await options?.onPayload?.(payload, selected);
      const body = transformed ?? payload;
      return body && typeof body === "object" && !Array.isArray(body) ? { ...body, service_tier: tier === "priority" ? "auto" : "standard_only" } : body;
    } });
  };
  runtime.streamSimple = wrapped;
  return () => { if (runtime.streamSimple === wrapped) runtime.streamSimple = previous; };
}

export function readServiceTier(session: AgentSession) {
  const tiers = serviceTiers(session.model);
  const recorded = recordedServiceTier(session.sessionManager.getEntries());
  return serviceTierStateSchema.parse({ tier: tiers.includes(recorded) ? recorded : "default", tiers });
}
export function setServiceTier(session: AgentSession, tier: ServiceTier) {
  if (session.isStreaming || session.isCompacting) throw new Error("Wait for the current response before changing service tier.");
  if (!serviceTiers(session.model).includes(tier)) throw new Error("This service tier is not available for the selected provider.");
  session.sessionManager.appendCustomEntry(SERVICE_TIER_ENTRY, { tier });
  return readServiceTier(session);
}
