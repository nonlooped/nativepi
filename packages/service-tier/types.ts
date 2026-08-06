import type { JsonValue } from "@nativepi/extension-api";

export type ServiceTier = "standard" | "fast";

/** What the renderer half receives from the `state` and `set` methods. */
export type TierState = {
  supported: boolean;
  tier: ServiceTier;
};

export function isTierState(value: JsonValue | undefined): value is TierState {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value["supported"] === "boolean" &&
    (value["tier"] === "standard" || value["tier"] === "fast")
  );
}
