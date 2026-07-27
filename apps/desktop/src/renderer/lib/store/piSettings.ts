import { needsRestart, type PiSettings } from "../../../shared/pi-settings.ts";
import { rpc } from "../rpc.ts";
import type { PiSettingsSlice, SliceCreator } from "./types.ts";

/**
 * Pi's own settings, as the settings screen edits them.
 *
 * These are not NativePi state: the file behind them is Pi's, shared with the Pi
 * CLI, and editable from outside this window. So nothing here is persisted with
 * the workspace and nothing is assumed between visits — the screen reloads on
 * open, and every write returns the values Pi reports afterwards rather than the
 * ones we sent.
 *
 * Writes are optimistic because a switch that waits for a file write to come
 * back feels broken; a failure puts the old value back and says why.
 */
export const createPiSettingsSlice: SliceCreator<PiSettingsSlice> = (set, get) => ({
  piSettings: null,
  piSettingsError: undefined,
  piRestartPending: false,

  loadPiSettings: async () => {
    const res = await rpc.request.getPiSettings({});
    set({ piSettings: res.settings ?? null, piSettingsError: res.error });
  },

  updatePiSetting: async (key, value) => {
    const previous = get().piSettings;
    if (!previous) return;
    set({ piSettings: { ...previous, [key]: value }, piSettingsError: undefined });

    const patch = { [key]: value } as Partial<PiSettings>;
    const res = await rpc.request.setPiSettings({ patch });
    if (!res.ok) {
      set({ piSettings: previous, piSettingsError: res.error ?? "Could not save that setting." });
      return;
    }
    set((s) => ({
      piSettings: res.settings ?? s.piSettings,
      // Sticky: the notice stays until Pi is actually restarted, because the
      // settings written before this one are still waiting on the same restart.
      piRestartPending: s.piRestartPending || needsRestart(patch),
    }));
  },

  applyPiSettingsRestart: async () => {
    await get().restartPi();
    set({ piRestartPending: false });
  },
});
