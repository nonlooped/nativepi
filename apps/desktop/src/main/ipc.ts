import { app, BrowserWindow, dialog, shell } from "electron";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { PiProcess } from "./pi/client.ts";
import type { PiMessage } from "./pi/protocol.ts";
import { deleteSession, listSessions, readSession, searchSessions, sessionMtime, usageDashboard, watchProjectSessions, watchSessionFile } from "./sessions.ts";
import { loadState, saveState } from "./state.ts";
import * as auth from "./auth.ts";
import { gitAddWorktree, gitBranches, gitCheckout, gitCommit, gitDiff, gitHunks, gitLog, gitPrTarget, gitPush, gitPushAndCreatePr, gitStageAll, gitStagedDiff, gitStageFile, gitStageHunk, gitStatus, gitSync, gitUnstageAll, gitUnstageFile } from "./git.ts";
import { generateCommitMessage } from "./commitMessage.ts";
import { getRepoHostContext } from "./repoHost.ts";
import { repoHostContextSchema } from "../shared/repo-host-types.ts";
import { installPackage, listPackages, removePackage, updatePackage } from "./packages.ts";
import { listSkills } from "./skills.ts";
import { readProjectDirectory, watchProjectDirectory } from "./fileExplorer.ts";
import { listProjectFiles } from "./files.ts";
import { prepareImages } from "./images.ts";
import { loadGraphicalExtensions } from "./extensions.ts";
import { fileManagerName, listInstalledEditors, openFileIn, openProjectIn } from "./editors.ts";
import { liveSettingsFor, piPaths, queuePiSettings, readPiSettings, writePiSettings } from "./piSettings.ts";
import { piSettingsPatchSchema, type PiSettingsPatch } from "../shared/pi-settings.ts";
import {
  clearTerminal,
  closeTerminal,
  closeProjectTerminals,
  createTerminal,
  listShellProfiles,
  listTerminals,
  liveTerminalProjects,
  renameTerminal,
  resizeTerminal,
  restartTerminal,
  stopAllTerminals,
  terminalSnapshot,
  writeTerminal,
} from "./terminal.ts";
import { extensionCallParamsSchema, type AccessStatus, type HostEvents, type HostRequestName, type HostRequests, type PiStatus } from "../shared/rpc-schema.ts";
import type { CommandInfo, ForkPoint, ModelInfo, RpcSessionState, SessionStats, SessionTreeNode, ThinkingLevel } from "../shared/pi-types.ts";
import { tuiClientFrameSchema, tuiCompletionEditSchema, tuiCompletionsSchema, type TuiHostFrame } from "../shared/tui-frames.ts";
import { localServerConnection, localServerStatus, startLocalServer, stopLocalServer } from "./localServer.ts";
import { setSleepBlocked } from "./powerSaveGuard.ts";
import {
  remoteAccessRunning,
  remoteAccessStatus,
  startRemoteAccess,
  stopRemoteAccess,
} from "./remoteAccess.ts";
import { checkForUpdate, downloadUpdate, installUpdate, startUpdates, updateState } from "./updates.ts";
import { devRuntimeStatus } from "./devRuntime.ts";

/** One Pi process per session: Pi already permits concurrent sessions in a project. */
const pis = new Map<string, PiProcess>();
// Pi gives even an unsent chat a session file, but the renderer deliberately
// keeps it invisible until its first prompt. Keep that process distinct from
// the project's opened chats so pre-send controls configure the right chat.
const draftPis = new Map<string, PiProcess>();
const starting = new Map<string, Promise<PiProcess>>();
const startingPis = new Map<string, PiProcess>();

let mainWindow: BrowserWindow | null = null;
type HostEventListener = <K extends keyof HostEvents>(channel: K, payload: HostEvents[K]) => void;
const hostEventListeners = new Set<HostEventListener>();

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

