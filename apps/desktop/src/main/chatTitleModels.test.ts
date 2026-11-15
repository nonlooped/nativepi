import { expect, test } from "bun:test";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { jsonValueSchema } from "../shared/json.ts";
import { resolveChatTitle, DEFAULT_CHAT_TITLE_SETTINGS } from "../shared/chat-title.ts";
import { chatTitleCatalog } from "./chatTitleModels.ts";

const model: Model<"openai-responses"> = {
  provider: "openai", id: "gpt-6-luna", name: "GPT-6 Luna", api: "openai-responses",
  baseUrl: "https://api.openai.com/v1", input: ["text"], reasoning: false,
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096,
};
const runtime = { getAvailableSnapshot: () => [model] } as unknown as ModelRuntime;

test("fresh-install title catalogs cross the Pi JSON boundary without a saved default model", () => {
  for (const [provider, id] of [[undefined, undefined], ["openai", undefined], [undefined, model.id]] as const) {
    const catalog = chatTitleCatalog(runtime, { getDefaultProvider: () => provider, getDefaultModel: () => id });
    expect(jsonValueSchema.safeParse(catalog).success).toBe(true);
    expect(resolveChatTitle(DEFAULT_CHAT_TITLE_SETTINGS, catalog)?.model.id).toBe(model.id);
  }
});

test("a saved default model survives the Pi JSON boundary", () => {
  const catalog = chatTitleCatalog(runtime, { getDefaultProvider: () => "openai", getDefaultModel: () => model.id });
  expect(jsonValueSchema.safeParse(catalog).success).toBe(true);
  expect(catalog.defaultModel).toBe("openai/gpt-6-luna");
});
