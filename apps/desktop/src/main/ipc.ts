import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { PiProcess } from "./pi/client.ts";
import type { PiMessage } from "./pi/protocol.ts";
import { deleteSession, listSessions, readSession, sessionMtime, watchSessionFile } from "./sessions.ts";
import { loadState, saveState } from "./state.ts";
import * as auth from "./auth.ts";
import { gitAddWorktree, gitBranches, gitCheckout, gitDiff, gitStatus } from "./git.ts";
import { installPackage, listPackages, removePackage, updatePackage } from "./packages.ts";
import { listSkills } from "./skills.ts";
import { listProjectFiles } from "./files.ts";
import { prepareImages } from "./images.ts";
import { loadGraphicalExtensions } from "./extensions.ts";
import { listInstalledEditors, openProjectIn } from "./editors.ts";
import { liveSettingsFor, piPaths, queuePiSettings, readPiSettings, writePiSettings } from "./piSettings.ts";
import { piSettingsPatchSchema, type PiSettingsPatch } from "../shared/pi-settings.ts";
import {
  closeTerminal,
  closeProjectTerminals,
  createTerminal,
  listTerminals,
  liveTerminalProjects,
  resizeTerminal,
  stopAllTerminals,
  terminalSnapshot,
  writeTerminal,
} from "./terminal.ts";
import type { HostEvents, HostRequestName, HostRequests, PiStatus } from "../shared/rpc-schema.ts";
import type { CommandInfo, ForkPoint, ModelInfo, RpcSessionState, SessionStats, SessionTreeNode, ThinkingLevel } from "../shared/pi-types.ts";

const pis = new Map<string, PiProcess>();
const starting = new Map<string, Promise<PiProcess>>();

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

function push<K extends keyof HostEvents>(channel: K, payload: HostEvents[K]): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
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
let sessionWatch: { projectDir: string; sessionFile: string; mtimeMs: number; stop: () => void } | null = null;

function markBusy(projectDir: string, until: number): void {
  busyUntil.set(projectDir, until);
}

