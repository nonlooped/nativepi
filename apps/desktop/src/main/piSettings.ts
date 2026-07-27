import path from "node:path";
import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import { app } from "electron";
import { LIVE_SETTINGS, type PiPaths, type PiSettings, type PiSettingsPatch } from "../shared/pi-settings.ts";
import type { ThinkingLevel } from "../shared/pi-types.ts";
import { piServices } from "./pi/services.ts";

/**
 * NativePi's settings screen, read and written through Pi's own SettingsManager.
 *
 * Pi owns this configuration: the same `~/.pi/agent/settings.json` the Pi CLI
 * reads is the file being edited here, and every write goes through a Pi setter
 * rather than through JSON of our own. That is what makes a change in NativePi
 * show up in a terminal Pi session and vice versa.
 *
 * The manager is built per call rather than kept around. It caches the file it
 * read at construction, and Pi (or a hand edit) can change that file at any
 * moment, so a long-lived instance would serve stale values and — worse — write
 * them back. Construction is a single small JSON read.
 */

/**
 * User-scope settings only.
 *
 * `projectTrusted: false` makes the manager skip project settings entirely, so
 * the values read back are the user's own rather than a merge with whatever the
 * currently open folder happens to override. That matches what the screen
 * writes: NativePi edits the user scope, and project overrides stay the Pi
 * CLI's business.
 *
 * The cwd is only used to locate a project settings file that is then never
 * loaded, so the home directory is as good as anything.
 */
function manager(): SettingsManager {
  return SettingsManager.create(app.getPath("home"), getAgentDir(), { projectTrusted: false });
}

/**
 * One settings write at a time.
 *
 * Each write builds a manager from its own snapshot of `settings.json`, so two
 * overlapping writes both start from the pre-change file and the second one
 * flushes the first one's field back to its old value. Chaining the whole
 * read-modify-write-readback cycle is what keeps two controls toggled in quick
 * succession from cancelling each other out, and it makes the settings each
 * request reads back include every write that preceded it.
 */
let writes: Promise<unknown> = Promise.resolve();

export function queuePiSettings<T>(task: () => Promise<T>): Promise<T> {
  // Both arms run `task`: a failed write must not stall every write after it.
  const run = writes.then(task, task);
  writes = run.catch(() => undefined);
  return run;
}

export function piPaths(): PiPaths {
  // Pi exports `getAgentDir` but not the individual file paths, and both files
  // have lived directly under the agent directory since Pi had one.
  const agentDir = getAgentDir();
  return {
    agentDir,
    settingsFile: path.join(agentDir, "settings.json"),
    authFile: path.join(agentDir, "auth.json"),
  };
}

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

/** Pi may know levels this build does not; an unrecognized one reads as unset. */
function thinkingLevel(level: string | undefined): PiSettings["defaultThinkingLevel"] {
  return level && THINKING_LEVELS.has(level) ? (level as PiSettings["defaultThinkingLevel"]) : "";
}

export function readPiSettings(): PiSettings {
  const settings = manager();
  // A settings file Pi cannot parse reads as every default, and the manager
  // then refuses to write over it. Reporting the failure is the only honest
  // option: showing defaults would invite edits that silently do nothing.
  const errors = settings.drainErrors();
  if (errors.length > 0) throw errors[0]!.error;

  const retry = settings.getRetrySettings();
  return {
    defaultThinkingLevel: thinkingLevel(settings.getDefaultThinkingLevel()),
    steeringMode: settings.getSteeringMode(),
    followUpMode: settings.getFollowUpMode(),
    autoCompaction: settings.getCompactionEnabled(),
    autoRetry: retry.enabled,
    hideThinkingBlock: settings.getHideThinkingBlock(),
    showCacheMissNotices: settings.getShowCacheMissNotices(),
    enableSkillCommands: settings.getEnableSkillCommands(),
    transport: settings.getTransport(),
    httpIdleTimeoutMs: settings.getHttpIdleTimeoutMs(),
    shellPath: settings.getShellPath() ?? "",
    shellCommandPrefix: settings.getShellCommandPrefix() ?? "",
    npmCommand: (settings.getNpmCommand() ?? []).join(" "),
    enabledModels: (settings.getEnabledModels() ?? []).join("\n"),
    defaultProjectTrust: settings.getDefaultProjectTrust(),
    blockImages: settings.getBlockImages(),
    autoResizeImages: settings.getImageAutoResize(),
    warnAnthropicExtraUsage: settings.getWarnings().anthropicExtraUsage ?? true,
    enableInstallTelemetry: settings.getEnableInstallTelemetry(),
    enableAnalytics: settings.getEnableAnalytics(),
  };
}

