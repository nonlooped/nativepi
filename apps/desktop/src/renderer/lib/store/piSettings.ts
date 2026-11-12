import { needsRestart, type PiSettings } from "../../../shared/pi-settings.ts";
import { rpc } from "../rpc.ts";
import type { PiSettingsSlice, SliceCreator } from "./types.ts";

type Key = keyof PiSettings;

// Pi owns the file, and each successful write returns its normalized snapshot.
// Host writes are serialized; replies may arrive out of order over the bridge.
export const createPiSettingsSlice: SliceCreator<PiSettingsSlice> = (set, get) => {
  let confirmed: PiSettings | null = null;
  let writeVersion = 0;
  let loadVersion = 0;
  let restartVersion = 0;
  let restarting: Promise<void> | undefined;
  const confirmedVersions = new Map<Key, number>();
  const latestEdits = new Map<Key, number>();
  const pending = new Map<number, Partial<PiSettings>>();
  const failures = new Map<Key, { version: number; message: string }>();

  const errorMessage = () => [...failures.values()].sort((a, b) => b.version - a.version)[0]?.message;
  const projectSettings = () => {
    if (!confirmed) return null;
    const settings = { ...confirmed };
    for (const [version, patch] of pending) {
      for (const key of Object.keys(patch) as Key[]) {
        if (version > (confirmedVersions.get(key) ?? 0)) Object.assign(settings, { [key]: patch[key] });
      }
    }
    return settings;
  };

  return {
    piSettings: null,
    piSettingsError: undefined,
    piRestartPending: false,

    loadPiSettings: async () => {
      const version = ++loadVersion;
      const edits = writeVersion;
      const duringEdit = pending.size > 0;
      const current = () => version === loadVersion && edits === writeVersion && !duringEdit && pending.size === 0;
      try {
        const res = await rpc.request.getPiSettings({});
        if (!current()) return;
        confirmed = res.settings ?? null;
        confirmedVersions.clear();
        failures.clear();
        set({ piSettings: confirmed, piSettingsError: res.error });
      } catch (error) {
        if (current()) set({ piSettingsError: message(error) });
      }
    },

    updatePiSetting: async (key, value) => {
      if (!get().piSettings) return;
      if (pending.size === 0) confirmed = get().piSettings;
      const version = ++writeVersion;
      const patch = { [key]: value } as Partial<PiSettings>;
      pending.set(version, patch);
      latestEdits.set(key, version);
      failures.delete(key);
      set({ piSettings: projectSettings(), piSettingsError: errorMessage() });

      try {
        const res = await rpc.request.setPiSettings({ patch });
        if (!res.ok) throw new Error(res.error ?? "Could not save that setting.");
        const snapshot = res.settings ?? patch;
        for (const field of Object.keys(snapshot) as Key[]) {
          if (version >= (confirmedVersions.get(field) ?? 0)) {
            confirmed = { ...confirmed!, [field]: snapshot[field] };
            confirmedVersions.set(field, version);
          }
        }
        // A stale snapshot still acknowledges a saved restart-required edit.
        if (needsRestart(patch)) {
          restartVersion++;
          set({ piRestartPending: true });
        }
      } catch (error) {
        if (latestEdits.get(key) === version) failures.set(key, { version, message: message(error) });
      } finally {
        pending.delete(version);
        set({ piSettings: projectSettings(), piSettingsError: errorMessage() });
      }
    },

    applyPiSettingsRestart: () => {
      if (restarting) return restarting;
      const version = restartVersion;
      restarting = (async () => {
        try {
          await get().restartAllPi();
          if (version === restartVersion) set({ piRestartPending: false, piSettingsError: errorMessage() });
        } catch (error) {
          set({ piSettingsError: message(error) });
        }
      })().finally(() => { restarting = undefined; });
      return restarting;
    },
  };
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
