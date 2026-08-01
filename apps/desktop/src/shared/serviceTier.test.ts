import { expect, test } from "bun:test";
import { supportsFastServiceTier } from "./serviceTier.ts";

test("Fast is available for the advertised Codex flagship models", () => {
  expect(supportsFastServiceTier({ provider: "openai-codex", id: "gpt-5.6-sol" })).toBe(true);
  expect(supportsFastServiceTier({ provider: "openai-codex", id: "gpt-5.4" })).toBe(true);
  expect(supportsFastServiceTier({ provider: "openai-codex", id: "gpt-5.4-mini" })).toBe(false);
  expect(supportsFastServiceTier({ provider: "openai", id: "gpt-5.6-sol" })).toBe(false);
});
