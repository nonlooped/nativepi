import type { ThinkingLevel } from "../../../shared/pi-types.ts";
import { modelKey } from "../../../shared/messages.ts";
import { rpc } from "../rpc.ts";
import { showHint } from "../toast.tsx";
import { patchConversation } from "./conversation.ts";
import {
  runtime, runtimeEpoch, selectionGuard, persist,
  modelProjectionGuard, readModelState, loadThinkingLevels, startThinkingLevels, ModelStateReadError,
} from "./internals.ts";
import type { ModelSlice, SliceCreator } from "./types.ts";

export function thinkingLabel(level: ThinkingLevel): string {
  if (level === "off") return "Off";
  if (level === "minimal") return "Minimal";
  if (level === "low") return "Low";
  if (level === "medium") return "Medium";
  if (level === "high") return "High";
  if (level === "xhigh") return "Extra High";
  return "Max";
}

export const createModelSlice: SliceCreator<ModelSlice> = (set, get) => {
  const modelWrites = new Map<string, { epoch: string }>();
  let levelWrite = 0;
  return {
    models: [],
    favoriteModels: [],
    thinkingLevel: "off",
    thinkingLevelReady: false,
    thinkingLevelVersion: 0,
    thinkingLevels: ["off"],
    thinkingLevelsLoading: false,
    thinkingLevelsError: undefined,

    setModel: async (model) => {
      const projectDir = get().activeProjectPath;
      if (!projectDir) return;
      const sessionFile = get().activeSessionFile;
      if (!sessionFile && runtime(get).blockedDrafts.has(projectDir)) return;
      const epoch = runtimeEpoch(get, projectDir);
      const target = JSON.stringify([projectDir, sessionFile]);
      // Pi acknowledges without a snapshot; exclude overlapping writes only in this runtime.
      if (modelWrites.get(target)?.epoch === epoch) return;
      const operation = { epoch };
      modelWrites.set(target, operation);
      const owned = () => modelWrites.get(target) === operation && runtimeEpoch(get, projectDir) === epoch;
      const current = modelProjectionGuard(get);
      const previous = { model: get().model, thinkingLevels: get().thinkingLevels,
        thinkingLevelsLoading: get().thinkingLevelsLoading, thinkingLevelsError: get().thinkingLevelsError };
      let accepted = false;
      startThinkingLevels(set, get, projectDir, sessionFile);
      try {
        const result = await rpc.request.setModel({ projectDir, sessionFile, provider: model.provider, modelId: model.id });
        if (!result.ok) throw new Error(result.error ?? "Pi could not select this model.");
        accepted = true;
        if (!owned()) return;
        if (current() && get().model === previous.model) {
          runtime(get).modelStateRecovery = undefined;
          set({ model });
          await loadThinkingLevels(set, get, projectDir, sessionFile, () => owned() && current());
        } else if (get().activeProjectPath === projectDir && get().activeSessionFile === sessionFile) {
          // Re-entry may have read Pi before this asynchronous mutation applied.
          // Reconcile current Pi state; the captured choice may already be superseded.
          await readModelState(set, get, projectDir);
        }
      } catch (error) {
        if (!(error instanceof ModelStateReadError) && owned() && get().activeProjectPath === projectDir && get().activeSessionFile === sessionFile) {
          if (!accepted && current() && get().model === previous.model) {
            set(previous);
            if (previous.thinkingLevelsLoading) {
              // The write retired the previous reader; rollback cannot revive its loading flag.
              runtime(get).modelStateRecovery = selectionGuard(get);
              set({ thinkingLevelsLoading: false, thinkingLevelsError: error instanceof Error ? error.message : String(error) });
            }
          }
          patchConversation(set, projectDir, sessionFile, { error: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        if (modelWrites.get(target) === operation) modelWrites.delete(target);
      }
    },

    refreshThinkingLevels: async () => {
      const projectDir = get().activeProjectPath;
      if (!projectDir) return;
      if (runtime(get).modelStateRecovery?.() || !get().model) {
        startThinkingLevels(set, get, projectDir, get().activeSessionFile);
        try { await readModelState(set, get, projectDir); } catch (error) {
          if (!(error instanceof ModelStateReadError)) throw error;
        }
      } else {
        await loadThinkingLevels(set, get, projectDir, get().activeSessionFile, selectionGuard(get));
      }
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
      if (!sessionFile && runtime(get).blockedDrafts.has(projectDir)) return;
      const selected = selectionGuard(get);
      const operation = ++levelWrite;
      const previous = { thinkingLevel: get().thinkingLevel, thinkingLevelReady: get().thinkingLevelReady };
      set((state) => ({ thinkingLevelVersion: state.thinkingLevelVersion + 1 }));
      const version = get().thinkingLevelVersion;
      try {
        const result = await rpc.request.setThinkingLevel({ projectDir, sessionFile, level });
        if (!result.ok) throw new Error(result.error ?? "Pi could not set the thinking level.");
        if (selected() && operation === levelWrite && get().thinkingLevelVersion === version) set({ thinkingLevel: level, thinkingLevelReady: true });
      } catch (error) {
        if (selected() && operation === levelWrite && get().thinkingLevelVersion === version) {
          set(previous);
          patchConversation(set, projectDir, sessionFile, { error: error instanceof Error ? error.message : String(error) });
        }
      }
    },

    cycleThinkingLevel: async () => {
      const levels = get().thinkingLevels;
      if (levels.length === 0) return;
      const current = levels.indexOf(get().thinkingLevel);
      const next = levels[(current + 1) % levels.length]!;
      showHint(thinkingLabel(next));
      await get().setThinkingLevel(next);
    },
  };
};
