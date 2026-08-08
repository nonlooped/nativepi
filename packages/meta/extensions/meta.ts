import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Cost per million tokens for Muse Spark on Meta Model API.
 * Source: https://api.meta.ai/v1 catalog (see screenshot) / Meta Model API pricing.
 * Standard: Input $1.25, output $4.25, cache read $0.15.
 * Contributor (muse-spark-1.2-contributor): Input $0.10, output $0.20.
 */
const COST = {
  input: 1.25,
  output: 4.25,
  cacheRead: 0.15,
  cacheWrite: 0,
} as const;

const COST_CONTRIBUTOR = {
  input: 0.1,
  output: 0.2,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

const CONTEXT_WINDOW = 1_048_576;
const MAX_TOKENS = 131_072;
const CONTEXT_WINDOW_1_1 = 1_000_000;
const MAX_TOKENS_1_1 = 32_000;

/**
 * Muse Spark always reasons — `reasoning_effort: "none"` is 400.
 * Map Pi thinking levels to Meta's `reasoning_effort` values.
 * `off` maps to a valid effort so Pi still requests reasoning and
 * `reasoning.encrypted_content` for continuity across tool loops
 * (otherwise the default/off path would omit the include). `max`
 * aliases to `xhigh`, the highest Meta level.
 */
const THINKING_LEVEL_MAP = {
  off: "high",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "xhigh",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ensureMetaPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  const next: Record<string, unknown> = { ...payload };
  const reasoningRaw = isRecord(next["reasoning"]) ? { ...next["reasoning"] } : {};
  const effort = reasoningRaw["effort"];
  if (typeof effort !== "string" || effort === "none") reasoningRaw["effort"] = "high";
  if (typeof reasoningRaw["summary"] !== "string") reasoningRaw["summary"] = "auto";
  next["reasoning"] = reasoningRaw;
  const include = Array.isArray(next["include"]) ? [...(next["include"] as unknown[])] : [];
  if (!include.includes("reasoning.encrypted_content")) include.push("reasoning.encrypted_content");
  next["include"] = include;
  return next;
}

export default function metaExtension(pi: ExtensionAPI): void {
  pi.registerProvider("meta", {
    name: "Meta",
    baseUrl: "https://api.meta.ai/v1",
    apiKey: "$MODEL_API_KEY",
    api: "openai-responses",
    models: [
      {
        id: "muse-spark-1.1",
        name: "Muse Spark 1.1",
        api: "openai-responses",
        baseUrl: "https://api.meta.ai/v1",
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ["text", "image"],
        cost: COST,
        contextWindow: CONTEXT_WINDOW_1_1,
        maxTokens: MAX_TOKENS_1_1,
        compat: {
          supportsStrictMode: true,
        },
      },
      {
        id: "muse-spark-1.2",
        name: "Muse Spark 1.2",
        api: "openai-responses",
        baseUrl: "https://api.meta.ai/v1",
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ["text", "image"],
        cost: COST,
        contextWindow: CONTEXT_WINDOW,
        maxTokens: MAX_TOKENS,
        compat: {
          supportsStrictMode: true,
        },
      },
      {
        id: "muse-spark-1.2-contributor",
        name: "Muse Spark 1.2 Contributor",
        api: "openai-responses",
        baseUrl: "https://api.meta.ai/v1",
        reasoning: true,
        thinkingLevelMap: THINKING_LEVEL_MAP,
        input: ["text", "image"],
        cost: COST_CONTRIBUTOR,
        contextWindow: CONTEXT_WINDOW,
        maxTokens: MAX_TOKENS,
        compat: {
          supportsStrictMode: true,
        },
      },
    ],
  });

  pi.on("before_provider_request", (event, context) => {
    if (context.model?.provider !== "meta") return;
    return ensureMetaPayload(event.payload);
  });
}
