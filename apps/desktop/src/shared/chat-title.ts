import { z } from "zod";
import { thinkingLevelSchema } from "./pi-values.ts";
import { serviceTierSchema, type ServiceTier } from "./service-tier.ts";

export const chatTitleSettingsSchema = z.object({
  model: z.string().min(1).max(1000).catch("auto"),
  reasoning: z.enum(["auto", ...thinkingLevelSchema.options]).catch("auto"),
  serviceTier: z.enum(["auto", ...serviceTierSchema.options]).catch("auto"),
});
export type ChatTitleSettings = z.infer<typeof chatTitleSettingsSchema>;
export const DEFAULT_CHAT_TITLE_SETTINGS = chatTitleSettingsSchema.parse({});
type Reasoning = z.infer<typeof thinkingLevelSchema>;
export interface ChatTitleModel {
  provider: string;
  id: string;
  name: string;
  thinkingLevels: Reasoning[];
  tiers: ServiceTier[];
  /** Pi's reported per-million-token rates, when known. */
  cost?: { input: number; output: number };
}
export interface ChatTitleCatalog {
  models: ChatTitleModel[];
  defaultModel?: string;
}
export const chatTitleModelKey = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`;

// Match catalog IDs or display names, including dated IDs, without matching a
// larger/different model whose name merely starts with the requested one.
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const matches = (model: ChatTitleModel, names: string[]) => names.some(name =>
  [model.id, model.name].some(value => normalized(value.replace(/[- ]\d{4}[- ]?\d{2}[- ]?\d{2}$/, "")) === normalized(name)));
const preferred = [
  { providers: ["openai", "openai-codex"], names: ["gpt-6-luna"] },
  { providers: ["anthropic"], names: ["claude-haiku-5-5", "haiku-5.5"] },
  { providers: ["google"], names: ["gemini-4-hydrogen"] },
  { providers: ["xai"], names: ["grok-4.7"] },
];

/** The input is Pi's authenticated, available chat catalog, never all known models. */
export function resolveChatTitle(settings: ChatTitleSettings, catalog: ChatTitleCatalog) {
  const models = catalog.models;
  let model: ChatTitleModel | undefined;
  if (settings.model !== "auto") {
    model = models.find(candidate => chatTitleModelKey(candidate) === settings.model);
    // An explicit choice never silently becomes a different, potentially costly model.
    if (!model) return;
  } else {
    for (const choice of preferred) {
      for (const provider of choice.providers) {
        for (const name of choice.names) {
          model = models.find(candidate => candidate.provider === provider && matches(candidate, [name]));
          if (model) break;
        }
        if (model) break;
      }
      if (model) break;
    }
    model ??= models.find(candidate => chatTitleModelKey(candidate) === catalog.defaultModel);
    if (!model) {
      const firstProvider = models[0]?.provider;
      const cost = (candidate: ChatTitleModel) => candidate.cost ? candidate.cost.input + candidate.cost.output : Infinity;
      model = models.filter(candidate => candidate.provider === firstProvider)
        .toSorted((a, b) => cost(a) - cost(b) || chatTitleModelKey(a).localeCompare(chatTitleModelKey(b)))[0];
    }
  }
  if (!model) return;
  const requestedReasoning = settings.reasoning === "auto" ? "low" : settings.reasoning;
  const reasoning = model.thinkingLevels.includes(requestedReasoning) ? requestedReasoning : model.thinkingLevels[0] ?? "off";
  const requestedTier = settings.serviceTier === "auto"
    ? ["openai", "openai-codex"].includes(model.provider) && matches(model, preferred[0]!.names) ? "priority" : "default"
    : settings.serviceTier;
  const serviceTier = model.tiers.includes(requestedTier) ? requestedTier : "default";
  return { model, reasoning, serviceTier };
}
