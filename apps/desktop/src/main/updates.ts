import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "../shared/rpc-schema.ts";

/**
 * NativePi updating itself.
 *
 * The feed is the GitHub release the release workflow already publishes:
 * electron-updater reads the `latest.yml` uploaded beside the installer, so
 * nothing here records what the current version is or where the next one lives.
 *
 * Nothing downloads on its own. An update arrives as a notification the user is
 * free to ignore, and the installer is fetched only when they ask for it — a
 * background download is not something a wrapper should spend someone's
 * connection on without being told to.
 *
 */

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let state: UpdateState = { status: "unsupported" };
let publish: (state: UpdateState) => void = () => {};

function set(next: UpdateState): void {
  state = next;
  publish(state);
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function updateState(): UpdateState {
  return state;
}

export function startUpdates(onChange: (state: UpdateState) => void): void {
  publish = onChange;
  // A dev run has no packaged app to replace, and electron-updater throws over
  // the missing `app-update.yml` rather than reporting that there is nothing to
  // do. The renderer reads `unsupported` and leaves the whole surface out.
  if (!app.isPackaged) return;
  state = { status: "idle" };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => set({ status: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => set({ status: "idle" }));
  autoUpdater.on("download-progress", ({ percent }) =>
    set({ status: "downloading", version: state.version, percent: Math.round(percent) }),
  );
  autoUpdater.on("update-downloaded", (info) => set({ status: "ready", version: info.version }));
  autoUpdater.on("error", (error) => set({ status: "error", version: state.version, error: message(error) }));

  void checkForUpdate();
  // A window left open for days would otherwise hear about a release only on
  // its next launch. Unreffed so a pending check cannot hold the process open.
  setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS).unref();
}

export async function checkForUpdate(): Promise<UpdateState> {
  if (state.status === "unsupported" || state.status === "checking") return state;
  // Checking again once an installer is on its way down would discard it and
  // start over, which is what the periodic check would do to a live download.
  if (state.status === "downloading" || state.status === "ready") return state;

  set({ status: "checking" });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    // The `error` event has normally reported this already; it has not when the
    // failure is in making the request rather than in the check itself.
    if (updateState().status === "checking") set({ status: "error", error: message(err) });
  }
  return updateState();
}

export async function downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
  if (state.status !== "available") return { ok: false, error: "There is no update waiting to be downloaded." };

  set({ status: "downloading", version: state.version, percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    if (updateState().status === "downloading") {
      set({ status: "error", version: state.version, error: message(err) });
    }
    return { ok: false, error: message(err) };
  }
}

/**
 * Hand the downloaded installer the app.
 *
 * Silent, and relaunching afterwards: the user chose to update from inside
 * NativePi, so an NSIS wizard asking the same question again is a sequence of
 * screens with no decision in any of them. The caller has already confirmed an
 * update is ready and shut down Pi and the terminals — the installer replaces
 * files this process otherwise still holds open.
 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall(true, true);
}