function forwardEvent(projectDir: string, event: PiMessage): void {
  if (event["type"] === "agent_start") markBusy(projectDir, Number.POSITIVE_INFINITY);
  // `agent_end` closes one low-level run, not the turn: Pi may still be waiting
  // out an auto-retry delay, compacting, or holding a queued follow-up, and none
  // of those emit anything while they wait. `agent_settled` is the event Pi
  // documents as "nothing will start again on its own", so it is the only one
  // that hands the project back.
  else if (event["type"] === "agent_settled") markBusy(projectDir, Date.now() + SETTLE_GRACE_MS);
  // Any Pi message means Pi is alive and touching this project right now.
  else if (busyUntil.get(projectDir) !== Number.POSITIVE_INFINITY) {
    markBusy(projectDir, Date.now() + SETTLE_GRACE_MS);
  }
  push("piEvent", { projectDir, sessionFile: pis.get(projectDir)?.boundSessionFile, event });
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
 */
let quitConfirmed = false;

export function quitBlocked(): boolean {
  if (quitConfirmed) return false;
  const runs = [...pis.keys()].filter((projectDir) => busyUntil.get(projectDir) === Number.POSITIVE_INFINITY);
  const terminals = liveTerminalProjects();
  if (runs.length === 0 && terminals.length === 0) return false;
  push("quitRequested", { work: { runs, terminals } });
  return true;
}

function stopSessionWatch(): void {
  sessionWatch?.stop();
  sessionWatch = null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function ensurePi(projectDir: string): Promise<PiProcess> {
  const existing = pis.get(projectDir);
  if (existing) return Promise.resolve(existing);
  const inflight = starting.get(projectDir);
  if (inflight) return inflight;

  const startup = (async () => {
    status(projectDir, "starting", projectDir);
    const pi = new PiProcess(
      projectDir,
      (msg) => forwardEvent(projectDir, msg),
      (code) => {
        pis.delete(projectDir);
        // A Pi that dies mid-turn never reaches `agent_settled`, so drop the
        // marker with the process rather than leaving this project looking
        // permanently busy to the watcher.
        busyUntil.delete(projectDir);
        status(projectDir, "exited", `exit ${code ?? "?"}`);
      },
    );
    pis.set(projectDir, pi);
    try {
      const state = await pi.request<RpcSessionState>({ type: "get_state" });
      pi.boundSessionFile = state.sessionFile;
    } catch {
    }
    status(projectDir, "ready");
    starting.delete(projectDir);
    return pi;
  })();

  starting.set(projectDir, startup);
  return startup;
}

async function bindPi(projectDir: string, sessionFile: string): Promise<PiProcess> {
  const pi = await ensurePi(projectDir);
  // Everything reached through bindPi may write the session file (rename, fork,
  // clone, compact), so claim the write before it happens.
  markBusy(projectDir, Date.now() + SETTLE_GRACE_MS);
  if (pi.boundSessionFile !== sessionFile) {
    const res = await pi.request<{ cancelled: boolean }>({ type: "switch_session", sessionPath: sessionFile });
    if (res.cancelled) throw new Error("The session is busy. Try again once the current run finishes.");
    pi.boundSessionFile = sessionFile;
  }
  return pi;
}

async function rebound(pi: PiProcess): Promise<string | undefined> {
  const state = await pi.request<RpcSessionState>({ type: "get_state" });
  pi.boundSessionFile = state.sessionFile;
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
  for (const [projectDir, pi] of pis) {
    const live = liveSettingsFor(projectDir) ?? patch;
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
const gitMutationParamsSchema = z.object({
  projectDir: z.string().min(1),
  branch: z.string().min(1),
  create: z.boolean(),
});
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
const terminalIdParamsSchema = projectDirParamsSchema.extend({ terminalId: z.string().min(1) });
const terminalResizeParamsSchema = terminalIdParamsSchema.extend({
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
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
  readSession: async ({ sessionFile }) => ({ entries: await readSession(sessionFile) }),

  ensurePi: async ({ projectDir }) => {
    try {
      await ensurePi(projectDir);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  restartPi: async ({ projectDir }) => {
    const pi = pis.get(projectDir);
    pis.delete(projectDir);
    starting.delete(projectDir);
    if (pi) await pi.stop();
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
    const all = [...pis.values()];
    pis.clear();
    starting.clear();
    await Promise.all(all.map((pi) => pi.stop()));
    return { ok: true };
  },

  newChat: async ({ projectDir }) => {
    try {
      const pi = await ensurePi(projectDir);
      await pi.request({ type: "new_session" });
      const state = await pi.request<RpcSessionState>({ type: "get_state" });
      pi.boundSessionFile = state.sessionFile;
      return { ok: true, sessionFile: state.sessionFile };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  importSession: async ({ projectDir }) => {
    try {
      const options = {
        title: "Import chat",
        properties: ["openFile" as const],
        defaultPath: app.getPath("home"),
        filters: [{ name: "Pi session", extensions: ["jsonl"] }],
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
      const source = result.filePaths[0];
      if (result.canceled || !source) return { ok: false, canceled: true };

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
    markBusy(projectDir, Number.POSITIVE_INFINITY);
    try {
      const pi = await ensurePi(projectDir);
      if (sessionFile) {
        if (pi.boundSessionFile !== sessionFile) {
          await pi.request({ type: "switch_session", sessionPath: sessionFile });
          pi.boundSessionFile = sessionFile;
        }
      } else {
        await pi.request({ type: "new_session" });
        const state = await pi.request<RpcSessionState>({ type: "get_state" });
        pi.boundSessionFile = state.sessionFile;
        sessionFile = state.sessionFile ?? null;
      }
      pi.send({ type: "prompt", message, images, streamingBehavior });
      return { ok: true, sessionFile: sessionFile ?? undefined };
    } catch (err) {
      markBusy(projectDir, Date.now() + SETTLE_GRACE_MS);
      return { ok: false, error: errorMessage(err) };
    }
  },

  enqueue: ({ projectDir, behavior, message, images }) => {
    const pi = pis.get(projectDir);
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

  abort: ({ projectDir }) => {
    pis.get(projectDir)?.send({ type: "abort" });
    return { ok: true };
  },

  getModels: async ({ projectDir }) => {
    try {
      const pi = await ensurePi(projectDir);
      const data = await pi.request<{ models: unknown[] }>({ type: "get_available_models" });
      return { models: data.models.map(toModelInfo) };
    } catch (err) {
      return { models: [], error: errorMessage(err) };
    }
  },

  getState: async ({ projectDir }) => {
    try {
      const pi = await ensurePi(projectDir);
      const data = await pi.request<RpcSessionState>({ type: "get_state" });
      return { state: toSessionState(data) };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  },

  getThinkingLevels: async ({ projectDir }) => {
    try {
      const pi = await ensurePi(projectDir);
      const data = await pi.request<{ levels: unknown[] }>({ type: "get_available_thinking_levels" });
      return { levels: data.levels.filter(isThinkingLevel) };
    } catch (err) {
      return { levels: [], error: errorMessage(err) };
    }
  },

  setModel: async ({ projectDir, provider, modelId }) => {
    try {
      const pi = await ensurePi(projectDir);
      await pi.request({ type: "set_model", provider, modelId });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  setThinkingLevel: async ({ projectDir, level }) => {
    try {
      const pi = await ensurePi(projectDir);
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
      const pi = pis.get(projectDir);
      if (pi?.boundSessionFile === sessionFile) {
        await pi.request({ type: "new_session" });
        pi.boundSessionFile = (await pi.request<RpcSessionState>({ type: "get_state" })).sessionFile;
      }
      if (sessionWatch?.sessionFile === sessionFile) stopSessionWatch();
      await deleteSession(projectDir, sessionFile);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  watchSession: async ({ projectDir, sessionFile }) => {
    if (sessionWatch?.sessionFile === sessionFile && sessionWatch.projectDir === projectDir) return { ok: true };
    stopSessionWatch();
    if (!sessionFile) return { ok: true };

    const baseline = await sessionMtime(sessionFile);
    const entry = {
      projectDir,
      sessionFile,
      mtimeMs: baseline,
      stop: () => {},
    };
    entry.stop = watchSessionFile(sessionFile, (mtimeMs) => {
      if (sessionWatch !== entry || mtimeMs === entry.mtimeMs) return;
      entry.mtimeMs = mtimeMs;
      if (Date.now() < (busyUntil.get(projectDir) ?? 0)) return; // Our own Pi wrote it.
      push("sessionChangedExternally", { projectDir, sessionFile });
    });
    sessionWatch = entry;
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

  compact: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await bindPi(projectDir, sessionFile);
      await pi.request({ type: "compact" });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  abortRetry: ({ projectDir }) => {
    pis.get(projectDir)?.send({ type: "abort_retry" });
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

  login: async ({ providerId, type }) => {
    try {
      await auth.login(providerId, type, authPush);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },

  authRespond: ({ id, value, cancel }) => {
    auth.respondPrompt(id, { value, cancel });
    return { ok: true };
  },

  logout: async ({ providerId }) => {
    try {
      await auth.logout(providerId);
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
    mainWindow?.close();
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
      return { editors: [{ id: "explorer", name: "Explorer", icon: "explorer" }] };
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

  versions: () => ({ pi: auth.PI_VERSION_STRING, app: app.getVersion() }),

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

  terminalEnsure: (params) => {
    const { projectDir } = projectDirParamsSchema.parse(params);
    const existing = listTerminals(projectDir);
    if (existing.length > 0) return { terminals: existing };
    return {
      terminals: [
        createTerminal(
          projectDir,
          (payload) => push("terminalData", payload),
          (payload) => push("terminalExit", payload),
        ),
      ],
    };
  },
  terminalCreate: (params) => {
    const { projectDir } = projectDirParamsSchema.parse(params);
    return {
      terminal: createTerminal(
        projectDir,
        (payload) => push("terminalData", payload),
        (payload) => push("terminalExit", payload),
      ),
    };
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
  gitDiff: async ({ projectDir, file, untracked }) => ({ diff: await gitDiff(projectDir, file, untracked) }),
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
  loadGraphicalExtensions: async ({ projectDir }) => {
    try {
      return { extensions: await loadGraphicalExtensions(projectDir) };
    } catch {
      return { extensions: [] };
    }
  },
  extensionRespond: ({ projectDir, response }) => {
    pis.get(projectDir)?.sendRaw(response);
    return { ok: true };
  },
};

export function registerIpc(): void {
  for (const [name, handler] of Object.entries(handlers) as [HostRequestName, HandlerMap[HostRequestName]][]) {
    ipcMain.removeHandler(name);
    ipcMain.handle(name, (_event, params) => (handler as (p: unknown) => unknown)(params ?? {}));
  }
}

export async function stopAllPi(): Promise<void> {
  stopSessionWatch();
  stopAllTerminals();
  const all = [...pis.values()];
  pis.clear();
  starting.clear();
  await Promise.all(all.map((pi) => pi.stop()));
}
