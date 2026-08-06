import type { JsonValue } from "@nativepi/extension-api";

export type SubscriptionUsageLimit = {
  label: string;
  usedPercent: number;
  resetAt?: string;
  windowSeconds?: number;
};

export type SubscriptionUsage = {
  provider: string;
  limits: SubscriptionUsageLimit[];
};

/** What the renderer half receives from the `usage` method. */
export type UsageReading = {
  supported: boolean;
  usage?: SubscriptionUsage;
};

function isUsageLimit(value: JsonValue): value is SubscriptionUsageLimit {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value["label"] === "string" &&
    typeof value["usedPercent"] === "number" &&
    (value["resetAt"] === undefined || typeof value["resetAt"] === "string") &&
    (value["windowSeconds"] === undefined || typeof value["windowSeconds"] === "number")
  );
}

export function isUsageReading(value: JsonValue): value is UsageReading {
  if (typeof value !== "object" || value === null || Array.isArray(value) || typeof value["supported"] !== "boolean") {
    return false;
  }
  const usage = value["usage"];
  return (
    usage === undefined ||
    (typeof usage === "object" &&
      usage !== null &&
      !Array.isArray(usage) &&
      typeof usage["provider"] === "string" &&
      Array.isArray(usage["limits"]) &&
      usage["limits"].every(isUsageLimit))
  );
}
