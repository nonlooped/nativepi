import { afterAll, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UpdateState } from "../shared/rpc-schema.ts";

const dataDir = mkdtempSync(join(tmpdir(), "nativepi-updates-"));
let version = "1.15.0-nightly.202610091200";
const updater = Object.assign(new EventEmitter(), {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: false,
  allowDowngrade: false,
  checkForUpdates: mock(async () => {
    updater.emit("update-not-available");
    return null;
  }),
  quitAndInstall: mock((_silent: boolean, _restart: boolean) => {}),
});

mock.module("electron", () => ({
  app: { isPackaged: true, getVersion: () => version, getPath: () => dataDir },
}));
mock.module("electron-updater", () => ({ autoUpdater: updater }));
const { checkForUpdate, installUpdate, setUpdateChannel, startUpdates, updateState } = await import("./updates.ts");

const changes: UpdateState[] = [];
startUpdates((state) => changes.push(state));

afterAll(() => {
  // Only the isolated directory created by this test; never Electron user data.
  if (!dataDir.startsWith(join(tmpdir(), "nativepi-updates-"))) throw new Error("Invalid test directory");
  rmSync(dataDir, { recursive: true, force: true });
});

test("a nightly install follows nightlies and downloads without disturbing the current run", async () => {
  await checkForUpdate();
  expect(updateState()).toEqual({ status: "idle", channel: "nightly" });
  expect(updater.autoDownload).toBeTrue();
  expect(updater.autoInstallOnAppQuit).toBeTrue();
  expect(updater.allowPrerelease).toBeTrue();
  expect(updater.allowDowngrade).toBeFalse();
  updater.emit("update-available", { version: "1.15.0-nightly.202610091300" });
  updater.emit("download-progress", { percent: 31.6 });
  expect(updateState()).toEqual({ status: "downloading", channel: "nightly", version: "1.15.0-nightly.202610091300", percent: 32 });
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
});

test("switching mid-download is rejected without changing the persisted channel", async () => {
  const checks = updater.checkForUpdates.mock.calls.length;
  await expect(setUpdateChannel("stable")).rejects.toThrow("Wait for the current update");
  expect(updateState().channel).toBe("nightly");
  expect(updater.checkForUpdates.mock.calls.length).toBe(checks);
  await checkForUpdate();
  expect(updater.checkForUpdates.mock.calls.length).toBe(checks);
});

test("leaving nightly discards a ready installer and checks stable even when stable is older", async () => {
  updater.emit("update-downloaded", { version: "1.15.0-nightly.202610091300" });
  const checks = updater.checkForUpdates.mock.calls.length;
  await setUpdateChannel("stable");
  expect(updateState()).toEqual({ status: "idle", channel: "stable" });
  expect(JSON.parse(readFileSync(join(dataDir, "update-channel.json"), "utf8"))).toEqual({ channel: "stable" });
  expect(updater.allowPrerelease).toBeFalse();
  expect(updater.allowDowngrade).toBeTrue();
  expect(updater.autoInstallOnAppQuit).toBeFalse();
  expect(updater.checkForUpdates.mock.calls.length).toBe(checks + 1);
  installUpdate();
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
  updater.emit("update-available", { version: "1.14.0" });
  updater.emit("update-downloaded", { version: "1.14.0" });
  expect(updater.autoInstallOnAppQuit).toBeTrue();
  installUpdate();
  expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
});

test("a failed channel save keeps the downloaded installer and current preference", async () => {
  const file = join(dataDir, "update-channel.json");
  // A path occupied by a directory makes the actual file write fail on every platform.
  rmSync(file);
  mkdirSync(file);
  await expect(setUpdateChannel("nightly")).rejects.toThrow();
  expect(updateState().channel).toBe("stable");
  expect(updateState().status).toBe("ready");
  expect(updater.autoInstallOnAppQuit).toBeTrue();
  if (file !== join(dataDir, "update-channel.json")) throw new Error("Invalid test channel path");
  rmSync(file, { recursive: true });
  writeFileSync(file, JSON.stringify({ channel: "stable" }));
});

test("stable installs opt into nightlies without permitting older releases", async () => {
  version = "1.14.0";
  await setUpdateChannel("nightly");
  expect(updateState()).toEqual({ status: "idle", channel: "nightly" });
  expect(updater.allowPrerelease).toBeTrue();
  expect(updater.allowDowngrade).toBeFalse();
  expect(changes.at(-1)?.channel).toBe("nightly");
});

test("a failed new-channel check cannot install an old-channel download on quit", async () => {
  updater.emit("update-downloaded", { version: "1.15.0-nightly.202610091300" });
  updater.checkForUpdates.mockImplementationOnce(async () => { throw new Error("GitHub is unreachable"); });
  await setUpdateChannel("stable");
  expect(updateState()).toEqual({ status: "error", channel: "stable", error: "GitHub is unreachable" });
  expect(updater.autoInstallOnAppQuit).toBeFalse();
  const installations = updater.quitAndInstall.mock.calls.length;
  installUpdate();
  expect(updater.quitAndInstall.mock.calls.length).toBe(installations);
});

test("a saved channel survives restart and an invalid preference follows the installed build", async () => {
  const file = join(dataDir, "update-channel.json");
  for (const [installed, saved, expected] of [
    ["1.14.0", "nightly", "nightly"],
    ["1.15.0-nightly.202610091200", "stable", "stable"],
    ["1.14.0", "invalid", "stable"],
    ["1.15.0-nightly.202610091200", "invalid", "nightly"],
  ] as const) {
    updater.removeAllListeners();
    version = installed;
    writeFileSync(file, JSON.stringify({ channel: saved }));
    startUpdates((state) => changes.push(state));
    await checkForUpdate();
    expect(updateState().channel).toBe(expected);
    expect(updater.allowPrerelease).toBe(expected === "nightly");
  }
});

test("unsigned macOS builds offer both channels without downloading an unusable update", async () => {
  const platform = process.platform;
  const checks = updater.checkForUpdates.mock.calls.length;
  try {
    Object.defineProperty(process, "platform", { value: "darwin" });
    updater.removeAllListeners();
    version = "1.14.0";
    writeFileSync(join(dataDir, "update-channel.json"), JSON.stringify({ channel: "stable" }));
    startUpdates((state) => changes.push(state));
    expect(updateState()).toEqual({ status: "manual", channel: "stable" });
    await setUpdateChannel("nightly");
    expect(updateState()).toEqual({ status: "manual", channel: "nightly" });
    expect(JSON.parse(readFileSync(join(dataDir, "update-channel.json"), "utf8"))).toEqual({ channel: "nightly" });
    await checkForUpdate();
    expect(updater.checkForUpdates.mock.calls.length).toBe(checks);
    expect(updater.autoInstallOnAppQuit).toBeFalse();
    const installations = updater.quitAndInstall.mock.calls.length;
    installUpdate();
    expect(updater.quitAndInstall.mock.calls.length).toBe(installations);
  } finally {
    Object.defineProperty(process, "platform", { value: platform });
  }
});