function pushDesktop<K extends keyof HostEvents>(channel: K, payload: HostEvents[K]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function push<K extends keyof HostEvents>(channel: K, payload: HostEvents[K]): void {
  pushDesktop(channel, payload);
  for (const listener of hostEventListeners) listener(channel, payload);
}

export function subscribeHostEvents(listener: HostEventListener): () => void {
  hostEventListeners.add(listener);
  return () => hostEventListeners.delete(listener);
}

const authPush: auth.AuthPush = {
  prompt: (id, prompt) => push("authPrompt", { id, prompt }),
  notice: (notice) => push("authNotice", { notice }),
};

function status(projectDir: string, status: PiStatus, detail?: string): void {
  push("piStatus", { projectDir, status, detail });
}

/**
 * Concurrent-session detection.
 *
 * `busyUntil` is the write-attribution heuristic: our own Pi writes the session
 * file throughout a turn and for a moment after it settles, so any change
 * outside that window came from somewhere else — the Pi CLI in a terminal, or
 * anything else editing the session file.
 */
const busyUntil = new Map<string, number>();
const SETTLE_GRACE_MS = 3000;
const sessionWatches = new Map<string, { projectDir: string; mtimeMs: number; stop: () => void }>();
const projectSessionWatches = new Map<string, () => void>();
const sessionNotificationTimers = new Map<string, ReturnType<typeof setTimeout>>();

function notifySessionsChanged(projectDir: string): void {
  clearTimeout(sessionNotificationTimers.get(projectDir));
  sessionNotificationTimers.set(projectDir, setTimeout(() => {
    sessionNotificationTimers.delete(projectDir);
    push("sessionsChanged", { projectDir });
  }, 150));
}

/**
 * The folders the file explorer is watching, per project.
 *
 * One entry per open folder, created the moment the renderer asks for it rather
 * than when its watcher finishes installing: `watchProjectDirectory` is async,
 * and a pane that opens and closes a folder faster than that would otherwise
 * leave the watcher behind with nothing left to cancel it.
 */
type ExplorerWatch = { stop: () => void };
const explorerWatches = new Map<string, Map<string, ExplorerWatch>>();

function setExplorerWatches(projectDir: string, paths: string[]): void {
  const current = explorerWatches.get(projectDir) ?? new Map<string, ExplorerWatch>();
  explorerWatches.set(projectDir, current);

  const wanted = new Set(paths);
  for (const [dir, watch] of current) {
    if (wanted.has(dir)) continue;
    watch.stop();
    current.delete(dir);
  }

  for (const dir of wanted) {
    if (current.has(dir)) continue;
    // `release` is what `stop()` currently means: recording the cancellation
    // until the watcher exists, and closing it afterwards.
    let stopped = false;
    let release = () => {
      stopped = true;
    };
    const entry: ExplorerWatch = { stop: () => release() };
    current.set(dir, entry);
    void watchProjectDirectory(projectDir, dir, () => {
      if (explorerWatches.get(projectDir)?.get(dir) === entry) push("projectFilesChanged", { projectDir, path: dir });
    }).then(
      (stop) => {
        if (stopped) stop();
        else release = stop;
      },
      () => {},
    );
  }

  if (current.size === 0) explorerWatches.delete(projectDir);
}

function stopExplorerWatches(projectDir: string): void {
  for (const watch of explorerWatches.get(projectDir)?.values() ?? []) watch.stop();
  explorerWatches.delete(projectDir);
}

function stopProjectSessionWatch(projectDir: string): void {
  projectSessionWatches.get(projectDir)?.();
  projectSessionWatches.delete(projectDir);
}

function markBusy(projectDir: string, until: number): void {
  busyUntil.set(projectDir, until);
}

/** Session path the window should match this process against. */
function clientSessionFile(projectDir: string, pi: PiProcess) {
  // A blank chat's draft Pi already has a hidden session file on disk, but the
  // renderer still treats that view as `activeSessionFile: null`. Tagging the
  // bound path would make every frame look like another chat's.
  return draftPis.get(projectDir) === pi ? undefined : pi.boundSessionFile;
}

const eventBatches = new Map<PiProcess, { projectDir: string; events: PiMessage[]; timer: ReturnType<typeof setTimeout> }>();

function flushEventBatch(pi: PiProcess): void {
  const batch = eventBatches.get(pi);
  if (!batch) return;
  clearTimeout(batch.timer);
  eventBatches.delete(pi);
  push("piEvent", {
    projectDir: batch.projectDir,
    sessionFile: clientSessionFile(batch.projectDir, pi),
    event: { type: "nativepi_event_batch", events: batch.events },
  });
}

function queueDisplayDelta(projectDir: string, pi: PiProcess, event: PiMessage): void {
  const batch = eventBatches.get(pi);
  if (batch) {
    batch.events.push(event);
    return;
  }
  eventBatches.set(pi, {
    projectDir,
    events: [event],
    timer: setTimeout(() => flushEventBatch(pi), 16),
  });
}

function forwardEvent(projectDir: string, pi: PiProcess, event: PiMessage): void {
  const sessionFile = pi.boundSessionFile ?? projectDir;
  if (event["type"] === "agent_start") markBusy(sessionFile, Number.POSITIVE_INFINITY);
  // `agent_end` closes one low-level run, not the turn: Pi may still be waiting
  // out an auto-retry delay, compacting, or holding a queued follow-up, and none
  // of those emit anything while they wait. `agent_settled` is the event Pi
  // documents as "nothing will start again on its own", so it is the only one
  // that hands the project back.
  else if (event["type"] === "agent_settled") markBusy(sessionFile, Date.now() + SETTLE_GRACE_MS);
  // Any Pi message means Pi is alive and touching this project right now.
  else if (busyUntil.get(sessionFile) !== Number.POSITIVE_INFINITY) {
    markBusy(sessionFile, Date.now() + SETTLE_GRACE_MS);
  }
  if (event["type"] === "message_update") {
    queueDisplayDelta(projectDir, pi, event);
    return;
  }
  flushEventBatch(pi);
  push("piEvent", { projectDir, sessionFile: clientSessionFile(projectDir, pi), event });
}

/**
 * Whether the close has to wait for an answer.
 *
 * Quitting kills every Pi and every shell, and neither gets a chance to finish
 * what it was doing. `busyUntil` already knows which projects are mid-turn — the
 * infinite value is set on `agent_start` and replaced when the turn settles — so
 * the summary the window shows is the same reading the session watcher trusts.
 * Only projects with a live process count: a Pi that died mid-turn leaves its
 * marker behind, and nothing is running for the user to lose.
 *
 * Connected browsers are asked about for a different reason: nothing of theirs
 * is lost, but the person holding the phone cannot see this window and has no
 * way to know their session is about to end.
 */
let quitConfirmed = false;

export function quitBlocked(): boolean {
  if (quitConfirmed) return false;
  const runs = [...pis.entries()]
    .filter(([sessionFile]) => busyUntil.get(sessionFile) === Number.POSITIVE_INFINITY)
    .map(([, pi]) => pi.projectDir);
  const terminals = liveTerminalProjects();
  const viewers = localServerStatus().clients.length;
  if (runs.length === 0 && terminals.length === 0 && viewers === 0) return false;
  pushDesktop("quitRequested", { work: { runs, terminals, viewers } });
  return true;
}

function stopSessionWatch(sessionFile: string): void {
  const watch = sessionWatches.get(sessionFile);
  watch?.stop();
  sessionWatches.delete(sessionFile);
}

function stopAllSessionWatches(): void {
  for (const watch of sessionWatches.values()) watch.stop();
  sessionWatches.clear();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function forwardPiFrame(projectDir: string, pi: PiProcess, frame: TuiHostFrame): void {
  if (frame.type === "nativepi_tui_auth_prompt") {
    push("authPrompt", { projectDir, id: frame.id, prompt: frame.prompt });
    return;
  }
  if (frame.type === "nativepi_tui_auth_notice") {
    push("authNotice", { projectDir, notice: frame.notice });
    if (frame.notice.kind === "auth_url") void shell.openExternal(frame.notice.url);
    return;
  }
  push("tuiFrame", { projectDir, sessionFile: clientSessionFile(projectDir, pi), frame });
}

function rememberPi(pi: PiProcess, sessionFile: string | undefined): void {
  const previous = pi.boundSessionFile;
  if (previous && pis.get(previous) === pi) pis.delete(previous);
  pi.boundSessionFile = sessionFile;
  if (sessionFile) pis.set(sessionFile, pi);
}

function projectPi(projectDir: string, sessionFile?: string | null): PiProcess | undefined {
  if (sessionFile) return pis.get(sessionFile);
  return draftPis.get(projectDir) ?? [...pis.values()].find((pi) => pi.projectDir === projectDir);
}

function ensurePi(projectDir: string, sessionFile?: string, fresh = false): Promise<PiProcess> {
  const existing = sessionFile ? pis.get(sessionFile) : fresh ? undefined : draftPis.get(projectDir);
  if (existing) return Promise.resolve(existing);
  const key = sessionFile ?? `new:${projectDir}`;
  const inflight = starting.get(key);
  if (inflight) return inflight;

  const startup = (async () => {
    status(projectDir, "starting", projectDir);
    let pi!: PiProcess;
    pi = new PiProcess(
      projectDir,
      (msg) => forwardEvent(projectDir, pi, msg),
      (code) => {
        // Panes belong to the process that drew them: a Pi that dies takes its
        // surfaces with it, and the window has to be told or they stay on screen
        // with nothing behind them.
        push("tuiFrame", { projectDir, sessionFile: clientSessionFile(projectDir, pi), frame: { type: "nativepi_tui_reset" } });
        if (pi.boundSessionFile && pis.get(pi.boundSessionFile) === pi) pis.delete(pi.boundSessionFile);
        if (draftPis.get(projectDir) === pi) draftPis.delete(projectDir);
        if (startingPis.get(key) === pi) startingPis.delete(key);
        // A Pi that dies mid-turn never reaches `agent_settled`, so drop the
        // marker with the process rather than leaving this project looking
        // permanently busy to the watcher.
        if (pi.boundSessionFile) busyUntil.delete(pi.boundSessionFile);
        if (![...pis.values(), ...startingPis.values()].some((other) => other.projectDir === projectDir)) {
          status(projectDir, "exited", `exit ${code ?? "?"}`);
        }
      },
      (frame) => forwardPiFrame(projectDir, pi, frame),
    );
    startingPis.set(key, pi);
    try {
      const state = await pi.request<RpcSessionState>({ type: "get_state" });
      if (sessionFile && state.sessionFile !== sessionFile) {
        await pi.request({ type: "switch_session", sessionPath: sessionFile });
        rememberPi(pi, sessionFile);
      } else {
        rememberPi(pi, state.sessionFile);
      }
    } catch {
    }
    startingPis.delete(key);
    if (!sessionFile) draftPis.set(projectDir, pi);
    status(projectDir, "ready");
    starting.delete(key);
    return pi;
  })();

  starting.set(key, startup);
  return startup;
}

async function bindPi(projectDir: string, sessionFile: string, mayWrite = true): Promise<PiProcess> {
  const pi = await ensurePi(projectDir, sessionFile);
  if (mayWrite) markBusy(sessionFile, Date.now() + SETTLE_GRACE_MS);
  return pi;
}

async function rebound(pi: PiProcess): Promise<string | undefined> {
  const state = await pi.request<RpcSessionState>({ type: "get_state" });
  rememberPi(pi, state.sessionFile);
  return state.sessionFile;
}

/**
 * Push the settings a running Pi can adopt without restarting.
 *
 * Pi reads `settings.json` once at startup, so a saved setting normally waits
 * for the next process. These four have RPC equivalents, and sending them to
 * every live Pi means the modes the user just chose govern the run they are
 * watching rather than the one after it. The RPC form is session-scoped and does
 * not persist, which is why the file was written first.
 *
 * What each process is sent is the value Pi resolves for that project, not the
 * user value verbatim: a project that overrides one of these keeps its override,
 * exactly as it would across a restart.
 */
function applyLive(patch: PiSettingsPatch): void {
  for (const pi of pis.values()) {
    const live = liveSettingsFor(pi.projectDir) ?? patch;
    if (patch.steeringMode !== undefined && live.steeringMode) {
      pi.send({ type: "set_steering_mode", mode: live.steeringMode });
    }
    if (patch.followUpMode !== undefined && live.followUpMode) {
      pi.send({ type: "set_follow_up_mode", mode: live.followUpMode });
    }
    if (patch.autoCompaction !== undefined && live.autoCompaction !== undefined) {
      pi.send({ type: "set_auto_compaction", enabled: live.autoCompaction });
    }
    if (patch.autoRetry !== undefined && live.autoRetry !== undefined) {
      pi.send({ type: "set_auto_retry", enabled: live.autoRetry });
    }
  }
}

function toModelInfo(model: unknown): ModelInfo {
  const m = (model ?? {}) as Record<string, unknown>;
  return {
    provider: String(m["provider"] ?? ""),
    id: String(m["id"] ?? ""),
    name: typeof m["name"] === "string" ? m["name"] : undefined,
    reasoning: typeof m["reasoning"] === "boolean" ? m["reasoning"] : undefined,
    contextWindow: typeof m["contextWindow"] === "number" ? m["contextWindow"] : undefined,
  };
}

function toSessionState(data: RpcSessionState): RpcSessionState {
  return { ...data, model: data.model ? toModelInfo(data.model) : undefined };
}


const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const openProjectInParamsSchema = z.object({ projectDir: z.string().min(1), editorId: z.string().min(1) });
const openFileInParamsSchema = openProjectInParamsSchema.extend({ file: z.string().min(1), line: z.number().int().positive().optional(), column: z.number().int().positive().optional() });
const saveImageParamsSchema = z.object({
  data: z.string().min(1).max(64 * 1024 * 1024),
  mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  suggestedName: z.string().min(1).max(255),
});
const gitMutationParamsSchema = z.object({
  projectDir: z.string().min(1),
  branch: z.string().min(1),
  create: z.boolean(),
});
const gitHunkParamsSchema = z.object({ projectDir: z.string().min(1), file: z.string().min(1), untracked: z.boolean(), patch: z.string().min(1) });
const gitFileParamsSchema = z.object({ projectDir: z.string().min(1), file: z.string().min(1) });
const gitUnstageFileParamsSchema = z.object({ projectDir: z.string().min(1), file: z.string().min(1), originalPath: z.string().min(1).optional() });
const gitCommitParamsSchema = z.object({ projectDir: z.string().min(1), message: z.string().trim().min(1).max(10_000) });
const gitPrParamsSchema = z.object({ projectDir: z.string().min(1), title: z.string().trim().min(1).max(256), body: z.string().max(50_000) });
const projectDirParamsSchema = z.object({ projectDir: z.string().min(1) });
/**
 * `get_commands` as the composer needs it, checked at the Pi boundary.
 *
 * A command whose shape Pi changed is dropped rather than passed on: the menu
 * ranks and renders these directly, and one entry missing a name would break the
 * list the user is typing into. Unknown fields are kept — this is Pi's data, and
 * NativePi is only reading it.
 */
const commandSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.enum(["extension", "prompt", "skill"]),
  location: z.enum(["user", "project", "path"]).optional(),
});
const commandsSchema = z.object({ commands: z.array(z.unknown()) });