/** The four live-appliable settings, as they resolve for one project. */
export type LivePiSettings = Pick<PiSettings, (typeof LIVE_SETTINGS)[number]>;

/**
 * What the live settings resolve to inside a given project.
 *
 * The settings screen edits the user scope, but a project can override any of
 * these in its own `settings.json`, and Pi resolves project over user. Pushing
 * the raw user value into a running process would therefore override an
 * override — the session would follow a setting Pi itself would not have
 * chosen, until the next restart put the project's value back. Reading through
 * a project-scoped manager after the user file is written gives exactly the
 * value Pi would resolve, overridden or not.
 *
 * `undefined` when the project's settings cannot be read; the caller then has
 * nothing better to send than what the user chose.
 */
export function liveSettingsFor(projectDir: string): LivePiSettings | undefined {
  try {
    const { settings } = piServices(projectDir);
    if (settings.drainErrors().length > 0) return undefined;
    const retry = settings.getRetrySettings();
    return {
      steeringMode: settings.getSteeringMode(),
      followUpMode: settings.getFollowUpMode(),
      autoCompaction: settings.getCompactionEnabled(),
      autoRetry: retry.enabled,
    };
  } catch {
    return undefined;
  }
}

/** Split a whitespace- or newline-separated list into the entries Pi stores. */
function list(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function writePiSettings(patch: PiSettingsPatch): Promise<void> {
  const settings = manager();

  if (patch.defaultThinkingLevel !== undefined) {
    // The empty choice means "no stored default, let the model decide", and an
    // undefined value is how the manager removes a key: it writes the field it
    // was told changed, and `JSON.stringify` drops it. The cast is only because
    // this one setter is typed as required where the others accept `undefined`.
    settings.setDefaultThinkingLevel(
      (patch.defaultThinkingLevel || undefined) as ThinkingLevel,
    );
  }
  if (patch.steeringMode !== undefined) settings.setSteeringMode(patch.steeringMode);
  if (patch.followUpMode !== undefined) settings.setFollowUpMode(patch.followUpMode);
  if (patch.autoCompaction !== undefined) settings.setCompactionEnabled(patch.autoCompaction);
  if (patch.autoRetry !== undefined) settings.setRetryEnabled(patch.autoRetry);
  if (patch.hideThinkingBlock !== undefined) settings.setHideThinkingBlock(patch.hideThinkingBlock);
  if (patch.showCacheMissNotices !== undefined) settings.setShowCacheMissNotices(patch.showCacheMissNotices);
  if (patch.enableSkillCommands !== undefined) settings.setEnableSkillCommands(patch.enableSkillCommands);
  if (patch.transport !== undefined) settings.setTransport(patch.transport);
  if (patch.httpIdleTimeoutMs !== undefined) settings.setHttpIdleTimeoutMs(patch.httpIdleTimeoutMs);
  if (patch.shellPath !== undefined) settings.setShellPath(patch.shellPath.trim() || undefined);
  if (patch.shellCommandPrefix !== undefined) {
    settings.setShellCommandPrefix(patch.shellCommandPrefix.trim() || undefined);
  }
  if (patch.npmCommand !== undefined) {
    const command = list(patch.npmCommand);
    settings.setNpmCommand(command.length > 0 ? command : undefined);
  }
  if (patch.enabledModels !== undefined) {
    const patterns = list(patch.enabledModels);
    settings.setEnabledModels(patterns.length > 0 ? patterns : undefined);
  }
  if (patch.defaultProjectTrust !== undefined) settings.setDefaultProjectTrust(patch.defaultProjectTrust);
  if (patch.blockImages !== undefined) settings.setBlockImages(patch.blockImages);
  if (patch.autoResizeImages !== undefined) settings.setImageAutoResize(patch.autoResizeImages);
  if (patch.warnAnthropicExtraUsage !== undefined) {
    settings.setWarnings({ ...settings.getWarnings(), anthropicExtraUsage: patch.warnAnthropicExtraUsage });
  }
  if (patch.enableInstallTelemetry !== undefined) settings.setEnableInstallTelemetry(patch.enableInstallTelemetry);
  if (patch.enableAnalytics !== undefined) settings.setEnableAnalytics(patch.enableAnalytics);

  // The setters queue their writes. Flushing before returning is what lets the
  // renderer re-read and see what it just saved, and what makes a failed write
  // surface as a rejected request rather than as silence.
  await settings.flush();
  const errors = settings.drainErrors();
  if (errors.length > 0) throw errors[0]!.error;
}
