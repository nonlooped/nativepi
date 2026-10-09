import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { updateChannelSchema, type UpdateChannel, type UpdateState } from "../shared/rpc-schema.ts";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let state: UpdateState = { status: "unsupported", channel: "stable" };
let publish: (state: UpdateState) => void = () => {};

function set(next: Omit<UpdateState, "channel">): void {
  state = { ...next, channel: state.channel };
  publish(state);
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const channelFile = () => join(app.getPath("userData"), "update-channel.json");

function applyChannel(): void {
  // GitHub prereleases are nightlies. Returning to stable may install an older
  // version than the running nightly, but stable installs never downgrade.
  autoUpdater.allowPrerelease = state.channel === "nightly";
  autoUpdater.allowDowngrade = state.channel === "stable" && app.getVersion().includes("-");
}

export function updateState(): UpdateState {
  return state;
}

export function startUpdates(onChange: (state: UpdateState) => void): void {
  publish = onChange;
  if (!app.isPackaged) return;
  let channel: UpdateChannel = app.getVersion().includes("-") ? "nightly" : "stable";
  try {
    const saved = updateChannelSchema.safeParse(JSON.parse(readFileSync(channelFile(), "utf8")).channel);
    if (saved.success) channel = saved.data;
  } catch {
    // A first install, or an unreadable preference, follows its installed build.
  }
  // Squirrel.Mac requires matching Developer ID signatures; these Mac builds are unsigned.
  state = { status: process.platform === "darwin" ? "manual" : "idle", channel };
  if (state.status === "manual") {
    autoUpdater.autoInstallOnAppQuit = false;
    publish(state);
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  applyChannel();

  autoUpdater.on("update-available", (info) => set({ status: "downloading", version: info.version, percent: 0 }));
  autoUpdater.on("update-not-available", () => set({ status: "idle" }));
  autoUpdater.on("download-progress", ({ percent }) =>
    set({ status: "downloading", version: state.version, percent: Math.min(100, Math.max(0, Math.round(percent))) }),
  );
  autoUpdater.on("update-downloaded", (info) => {
    autoUpdater.autoInstallOnAppQuit = true;
    set({ status: "ready", version: info.version, percent: 100 });
  });
  autoUpdater.on("error", (error) => set({ status: "error", version: state.version, error: message(error) }));

  void checkForUpdate();
  setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS).unref();
}

export async function checkForUpdate(): Promise<UpdateState> {
  if (["unsupported", "manual", "checking", "downloading", "ready"].includes(state.status)) return state;
  set({ status: "checking" });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    if (updateState().status === "checking") set({ status: "error", error: message(err) });
  }
  return updateState();
}

export async function setUpdateChannel(channel: UpdateChannel): Promise<UpdateState> {
  if (state.status === "unsupported") return state;
  if (state.channel === channel) return state;
  if (state.status === "checking" || state.status === "downloading") {
    throw new Error("Wait for the current update check or download to finish before changing channels.");
  }
  // Persist first: a failed write must leave the current channel and installer
  // untouched. A ready installer belongs to the old channel, so disarm it until
  // a download from the selected channel completes.
  writeFileSync(channelFile(), `${JSON.stringify({ channel })}\n`);
  if (state.status === "manual") {
    state = { status: "manual", channel };
    publish(state);
    return state;
  }
  autoUpdater.autoInstallOnAppQuit = false;
  state = { status: "idle", channel };
  applyChannel();
  return checkForUpdate();
}

/** The caller has shut down Pi and terminals before handing over to the installer. */
export function installUpdate(): void {
  if (state.status === "ready") autoUpdater.quitAndInstall(false, true);
}
