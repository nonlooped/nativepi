import type { ThinkingLevel } from "../../../shared/pi-types.ts";
import { modelKey } from "../../../shared/messages.ts";
import { TITLE_GENERATOR_ACTIVE } from "../../../shared/title-generator.ts";
import { DEFAULT_SERVICE_TIER, serviceTierKey, type ServiceTier } from "../../../shared/serviceTier.ts";
import { rpc } from "../rpc.ts";
import { showHint } from "../toast.tsx";
import { persist, reportServiceTier } from "./internals.ts";
import type { ModelSlice, SliceCreator } from "./types.ts";

export function thinkingLabel(level: ThinkingLevel): string {
  if (level === "off") return "Off";
  if (level === "xhigh") return "Extra High";
  return level[0]!.toUpperCase() + level.slice(1);
}

export const createModelSlice: SliceCreator<ModelSlice> = (set, get) => ({
  models: [],
  favoriteModels: [],
  titleGeneratorModel: TITLE_GENERATOR_ACTIVE,
  serviceTier: DEFAULT_SERVICE_TIER,
  serviceTiers: {},
  thinkingLevel: "off",
  thinkingLevels: ["off"],

  setModel: async (model) => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return;
    const sessionFile = get().activeSessionFile;
    // Levels are emptied first: the ones on screen belong to the old model, and
    // showing them against the new name would offer a level it may not support.
    set({ model, thinkingLevels: [] });
    await rpc.request.setModel({ projectDir, sessionFile, provider: model.provider, modelId: model.id });
    const result = await rpc.request.getThinkingLevels({ projectDir, sessionFile });
    if (
      get().activeProjectPath === projectDir &&
      get().model?.provider === model.provider &&
      get().model?.id === model.id
    ) {
      set({ thinkingLevels: result.levels });
    }
  },
  setTitleGeneratorModel: (titleGeneratorModel) => {
    set({ titleGeneratorModel });
    persist(get);
  },

  setServiceTier: async (tier: ServiceTier) => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return;
    const sessionFile = get().activeSessionFile;
    const key = serviceTierKey(projectDir, sessionFile);
    set((state) => ({
      serviceTier: tier,
      serviceTiers: { ...state.serviceTiers, [key]: tier },
    }));
    persist(get);
    reportServiceTier(projectDir, sessionFile, tier);
  },

  toggleFavoriteModel: (model) => {
    const key = modelKey(model);
    set((s) => {
      const favorites = s.favoriteModels ?? [];
      return {
        favoriteModels: favorites.includes(key)
          ? favorites.filter((favorite) => favorite !== key)
          : [...favorites, key],
      };
    });
    persist(get);
  },

  setThinkingLevel: async (level) => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return;
    const sessionFile = get().activeSessionFile;
    set({ thinkingLevel: level });
    await rpc.request.setThinkingLevel({ projectDir, sessionFile, level });
  },

  cycleThinkingLevel: async () => {
    const levels = get().thinkingLevels;
    if (levels.length === 0) return;
    const current = levels.indexOf(get().thinkingLevel);
    const next = levels[(current + 1) % levels.length]!;
    showHint(`Reasoning: ${thinkingLabel(next)}`);
    await get().setThinkingLevel(next);
  },
});
