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

test("Fast is offered for current OpenAI models and legacy Codex subscriptions", () => {
  expect(supportsFastServiceTier({ provider: "openai-codex", id: "gpt-5.6-sol" })).toBe(true);
  expect(supportsFastServiceTier({ provider: "openai", id: "gpt-6.1-sol" })).toBe(true);
  expect(supportsFastServiceTier({ provider: "openai-codex", id: "gpt-6-sol" })).toBe(true);
  expect(supportsFastServiceTier({ provider: "openrouter", id: "openai/gpt-6.1-sol" })).toBe(false);
  expect(supportsFastServiceTier({ provider: "openai", id: "custom-model" })).toBe(false);
});

test("uses the last tier recorded in the session", () => {
  expect(persistedServiceTier([
    { type: "custom", customType: "service-tier", data: { tier: "standard" } },
    { type: "custom", customType: "service-tier", data: { tier: "fast" } },
  ])).toBe("fast");
});
