import { expect, test } from "bun:test";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { serviceTiers, recordedServiceTier, installServiceTier, SERVICE_TIER_ENTRY } from "./serviceTier.ts";
const entry = (tier: string) => ({ type: "custom", customType: SERVICE_TIER_ENTRY, data: { tier } });
test("limits tiers by provider and transport, without a stale model list", () => {
  expect(serviceTiers({ provider: "openai", api: "openai-responses" })).toEqual(["default", "priority"]);
  expect(serviceTiers({ provider: "openai-codex", api: "openai-codex-responses" })).toEqual(["default", "priority"]);
  expect(serviceTiers({ provider: "meta", api: "openai-responses" })).toEqual([]);
  expect(serviceTiers({ provider: "anthropic", api: "anthropic-messages" })).toEqual(["default", "priority"]);
});
test("restores prior package choices and ignores malformed entries", () => {
  expect(recordedServiceTier([{ ...entry("fast"), customType: "service-tier" }])).toBe("priority");
  expect(recordedServiceTier([{ ...entry("standard"), customType: "service-tier" }, entry("priority")])).toBe("priority");
  expect(recordedServiceTier([entry("standard")])).toBe("default");
  expect(recordedServiceTier([])).toBe("default");
  for (const old of ["auto", "flex", "standard_only"]) {
    expect(recordedServiceTier([entry("priority"), entry(old)])).toBe("default");
  }
  expect(recordedServiceTier([entry("priority"), entry("bad"), null])).toBe("priority");
});
test("passes tier through Pi options and leaves unsupported models untouched", () => {
  const streamed: unknown[][] = [], original: unknown[][] = [];
  const session = {
    sessionManager: { getEntries: () => [entry("priority")] },
    modelRuntime: { streamSimple: (...args: unknown[]) => { original.push(args); return {}; }, stream: (...args: unknown[]) => { streamed.push(args); return {}; } },
  };
  installServiceTier(session as unknown as AgentSession);
  const model = { provider: "openai", api: "openai-responses", id: "future-model", reasoning: true, maxTokens: 4096, contextWindow: 100000, thinkingLevels: ["low", "high"] };
  session.modelRuntime.streamSimple(model, { messages: [] }, { reasoning: "high", maxTokens: 1024 });
  expect(streamed[0]?.[2]).toMatchObject({ serviceTier: "priority", reasoningEffort: "high", maxTokens: 1024 });
  session.modelRuntime.streamSimple({ ...model, provider: "meta" }, { messages: [] }, {});
  expect(original).toHaveLength(1);
});
test("Anthropic tier changes retain payload hooks and dispose restores the runtime", async () => {
  let captured: { onPayload: (payload: unknown, model: unknown) => Promise<unknown> } | undefined;
  const previous = (_model: unknown, _context: unknown, options: unknown) => { captured = options as typeof captured; return {}; };
  const session = {
    sessionManager: { getEntries: () => [entry("standard_only")] },
    modelRuntime: { streamSimple: previous },
  };
  const dispose = installServiceTier(session as unknown as AgentSession);
  session.modelRuntime.streamSimple({ provider: "anthropic", api: "anthropic-messages" }, { messages: [] }, { onPayload: async () => ({ preserved: true }) });
  expect(await captured!.onPayload({}, {})).toEqual({ preserved: true, service_tier: "standard_only" });
  dispose(); expect(session.modelRuntime.streamSimple).toBe(previous);
});
test("composer updates persist in Pi and reject busy or unsupported requests", async () => {
  const { readServiceTier, setServiceTier } = await import("./serviceTier.ts");
  const entries: unknown[] = [];
  const session = {
    model: { provider: "openai", api: "openai-responses" }, isStreaming: false, isCompacting: false,
    sessionManager: { getEntries: () => entries, appendCustomEntry: (type: string, data: unknown) => { entries.push({ type: "custom", customType: type, data }); } },
  };
  const pi = session as unknown as AgentSession;
  expect(setServiceTier(pi, "priority").tier).toBe("priority");
  expect(readServiceTier(pi).tier).toBe("priority");
  session.isStreaming = true;
  expect(() => setServiceTier(pi, "default")).toThrow("current response");
  session.isStreaming = false;
  session.model.provider = "meta";
  expect(readServiceTier(pi)).toEqual({ tier: "default", tiers: [] });
  expect(() => setServiceTier(pi, "priority")).toThrow("not available");
  expect(entries).toHaveLength(1);
});
