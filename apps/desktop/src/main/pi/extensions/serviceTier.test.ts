import { expect, test } from "bun:test";
import { applyServiceTierPayload } from "./serviceTier.ts";

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
