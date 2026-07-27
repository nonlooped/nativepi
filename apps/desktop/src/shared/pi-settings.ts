import { z } from "zod";

/**
 * The Pi settings NativePi exposes, flattened.
 *
 * Pi's own `Settings` interface is larger than this and roughly half of it
 * describes its terminal UI — cell widths, cursor rendering, editor padding,
 * changelog collapsing. Those have no meaning in a desktop window, so the
 * surface here is deliberately the subset a NativePi user can act on, flattened
 * out of Pi's nested groups (`compaction.enabled`, `images.blockImages`) because
 * one control edits one field either way.
 *
 * Every field below is backed by a `SettingsManager` setter. Fields Pi can read
 * but not write through the manager are absent rather than hand-written into
 * `settings.json`, so NativePi never becomes a second writer of Pi's format.
 *
 * Values are always concrete: a setting Pi leaves unset is reported with Pi's
 * own default applied, so a switch shows what Pi will actually do. The three
 * "empty means unset" strings (`shellPath`, `shellCommandPrefix`, `npmCommand`)
 * are the exception, and empty is a meaningful value there rather than a gap.
 */
export const piSettingsSchema = z.object({
  /** Empty string means "let each model choose", which is Pi's unset behavior. */
  defaultThinkingLevel: z.enum(["", "off", "minimal", "low", "medium", "high", "xhigh", "max"]),
  steeringMode: z.enum(["all", "one-at-a-time"]),
  followUpMode: z.enum(["all", "one-at-a-time"]),
  autoCompaction: z.boolean(),
  autoRetry: z.boolean(),
  hideThinkingBlock: z.boolean(),
  showCacheMissNotices: z.boolean(),
  enableSkillCommands: z.boolean(),
  transport: z.enum(["auto", "sse", "websocket", "websocket-cached"]),
  httpIdleTimeoutMs: z.number().int().min(0).max(3_600_000),
  /** Empty means Pi picks the shell. */
  shellPath: z.string().max(1024),
  shellCommandPrefix: z.string().max(1024),
  /** Space-separated, as typed. Empty means Pi's built-in npm invocation. */
  npmCommand: z.string().max(1024),
  /** One glob per line. Empty means every model the providers offer. */
  enabledModels: z.string().max(8192),
  defaultProjectTrust: z.enum(["ask", "always", "never"]),
  blockImages: z.boolean(),
  autoResizeImages: z.boolean(),
  warnAnthropicExtraUsage: z.boolean(),
  enableInstallTelemetry: z.boolean(),
  enableAnalytics: z.boolean(),
});

export type PiSettings = z.infer<typeof piSettingsSchema>;

/** A settings write: any subset of the fields above. */
export const piSettingsPatchSchema = piSettingsSchema.partial();

export type PiSettingsPatch = z.infer<typeof piSettingsPatchSchema>;

/**
 * Where Pi keeps the files behind these settings, for the About screen.
 *
 * Shown so a user who wants to hand-edit something NativePi does not expose can
 * find it, rather than having to know Pi's directory layout.
 */
export interface PiPaths {
  agentDir: string;
  settingsFile: string;
  authFile: string;
}

/**
 * Settings that reach a running Pi process immediately.
 *
 * Pi loads `settings.json` when it starts, so everything else needs the project's
 * Pi to be restarted before it takes effect. These four have RPC equivalents, so
 * writing them can also be applied live — see `applyLive` in `main/piSettings.ts`.
 */
export const LIVE_SETTINGS = ["steeringMode", "followUpMode", "autoCompaction", "autoRetry"] as const;

/** Whether a patch changes anything that only a Pi restart will pick up. */
export function needsRestart(patch: PiSettingsPatch): boolean {
  return Object.keys(patch).some((key) => !LIVE_SETTINGS.includes(key as (typeof LIVE_SETTINGS)[number]));
}
