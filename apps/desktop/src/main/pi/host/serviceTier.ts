import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { normalizeContext, clampThinkingLevel } from "@earendil-works/pi-ai";
import { buildBaseOptions } from "@earendil-works/pi-ai/api/simple-options";

export const SERVICE_TIER_ENTRY = "nativepi-service-tier";
export function serviceTiers(model?: { provider: string; api: string } | null): readonly string[] {
  if (model?.provider === "openai" && model.api === "openai-responses") return ["auto", "default", "priority", "flex"];
  if (model?.provider === "openai-codex" && model.api === "openai-codex-responses") return ["auto", "default", "priority"];
  if (model?.provider === "anthropic" && model.api === "anthropic-messages") return ["auto", "standard_only"];
  return [];
}
export function recordedServiceTier(entries: readonly unknown[]): string {
  for (const value of entries.toReversed()) {
    if (!value || typeof value !== "object" || !("type" in value) || value.type !== "custom" || !("customType" in value) || (value.customType !== SERVICE_TIER_ENTRY && value.customType !== "service-tier") || !("data" in value)) continue;
    const data = value.data;
    if (!data || typeof data !== "object" || !("tier" in data)) continue;
    if (data.tier === "fast") return "priority";
    if (data.tier === "standard") return "default";
    if (typeof data.tier === "string" && ["auto", "default", "priority", "flex", "standard_only"].includes(data.tier)) return data.tier;
  }
  return "auto";
}

/** Use Pi's typed API options, including its tier pricing, rather than patching OpenAI payloads. */
export function installServiceTier(session: AgentSession): () => void {
  const runtime = session.modelRuntime;
  const previous = runtime.streamSimple;
  const original = previous.bind(runtime);
  const wrapped: typeof previous = (model, context, options) => {
    const tier = recordedServiceTier(session.sessionManager.getEntries());
    if (tier === "auto" || !serviceTiers(model).includes(tier)) return original(model, context, options);
    if (model.api === "openai-responses" || model.api === "openai-codex-responses") {
      const effort = options?.reasoning ? clampThinkingLevel(model, options.reasoning) : undefined;
      return runtime.stream(model, context, {
        ...buildBaseOptions(model, normalizeContext(context), options, options?.apiKey),
        toolChoice: options?.toolChoice,
        transformHeaders: options?.transformHeaders,
        serviceTier: tier as "default" | "priority" | "flex",
        reasoningEffort: effort === "off" ? undefined : effort,
      });
    }
    // Pi has no typed Anthropic tier option yet. Its documented payload hook preserves all other options.
    return original(model, context, { ...options, onPayload: async (payload, selected) => {
      const transformed = await options?.onPayload?.(payload, selected);
      const body = transformed ?? payload;
      return body && typeof body === "object" && !Array.isArray(body) ? { ...body, service_tier: tier } : body;
    } });
  };
  runtime.streamSimple = wrapped;
  return () => { if (runtime.streamSimple === wrapped) runtime.streamSimple = previous; };
}
