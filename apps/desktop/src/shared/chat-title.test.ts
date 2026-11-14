import { expect, test } from "bun:test";
import { DEFAULT_CHAT_TITLE_SETTINGS as defaults, chatTitleSettingsSchema, resolveChatTitle, type ChatTitleModel } from "./chat-title.ts";
const model = (provider: string, id: string, extra: Partial<ChatTitleModel> = {}): ChatTitleModel => ({
  provider, id, name: id, thinkingLevels: ["off", "low", "high"], tiers: ["default", "priority"], ...extra,
});
const luna = model("openai", "gpt-6-luna");
const codex = model("openai-codex", "gpt-6-luna");
const haiku = model("anthropic", "claude-haiku-5-5");
const hydrogen = model("google", "gemini-4-hydrogen", { tiers: [] });
const grok = model("xai", "grok-4.7", { tiers: [] });

test("prefers Luna, Haiku, Hydrogen, then Grok regardless of catalog ordering", () => {
  const models = [grok, hydrogen, haiku, codex, luna];
  for (const expected of [luna, codex, haiku, hydrogen, grok]) {
    expect(resolveChatTitle(defaults, { models })?.model).toEqual(expected);
    models.splice(models.indexOf(expected), 1);
  }
  expect(resolveChatTitle(defaults, { models })).toBeUndefined();
});
test("Luna defaults to low and priority; other models use standard", () => {
  for (const candidate of [luna, codex, haiku, hydrogen, grok]) {
    expect(resolveChatTitle(defaults, { models: [candidate] })).toMatchObject({
      reasoning: "low", serviceTier: candidate === luna || candidate === codex ? "priority" : "default",
    });
  }
});
test("uses Pi's saved available default, then the cheapest model of the first provider", () => {
  const costly = model("custom", "large", { cost: { input: 10, output: 30 } });
  const cheap = model("custom", "small", { cost: { input: 1, output: 3 } });
  const other = model("other", "free", { cost: { input: 0, output: 0 } });
  const models = [costly, cheap, other];
  expect(resolveChatTitle(defaults, { models, defaultModel: "custom/large" })?.model).toEqual(costly);
  expect(resolveChatTitle(defaults, { models, defaultModel: "disconnected/model" })?.model).toEqual(cheap);
  expect(resolveChatTitle(defaults, { models: [costly, other] })?.model).toEqual(costly);
});
test("matches dated IDs and human names but not unrelated model sizes or providers", () => {
  const dated = { ...haiku, id: "claude-haiku-5-5-20261101", name: "Haiku" };
  expect(resolveChatTitle(defaults, { models: [grok, dated] })?.model).toEqual(dated);
  const impostor = model("anthropic", "claude-haiku-5-5-large");
  expect(resolveChatTitle(defaults, { models: [impostor, grok] })?.model).toEqual(grok);
  const proxy = { ...luna, provider: "custom" };
  expect(resolveChatTitle(defaults, { models: [proxy, haiku] })?.model).toEqual(haiku);
});
test("explicit model, effort, and tier win; missing explicit models do not fall back", () => {
  const settings = { model: "anthropic/claude-haiku-5-5", reasoning: "high", serviceTier: "priority" } as const;
  expect(resolveChatTitle(settings, { models: [luna, haiku] })).toMatchObject({ model: haiku, reasoning: "high", serviceTier: "priority" });
  expect(resolveChatTitle(settings, { models: [luna] })).toBeUndefined();
});
test("unsupported effort and tier fall back to the model's lowest effort and standard", () => {
  const restricted = model("custom", "basic", { thinkingLevels: ["off"], tiers: [] });
  expect(resolveChatTitle({ model: "auto", reasoning: "high", serviceTier: "priority" }, { models: [restricted] }))
    .toMatchObject({ reasoning: "off", serviceTier: "default" });
});
test("missing or damaged title settings recover each field independently", () => {
  expect(chatTitleSettingsSchema.parse({})).toEqual(defaults);
  expect(chatTitleSettingsSchema.parse({ model: "openai/gpt-6-luna", reasoning: "invalid", serviceTier: 5 }))
    .toEqual({ ...defaults, model: "openai/gpt-6-luna" });
});