function parseCommands(data: unknown): CommandInfo[] {
  return commandsSchema.parse(data).commands.flatMap((entry) => {
    const parsed = commandSchema.safeParse(entry);
    return parsed.success ? [parsed.data as CommandInfo] : [];
  });
}

const prepareImagesParamsSchema = z.object({
  // Shape only. Size, format and how many of them are decided per file in
  // `prepareImages`, so one image nobody can use — or twenty past the limit —
  // does not cost the user the rest of the drop, or the toast naming them.
  files: z.array(z.object({ name: z.string(), mimeType: z.string(), data: z.string() })),
});
/**
 * The extension UI channel, at the window boundary.
 *
 * These carry keystrokes and draft text into a component running in the Pi
 * process, and the caret positions a third-party provider is about to be handed.
 * The frame schema already bounds the shapes; this is the same check applied to
 * what the window sends, so main is not the one place trusting either side.
 */
const sessionPiParamsSchema = projectDirParamsSchema.extend({ sessionFile: z.string().min(1).nullable().optional() });
const commitMessageParamsSchema = sessionPiParamsSchema.extend({ model: z.string().min(1).max(500).optional() });
const tuiSendParamsSchema = sessionPiParamsSchema.extend({ frame: tuiClientFrameSchema });
const tuiCompleteParamsSchema = sessionPiParamsSchema.extend({
  lines: z.array(z.string()).max(1000),
  cursorLine: z.number().int().min(0),
  cursorCol: z.number().int().min(0),
});
const tuiApplyParamsSchema = tuiCompleteParamsSchema.extend({
  item: z.object({ value: z.string(), label: z.string(), description: z.string().optional() }),
  prefix: z.string().max(200),
});
const terminalIdParamsSchema = projectDirParamsSchema.extend({ terminalId: z.string().min(1) });
const terminalCreateParamsSchema = projectDirParamsSchema.extend({
  shellId: z.string().optional(),
  name: z.string().optional(),
});
const terminalRenameParamsSchema = terminalIdParamsSchema.extend({ name: z.string().min(1).max(64) });
const terminalResizeParamsSchema = terminalIdParamsSchema.extend({
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
});
const searchSessionsParamsSchema = z.object({
  requestId: z.string().min(1).max(100),
  projectDirs: z.array(z.string().min(1).max(32_767)).max(100),
  query: z.string().min(1).max(500),
});
const searchControllers = new Map<string, AbortController>();
/** `path` may be empty: that is how the explorer asks for the project root. */
const explorerDirParamsSchema = z.object({ projectDir: z.string().min(1).max(32_767), path: z.string().max(32_767) });
/** Capped because it is a watcher each: an explorer with 500 folders open is already past useful. */
const explorerWatchParamsSchema = z.object({
  projectDir: z.string().min(1).max(32_767),
  paths: z.array(z.string().max(32_767)).max(500),
});

