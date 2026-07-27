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

/**
 * Which write is the current one.
 *
 * Every response carries the whole settings object, so applying an older one on
 * top of a newer one puts the user's own most recent choice back to what it was
 * before they made it. The main process writes in order; this makes the renderer
 * accept them in order too, whatever order the IPC replies happen to arrive in.
 */
let latestWrite = 0;

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
    const seq = ++latestWrite;
    const res = await rpc.request.setPiSettings({ patch });
    // A newer write is already in flight, and its reply reports the file after
    // this one landed. Letting this older reply through would undo it.
    if (seq !== latestWrite) return;

    if (!res.ok) {
      // Only this control goes back. Restoring the whole snapshot would revert
      // any other setting changed while this write was in flight.
      set((s) => ({
        piSettings: s.piSettings ? { ...s.piSettings, [key]: previous[key] } : previous,
        piSettingsError: res.error ?? "Could not save that setting.",
      }));
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
    // Every project, not only the active one: the notice is global because the
    // stale configuration is, and clearing it has to be true of all of them.
    await rpc.request.restartAllPi({});
    set({ piRestartPending: false });
    // Brings the active project back up and clears any error the stop produced.
    await get().restartPi();
  },
});
