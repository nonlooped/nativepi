import { expect, test } from "bun:test";
import metaExtension, { ensureMetaPayload } from "../extensions/meta.ts";

test("registers Meta provider with Muse Spark models", () => {
  let registered: { name: string; config: unknown } | undefined;
  const seen: Array<{ event: string; handler: (event: unknown, context: unknown) => unknown }> = [];
  const pi = {
    registerProvider: (name: string, config: unknown) => {
      registered = { name, config };
    },
    on: (event: string, handler: (event: unknown, context: unknown) => unknown) => {
      seen.push({ event, handler });
    },
  } as unknown as Parameters<typeof metaExtension>[0];

  metaExtension(pi);

  expect(registered?.name).toBe("meta");
  const config = registered?.config as {
    name: string;
    baseUrl: string;
    apiKey: string;
    api: string;
    models: Array<{
      id: string;
      name: string;
      reasoning: boolean;
      thinkingLevelMap: Record<string, string | null>;
      cost: { input: number; output: number };
      contextWindow: number;
      maxTokens: number;
      api: string;
      input: string[];
      compat?: Record<string, unknown>;
    }>;
  };

  expect(config.name).toBe("Meta");
  expect(config.baseUrl).toBe("https://api.meta.ai/v1");
  expect(config.apiKey).toBe("$MODEL_API_KEY");
  expect(config.api).toBe("openai-responses");

  const ids = config.models.map((m) => m.id);
  expect(ids).toContain("muse-spark-1.1");
  expect(ids).toContain("muse-spark-1.2");
  expect(ids).toContain("muse-spark-1.2-contributor");

  const byId = Object.fromEntries(config.models.map((m) => [m.id, m]));

  for (const model of config.models) {
    expect(model.reasoning).toBe(true);
    expect(model.api).toBe("openai-responses");
    expect(model.input).toEqual(["text", "image"]);
    expect(model.thinkingLevelMap.off).toBe("high");
    expect(model.thinkingLevelMap.high).toBe("high");
    expect(model.thinkingLevelMap.max).toBe("xhigh");
    expect((model.compat as { supportsOpenAIGrammarTools?: boolean })?.supportsOpenAIGrammarTools).toBeUndefined();
  }

  expect(byId["muse-spark-1.1"].contextWindow).toBe(1_000_000);
  expect(byId["muse-spark-1.1"].maxTokens).toBe(32_000);
  expect(byId["muse-spark-1.1"].cost.input).toBe(1.25);
  expect(byId["muse-spark-1.1"].cost.output).toBe(4.25);

  expect(byId["muse-spark-1.2"].contextWindow).toBe(1_048_576);
  expect(byId["muse-spark-1.2"].maxTokens).toBe(131_072);
  expect(byId["muse-spark-1.2"].cost.input).toBe(1.25);
  expect(byId["muse-spark-1.2"].cost.output).toBe(4.25);

  expect(byId["muse-spark-1.2-contributor"].contextWindow).toBe(1_048_576);
  expect(byId["muse-spark-1.2-contributor"].maxTokens).toBe(131_072);
  expect(byId["muse-spark-1.2-contributor"].cost.input).toBe(0.1);
  expect(byId["muse-spark-1.2-contributor"].cost.output).toBe(0.2);

  expect(seen.some((entry) => entry.event === "before_provider_request")).toBe(true);
});

test("ensureMetaPayload injects reasoning and encrypted_content", () => {
  expect(ensureMetaPayload({ model: "muse-spark-1.1" })).toEqual({
    model: "muse-spark-1.1",
    reasoning: { effort: "high", summary: "auto" },
    include: ["reasoning.encrypted_content"],
  });

  expect(
    ensureMetaPayload({
      reasoning: { effort: "none" },
      include: ["other"],
    }),
  ).toEqual({
    reasoning: { effort: "high", summary: "auto" },
    include: ["other", "reasoning.encrypted_content"],
  });

  expect(ensureMetaPayload(null)).toBeNull();
});