async function knownProject(projectDir: string): Promise<boolean> {
  const project = resolve(projectDir);
  return (await loadState()).projects.some((entry) => resolve(entry.path) === project);
}
const usageDashboardParamsSchema = z.object({
  projects: z.array(z.object({ path: z.string().min(1).max(32_767), name: z.string().min(1).max(200) })).max(100),
});

function isThinkingLevel(level: unknown): level is ThinkingLevel {
  return typeof level === "string" && THINKING_LEVELS.has(level as ThinkingLevel);
}

type HandlerMap = {
  [K in HostRequestName]: (params: HostRequests[K]["params"]) => Promise<HostRequests[K]["response"]> | HostRequests[K]["response"];
};

const handlers: HandlerMap = {
  pickProject: async () => {
    const options = {
      properties: ["openDirectory" as const],
      defaultPath: app.getPath("home"),
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return { path: result.canceled || !result.filePaths[0] ? null : result.filePaths[0] };
  },

  loadState: () => loadState(),
  saveState: async ({ state }) => {
    await saveState(state);
    return { ok: true };
  },

  listSessions: async ({ projectDir }) => ({ sessions: await listSessions(projectDir) }),
  searchSessions: async (params) => {
    const { requestId, projectDirs, query } = searchSessionsParamsSchema.parse(params);
    searchControllers.get(requestId)?.abort();
    const controller = new AbortController();
    searchControllers.set(requestId, controller);
    try {
      return { results: await searchSessions(projectDirs, query, controller.signal) };
    } finally {
      if (searchControllers.get(requestId) === controller) searchControllers.delete(requestId);
    }
  },
  cancelSearchSessions: ({ requestId }) => {
    searchControllers.get(requestId)?.abort();
    searchControllers.delete(requestId);
    return { ok: true };
  },
  readSession: async ({ sessionFile }) => ({ entries: await readSession(sessionFile) }),
  watchProjectSessions: ({ projectDir }) => {
    if (!projectSessionWatches.has(projectDir)) {
      projectSessionWatches.set(projectDir, watchProjectSessions(projectDir, (sessionFile) => {
        if (sessionFile && Date.now() < (busyUntil.get(sessionFile) ?? 0)) return;
        notifySessionsChanged(projectDir);
      }));
    }
    return { ok: true };
  },
  unwatchProjectSessions: ({ projectDir }) => {
    stopProjectSessionWatch(projectDir);
    clearTimeout(sessionNotificationTimers.get(projectDir));
    sessionNotificationTimers.delete(projectDir);
    return { ok: true };
  },
  ensurePi: async ({ projectDir, sessionFile }) => {
    try {
      await ensurePi(projectDir, sessionFile ?? undefined);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  restartPi: async ({ projectDir }) => {
    const all = [...new Set([...pis.values(), ...startingPis.values()].filter((pi) => pi.projectDir === projectDir))];
    draftPis.delete(projectDir);
    for (const pi of all) if (pi.boundSessionFile) pis.delete(pi.boundSessionFile);
    await Promise.all(all.map((pi) => pi.stop()));
    return { ok: true };
  },

  /**
   * Restart every live Pi, not just the active project's.
   *
   * A setting that only takes effect on start is stale in every process that was
   * already running, and the projects the user is not looking at give no sign of
   * it. Stopping them all means the next time one is opened it starts on the
   * settings the file now holds.
  */
  restartAllPi: async () => {
    const all = [...new Set([...pis.values(), ...startingPis.values()])];
    pis.clear();
    draftPis.clear();
    starting.clear();
    startingPis.clear();
    await Promise.all(all.map((pi) => pi.stop()));
    return { ok: true };
  },

  newChat: async ({ projectDir }) => {
    try {
      const pi = await ensurePi(projectDir, undefined, true);
      await pi.request({ type: "new_session" });
      const state = await pi.request<RpcSessionState>({ type: "get_state" });
      rememberPi(pi, state.sessionFile);
      if (draftPis.get(projectDir) === pi) draftPis.delete(projectDir);
      return { ok: true, sessionFile: state.sessionFile };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  importSession: async ({ projectDir, sourceFile }) => {
    try {
      const source = sourceFile ?? (await pickSessionFile());
      if (!source) return { ok: false, canceled: true };

      const manager = SessionManager.forkFrom(source, projectDir);
      return { ok: true, sessionFile: manager.getSessionFile() };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  submit: async ({ projectDir, sessionFile, message, images, streamingBehavior }) => {
    // Claim the write before Pi is even up, so our own append is never mistaken
    // for a concurrent editor and a cold start counts as work in flight: the
    // renderer has already cleared the draft, and a close that slipped through
    // here would take the prompt with it.
    markBusy(sessionFile ?? projectDir, Number.POSITIVE_INFINITY);
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      if (!sessionFile) {
        // `ensurePi` created this draft session for its pre-send controls.
        // Starting another session here would discard those choices.
        sessionFile = pi.boundSessionFile ?? (await pi.request<RpcSessionState>({ type: "get_state" })).sessionFile ?? null;
        if (sessionFile) rememberPi(pi, sessionFile);
        if (draftPis.get(projectDir) === pi) draftPis.delete(projectDir);
      }
      if (sessionFile) markBusy(sessionFile, Number.POSITIVE_INFINITY);
      pi.send({ type: "prompt", message, images, streamingBehavior });
      return { ok: true, sessionFile: sessionFile ?? undefined };
    } catch (err) {
      markBusy(sessionFile ?? projectDir, Date.now() + SETTLE_GRACE_MS);
      return { ok: false, error: errorMessage(err) };
    }
  },

  enqueue: ({ projectDir, sessionFile, behavior, message, images }) => {
    const pi = pis.get(sessionFile);
    if (!pi) return { ok: false, error: "Pi is not running" };
    pi.send({ type: behavior === "steer" ? "steer" : "follow_up", message, images });
    return { ok: true };
  },

  prepareImages: async (params) => {
    try {
      const { files } = prepareImagesParamsSchema.parse(params);
      return await prepareImages(files);
    } catch {
      return { images: [], rejected: [] };
    }
  },

  abort: ({ sessionFile }) => {
    pis.get(sessionFile)?.send({ type: "abort" });
    return { ok: true };
  },

  getModels: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      const data = await pi.request<{ models: unknown[] }>({ type: "get_available_models" });
      return { models: data.models.map(toModelInfo) };
    } catch (err) {
      return { models: [], error: errorMessage(err) };
    }
  },

  getSessionProviders: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      return { providers: await pi.getProviders() };
    } catch (err) {
      return { providers: [], error: errorMessage(err) };
    }
  },

  getState: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      const data = await pi.request<RpcSessionState>({ type: "get_state" });
      return { state: toSessionState(data) };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  },

  getThinkingLevels: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      const data = await pi.request<{ levels: unknown[] }>({ type: "get_available_thinking_levels" });
      return { levels: data.levels.filter(isThinkingLevel) };
    } catch (err) {
      return { levels: [], error: errorMessage(err) };
    }
  },

  setModel: async ({ projectDir, sessionFile, provider, modelId }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      // Pi persists the model onto the session, and a request carries no event
      // for `forwardEvent` to attribute the write by, so claim it here or the
      // watcher reads our own mtime bump as a concurrent editor.
      if (sessionFile) markBusy(sessionFile, Date.now() + SETTLE_GRACE_MS);
      await pi.request({ type: "set_model", provider, modelId });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  setThinkingLevel: async ({ projectDir, sessionFile, level }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      if (sessionFile) markBusy(sessionFile, Date.now() + SETTLE_GRACE_MS);
      await pi.request({ type: "set_thinking_level", level });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  renameChat: async ({ projectDir, sessionFile, name }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      await pi.request({ type: "set_session_name", name });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  cloneChat: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      const res = await pi.request<{ cancelled: boolean }>({ type: "clone" });
      if (res.cancelled) return { ok: false, error: "Clone was cancelled" };
      return { ok: true, sessionFile: await rebound(pi) };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  deleteChat: async ({ projectDir, sessionFile }) => {
    try {
      // Pi keeps the file open while bound to it; move it off this chat first so
      // the delete cannot race a write, and so Pi isn't left pointing at nothing.
      const pi = pis.get(sessionFile);
      if (pi?.boundSessionFile === sessionFile) {
        if (pis.get(sessionFile) === pi) pis.delete(sessionFile);
        await pi.stop();
      }
      stopSessionWatch(sessionFile);
      await deleteSession(projectDir, sessionFile);
      notifySessionsChanged(projectDir);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  watchSession: async ({ projectDir, sessionFile }) => {
    if (!sessionFile) return { ok: true };
    if (sessionWatches.get(sessionFile)?.projectDir === projectDir) return { ok: true };
    stopSessionWatch(sessionFile);

    const baseline = await sessionMtime(sessionFile);
    const entry = {
      projectDir,
      mtimeMs: baseline,
      stop: () => {},
    };
    entry.stop = watchSessionFile(sessionFile, (mtimeMs) => {
      if (sessionWatches.get(sessionFile) !== entry || mtimeMs === entry.mtimeMs) return;
      entry.mtimeMs = mtimeMs;
      if (Date.now() < (busyUntil.get(sessionFile) ?? 0)) return; // Our own Pi wrote it.
      push("sessionChangedExternally", { projectDir, sessionFile });
    });
    sessionWatches.set(sessionFile, entry);
    return { ok: true };
  },

  getForkPoints: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      const data = await pi.request<{ messages: ForkPoint[] }>({ type: "get_fork_messages" });
      return { points: data.messages };
    } catch (err) {
      return { points: [], error: errorMessage(err) };
    }
  },

  forkChat: async ({ projectDir, sessionFile, entryId }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      const res = await pi.request<{ text: string; cancelled: boolean }>({ type: "fork", entryId });
      if (res.cancelled) return { ok: false, error: "Fork was cancelled" };
      return { ok: true, sessionFile: await rebound(pi), text: res.text };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  getTree: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      const data = await pi.request<{ tree: SessionTreeNode[]; leafId: string | null }>({ type: "get_tree" });
      return { tree: data.tree, leafId: data.leafId };
    } catch (err) {
      return { tree: [], leafId: null, error: errorMessage(err) };
    }
  },

  getStats: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      const stats = await pi.request<SessionStats>({ type: "get_session_stats" });
      return { stats };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  },

  getUsageDashboard: async (params) => {
    try {
      const { projects } = usageDashboardParamsSchema.parse(params);
      return { dashboard: await usageDashboard(projects) };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  },

  getContextInspector: async ({ projectDir, sessionFile }) => {
    try {
      const pi = sessionFile ? await bindPi(projectDir, sessionFile, false) : await ensurePi(projectDir);
      return { inspector: await pi.getContextInspector() };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  },

  compact: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      await pi.request({ type: "compact" });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  abortRetry: ({ sessionFile }) => {
    pis.get(sessionFile)?.send({ type: "abort_retry" });
    return { ok: true };
  },

  exportHtml: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      const data = await pi.request<{ path: string }>({ type: "export_html" });
      return { ok: true, path: data.path };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  listProviders: async () => {
    try {
      return { providers: await auth.listProviders() };
    } catch (err) {
      return { providers: [], error: errorMessage(err) };
    }
  },

  login: async ({ projectDir, providerId, type }) => {
    try {
      if (projectDir) await (await ensurePi(projectDir)).loginProvider(providerId, type);
      else await auth.login(providerId, type, authPush);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  authRespond: ({ projectDir, id, value, cancel }) => {
    if (projectDir) projectPi(projectDir)?.respondAuthPrompt(id, { value, cancel });
    else auth.respondPrompt(id, { value, cancel });
    return { ok: true };
  },

  logout: async ({ projectDir, providerId }) => {
    try {
      if (projectDir) await (await ensurePi(projectDir)).logoutProvider(providerId);
      else await auth.logout(providerId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  checkTrust: ({ projectDir }) => auth.checkTrust(projectDir),
  setTrust: ({ projectDir, trusted }) => {
    auth.setTrust(projectDir, trusted);
    return { ok: true };
  },

  windowMinimize: () => {
    mainWindow?.minimize();
    return { ok: true };
  },
  windowToggleMaximize: () => {
    if (!mainWindow) return { maximized: false };
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return { maximized: mainWindow.isMaximized() };
  },
  windowClose: () => {
    mainWindow?.close();
    return { ok: true };
  },
  confirmQuit: () => {
    quitConfirmed = true;
    app.quit();
    return { ok: true };
  },
  windowIsMaximized: () => ({ maximized: mainWindow?.isMaximized() ?? false }),

  openExternal: async ({ url }) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },

  listEditors: async () => {
    try {
      return { editors: await listInstalledEditors() };
    } catch {
      return { editors: [{ id: "explorer", name: fileManagerName(), icon: "explorer" }] };
    }
  },
  openProjectIn: async (params) => {
    try {
      const { projectDir, editorId } = openProjectInParamsSchema.parse(params);
      await openProjectIn(projectDir, editorId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  openFileIn: async (params) => {
    try {
      const { projectDir, file, editorId, line, column } = openFileInParamsSchema.parse(params);
      await openFileIn(projectDir, file, editorId, line, column);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  versions: () => ({ pi: auth.PI_VERSION_STRING, app: app.getVersion() }),
  devRuntimeStatus: () => devRuntimeStatus(),
  updateState: () => updateState(),
  checkForUpdate: () => checkForUpdate(),
  downloadUpdate: () => downloadUpdate(),
  installUpdate: async () => {
    if (updateState().status !== "ready") return { ok: false, error: "No update has finished downloading." };
    // The installer replaces files this process holds open, and it restarts the
    // app rather than closing it — a turn or a shell still running would be
    // killed by that restart instead of shut down.
    await stopAllPi();
    installUpdate();
    return { ok: true };
  },
  accessStatus: () => accessStatus(),
  startLocalAccess: async () => {
    const restoreRemote = remoteAccessRunning();
    try {
      if (restoreRemote) await stopRemoteAccess();
      await ensureLocalAccess(true);
      if (restoreRemote) await startRemoteAccessForCurrentServer();
      return accessStatus();
    } catch (err) {
      return accessStatus(errorMessage(err));
    }
  },
  stopLocalAccess: async () => {
    const restoreRemote = remoteAccessRunning();
    await stopRemoteAccess();
    await stopLocalServer();
    try {
      if (restoreRemote) {
        await ensureLocalAccess(false);
        await startRemoteAccessForCurrentServer();
      }
      return accessStatus();
    } catch (err) {
      return accessStatus(errorMessage(err));
    }
  },
  replaceAccessLink: async () => {
    const localNetwork = localServerStatus().running;
    const restoreRemote = remoteAccessRunning();
    await stopRemoteAccess();
    await stopLocalServer();
    try {
      await ensureLocalAccess(localNetwork);
      if (restoreRemote) await startRemoteAccessForCurrentServer();
      return accessStatus();
    } catch (err) {
      return accessStatus(errorMessage(err));
    }
  },
  revokeAccess: async () => {
    await stopRemoteAccess();
    await stopLocalServer();
    return accessStatus();
  },
  startRemoteAccess: async () => {
    try {
      await ensureLocalAccess(localServerStatus().running);
      await startRemoteAccessForCurrentServer();
      return accessStatus();
    } catch (err) {
      return accessStatus(errorMessage(err));
    }
  },
  stopRemoteAccess: async () => {
    await stopRemoteAccess();
    if (!localServerStatus().running) await stopLocalServer();
    return accessStatus();
  },

  getPiSettings: () => {
    try {
      return { settings: readPiSettings() };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  },
  // Queued as one unit: writing, pushing live, and reading back all have to see
  // the same file, or an overlapping write undoes this one.
  setPiSettings: ({ patch }) =>
    queuePiSettings(async () => {
      try {
        const parsed = piSettingsPatchSchema.parse(patch);
        await writePiSettings(parsed);
        applyLive(parsed);
        // Read back rather than echo: this is what Pi now reports, including any
        // value it normalized on the way in.
        return { ok: true, settings: readPiSettings() };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    }),
  piPaths: () => ({ paths: piPaths() }),
  showInFolder: ({ path }) => {
    shell.showItemInFolder(path);
    return { ok: true };
  },
  saveImage: async (params) => {
    try {
      const { data, mimeType, suggestedName } = saveImageParamsSchema.parse(params);
      const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
      const defaultPath = suggestedName.includes(".") ? suggestedName : `${suggestedName}.${extension}`;
      const options = { defaultPath, filters: [{ name: "Image", extensions: [extension] }] };
      const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      await writeFile(result.filePath, Buffer.from(data, "base64"));
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  terminalEnsure: (params) => {
    const { projectDir, shellId } = projectDirParamsSchema.extend({ shellId: z.string().optional() }).parse(params);
    const existing = listTerminals(projectDir);
    if (existing.length > 0) return { terminals: existing };
    return {
      terminals: [
        createTerminal(
          projectDir,
          shellId,
          undefined,
          (payload) => push("terminalData", payload),
          (payload) => push("terminalExit", payload),
        ),
      ],
    };
  },
  terminalCreate: (params) => {
    const { projectDir, shellId, name } = terminalCreateParamsSchema.parse(params);
    return {
      terminal: createTerminal(
        projectDir,
        shellId,
        name,
        (payload) => push("terminalData", payload),
        (payload) => push("terminalExit", payload),
      ),
    };
  },
  terminalListShells: () => ({ shells: listShellProfiles() }),
  terminalRename: (params) => {
    const { projectDir, terminalId, name } = terminalRenameParamsSchema.parse(params);
    renameTerminal(projectDir, terminalId, name);
    return { ok: true };
  },
  terminalRestart: (params) => {
    const { projectDir, terminalId } = terminalIdParamsSchema.parse(params);
    const terminal = restartTerminal(
      projectDir,
      terminalId,
      (payload) => push("terminalData", payload),
      (payload) => push("terminalExit", payload),
    );
    push("terminalRestart", { projectDir, terminal });
    return { terminal };
  },
  terminalSnapshot: (params) => {
    const { projectDir, terminalId } = terminalIdParamsSchema.parse(params);
    return terminalSnapshot(projectDir, terminalId);
  },
  terminalWrite: (params) => {
    const { projectDir, terminalId, data } = terminalIdParamsSchema.extend({ data: z.string().max(64 * 1024) }).parse(params);
    writeTerminal(projectDir, terminalId, data);
    return { ok: true };
  },
  terminalResize: (params) => {
    const { projectDir, terminalId, cols, rows } = terminalResizeParamsSchema.parse(params);
    resizeTerminal(projectDir, terminalId, cols, rows);
    return { ok: true };
  },
  terminalClear: (params) => {
    const { projectDir, terminalId } = terminalIdParamsSchema.parse(params);
    clearTerminal(projectDir, terminalId);
    return { ok: true };
  },
  terminalClose: (params) => {
    const { projectDir, terminalId } = terminalIdParamsSchema.parse(params);
    closeTerminal(projectDir, terminalId);
    return { ok: true };
  },
  terminalCloseProject: (params) => {
    const { projectDir } = projectDirParamsSchema.parse(params);
    closeProjectTerminals(projectDir);
    return { ok: true };
  },

  gitStatus: async ({ projectDir }) => ({ status: await gitStatus(projectDir) }),
  gitLog: async ({ projectDir }) => ({ commits: await gitLog(projectDir) }),
  gitDiff: async ({ projectDir, file, untracked, staged }) => ({ diff: await gitDiff(projectDir, file, untracked, staged) }),
  gitHunks: async ({ projectDir, file, untracked }) => ({ hunks: await gitHunks(projectDir, file, untracked) }),
  gitStageHunk: async (params) => {
    try { const { projectDir, file, untracked, patch } = gitHunkParamsSchema.parse(params); return await gitStageHunk(projectDir, file, untracked, patch); }
    catch (err) { return { ok: false, error: errorMessage(err) }; }
  },
  gitStageFile: async (params) => {
    try { const { projectDir, file } = gitFileParamsSchema.parse(params); return await gitStageFile(projectDir, file); }
    catch (err) { return { ok: false, error: errorMessage(err) }; }
  },
  gitUnstageFile: async (params) => {
    try { const { projectDir, file, originalPath } = gitUnstageFileParamsSchema.parse(params); return await gitUnstageFile(projectDir, file, originalPath); }
    catch (err) { return { ok: false, error: errorMessage(err) }; }
  },
  gitStageAll: async ({ projectDir }) => await gitStageAll(projectDir),
  gitUnstageAll: async ({ projectDir }) => await gitUnstageAll(projectDir),
  gitGenerateCommitMessage: async (params) => {
    try {
      const { projectDir, sessionFile, model: selectedModel } = commitMessageParamsSchema.parse(params);
      const diff = await gitStagedDiff(projectDir);
      if (!diff) return { error: "Stage at least one change before generating a commit message." };
      let model = selectedModel;
      if (!model) {
        const pi = await ensurePi(projectDir, sessionFile ?? undefined);
        const state = await pi.request<RpcSessionState>({ type: "get_state" });
        model = state.model ? `${state.model.provider}/${state.model.id}` : undefined;
      }
      if (!model) return { error: "Select a model before generating a commit message." };
      return { message: await generateCommitMessage(projectDir, diff, model) };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  },
  gitCommit: async (params) => {
    try { const { projectDir, message } = gitCommitParamsSchema.parse(params); return await gitCommit(projectDir, message); }
    catch (err) { return { ok: false, error: errorMessage(err) }; }
  },
  gitPush: async ({ projectDir }) => await gitPush(projectDir),
  gitSync: async ({ projectDir }) => await gitSync(projectDir),
  gitPrTarget: async ({ projectDir }) => ({ target: await gitPrTarget(projectDir) }),
  gitPushAndCreatePr: async (params) => {
    try { const { projectDir, title, body } = gitPrParamsSchema.parse(params); return await gitPushAndCreatePr(projectDir, title, body); }
    catch (err) { return { ok: false, error: errorMessage(err) }; }
  },
  gitBranches: async ({ projectDir }) => ({ branches: await gitBranches(projectDir) }),
  gitCheckout: async (params) => {
    try {
      const { projectDir, branch, create } = gitMutationParamsSchema.parse(params);
      return await gitCheckout(projectDir, branch, create);
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  gitAddWorktree: async (params) => {
    try {
      const { projectDir, branch, create } = gitMutationParamsSchema.parse(params);
      return await gitAddWorktree(projectDir, branch, create);
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  repoHostContext: async ({ projectDir }) => {
    try {
      const context = await getRepoHostContext(projectDir);
      return { context: context ? repoHostContextSchema.safeParse(context).data ?? null : null };
    } catch {
      return { context: null };
    }
  },

  listCommands: async ({ projectDir }) => {
    try {
      const pi = await ensurePi(projectDir);
      return { commands: parseCommands(await pi.request({ type: "get_commands" })) };
    } catch {
      // Same as the skills menu below: an empty list says "nothing to run",
      // which is the truth as far as this window can tell. A response from a Pi
      // that answers `get_commands` with something else lands here too, rather
      // than reaching the menu as a shape it cannot render.
      return { commands: [] };
    }
  },
  listSkills: async ({ projectDir }) => {
    try {
      return { skills: await listSkills(projectDir) };
    } catch {
      // The composer opens its menu regardless; an empty one says "nothing to
      // insert", which is the truth as far as this window can tell.
      return { skills: [] };
    }
  },
  listProjectFiles: async ({ projectDir }) => {
    try {
      return { files: await listProjectFiles(projectDir) };
    } catch {
      return { files: [] };
    }
  },
  readProjectDirectory: async (params) => {
    const { projectDir, path: dir } = explorerDirParamsSchema.parse(params);
    if (!await knownProject(projectDir)) return { entries: [], error: "That project is not available." };
    try {
      return { entries: await readProjectDirectory(projectDir, dir) };
    } catch {
      // A folder can vanish or be unreadable between the click and the read;
      // the explorer says so on that one row and leaves the rest standing.
      return { entries: [], error: "That folder could not be read." };
    }
  },
  watchProjectDirectories: async (params) => {
    const { projectDir, paths } = explorerWatchParamsSchema.parse(params);
    // An unknown project gets its watchers dropped rather than refused: that is
    // also what the pane asks for when it lets a project go.
    if (!await knownProject(projectDir)) {
      stopExplorerWatches(projectDir);
      return { ok: true };
    }
    setExplorerWatches(projectDir, paths);
    return { ok: true };
  },

  listPackages: async ({ projectDir }) => {
    try {
      return await listPackages(projectDir);
    } catch (err) {
      return { packages: [], extensions: [], projectTrusted: false, errors: [errorMessage(err)] };
    }
  },
  installPackage: async ({ projectDir, source, scope }) => {
    try {
      await installPackage(projectDir, source, scope);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  removePackage: async ({ projectDir, source, scope }) => {
    try {
      await removePackage(projectDir, source, scope);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  updatePackage: async ({ projectDir, source }) => {
    try {
      await updatePackage(projectDir, source);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  callExtension: async (request) => {
    try {
      const { projectDir, sessionFile, extension, method, params } = extensionCallParamsSchema.parse(request);
      // A new chat's draft Pi is separate from the project's opened chats, so
      // graphical settings calls stay with the chat on screen.
      const pi = sessionFile ? await bindPi(projectDir, sessionFile, false) : await ensurePi(projectDir);
      return { result: await pi.callExtension(extension, method, params) };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  },

  loadGraphicalExtensions: async ({ projectDir }) => {
    try {
      return { extensions: await loadGraphicalExtensions(projectDir) };
    } catch {
      return { extensions: [] };
    }
  },
  extensionRespond: ({ projectDir, sessionFile, response }) => {
    projectPi(projectDir, sessionFile)?.sendRaw(response);
    return { ok: true };
  },
  tuiSend: async (params) => {
    const { projectDir, sessionFile, frame } = tuiSendParamsSchema.parse(params);
    projectPi(projectDir, sessionFile)?.sendFrame(frame);
    return { ok: true };
  },
  tuiComplete: async (params) => {
    const { projectDir, sessionFile, lines, cursorLine, cursorCol } = tuiCompleteParamsSchema.parse(params);
    const pi = projectPi(projectDir, sessionFile);
    if (!pi) return { completions: null };
    try {
      const reply = await pi.frameRequest((requestId) => ({
        type: "nativepi_tui_complete" as const,
        requestId,
        lines,
        cursorLine,
        cursorCol,
      }));
      // A provider is extension code, so its answer is checked before it becomes
      // a menu. `null` is the documented "I have nothing for this line".
      return { completions: reply === null ? null : tuiCompletionsSchema.parse(reply) };
    } catch (err) {
      return { completions: null, error: errorMessage(err) };
    }
  },
  tuiApply: async (params) => {
    const { projectDir, sessionFile, lines, cursorLine, cursorCol, item, prefix } = tuiApplyParamsSchema.parse(params);
    const pi = projectPi(projectDir, sessionFile);
    if (!pi) return { edit: null };
    try {
      const reply = await pi.frameRequest((requestId) => ({
        type: "nativepi_tui_apply" as const,
        requestId,
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      }));
      return { edit: reply === null ? null : tuiCompletionEditSchema.parse(reply) };
    } catch (err) {
      return { edit: null, error: errorMessage(err) };
    }
  },
};

async function pickSessionFile(): Promise<string | undefined> {
  const options = {
    title: "Import chat",
    properties: ["openFile" as const],
    defaultPath: app.getPath("home"),
    filters: [{ name: "Pi session", extensions: ["jsonl"] }],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}

async function ensureLocalAccess(localNetwork: boolean): Promise<void> {
  if (process.env["ELECTRON_RENDERER_URL"]) {
    throw new Error("Access is available in packaged NativePi.");
  }
  await startLocalServer({
    rendererDir: resolve(import.meta.dirname, "../renderer"),
    invoke: invokeHostRequest,
    subscribe: subscribeHostEvents,
  }, localNetwork);
}

async function startRemoteAccessForCurrentServer(): Promise<void> {
  const connection = localServerConnection();
  if (!connection) throw new Error("NativePi could not start its access server.");
  await startRemoteAccess(connection.port, connection.token, join(app.getPath("userData"), "bin"));
}

function accessStatus(localError?: string): AccessStatus {
  const local = localServerStatus();
  // Any server bound and listening — local network or loopback backing a
  // remote tunnel — is a reason this machine should not go to sleep.
  setSleepBlocked(localServerConnection() !== undefined);
  return {
    local: localError ? { ...local, error: localError } : local,
    remote: remoteAccessStatus(),
  };
}

export async function invokeHostRequest<K extends HostRequestName>(
  name: K,
  params: HostRequests[K]["params"],
): Promise<HostRequests[K]["response"]> {
  if (!Object.hasOwn(handlers, name)) throw new Error(`Unknown host request: ${String(name)}`);
  const handler = handlers[name] as (value: HostRequests[K]["params"]) =>
    Promise<HostRequests[K]["response"]> | HostRequests[K]["response"];
  return await handler(params ?? ({} as HostRequests[K]["params"]));
}

export function initializeHost(): void {
  // Started from here rather than from the window: `push` is what turns an
  // update into something the renderer can see, and it lives in this module.
  startUpdates((state) => push("updateState", state));
}

export async function stopAllPi(): Promise<void> {
  for (const pi of eventBatches.keys()) flushEventBatch(pi);
  stopAllSessionWatches();
  for (const projectDir of projectSessionWatches.keys()) stopProjectSessionWatch(projectDir);
  for (const projectDir of [...explorerWatches.keys()]) stopExplorerWatches(projectDir);
  for (const timer of sessionNotificationTimers.values()) clearTimeout(timer);
  sessionNotificationTimers.clear();
  stopAllTerminals();
  await stopRemoteAccess();
  await stopLocalServer();
  setSleepBlocked(false);
  const all = [...pis.values()];
  pis.clear();
  draftPis.clear();
  starting.clear();
  await Promise.all(all.map((pi) => pi.stop()));
}
