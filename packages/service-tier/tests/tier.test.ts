import { expect, test } from "bun:test";
import { applyServiceTierPayload, persistedServiceTier, supportsFastServiceTier } from "../extensions/tier.ts";

test("Fast adds Codex's priority service tier to the provider payload", () => {
  expect(applyServiceTierPayload({ model: "gpt-5.6-sol" }, "fast")).toEqual({
    model: "gpt-5.6-sol",
    service_tier: "priority",
  });
});

test("Standard removes a previously selected service tier", () => {
  expect(
    applyServiceTierPayload({ model: "gpt-5.6-sol", service_tier: "priority" }, "standard"),
  ).toEqual({ model: "gpt-5.6-sol" });
});

test("non-object payloads pass through unchanged", () => {
  expect(applyServiceTierPayload(undefined, "fast")).toBeUndefined();
});

test("Fast is only offered for supported Codex models", () => {
  expect(supportsFastServiceTier({ provider: "openai-codex", id: "gpt-5.6-sol" })).toBe(true);
  expect(supportsFastServiceTier({ provider: "openai", id: "gpt-5.6-sol" })).toBe(false);
});

test("uses the last tier recorded by the legacy built-in extension", () => {
  expect(persistedServiceTier([
    { type: "custom", customType: "service-tier", data: { tier: "standard" } },
    { type: "custom", customType: "nativepi-service-tier", data: { tier: "fast" } },
  ])).toBe("fast");
});
