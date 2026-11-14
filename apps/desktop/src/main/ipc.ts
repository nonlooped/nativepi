import type { ChatTitleCatalog } from "../shared/chat-title.ts";
import { serviceTierStateSchema } from "../shared/service-tier.ts";
import { readProjectDiffPreview } from "./diffPreview.ts";
import { app, BrowserWindow, dialog, shell } from "electron";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { thinkingLevelSchema } from "../shared/pi-values.ts";
import { requestParams, validateHostRequest } from "../shared/request-params.ts";
import { ClientLeases } from "./clientLeases.ts";
import { stopPackageOperations } from "./pi/services.ts";
import { ephemeralProjects, stopEphemeral } from "./pi/ephemeral.ts";
import { PiProcess } from "./pi/client.ts";
import type { PiMessage } from "./pi/protocol.ts";
import { deleteSession, listSessions, readSession, searchSessions, usageDashboard, watchProjectSessions, watchSessionFile } from "./sessions.ts";
import { drainState, loadState, saveState } from "./state.ts";
import * as auth from "./auth.ts";
import { gitAddWorktree, gitBranches, gitCheckout, gitCommit, gitCommitDetails, gitCommitDiff, gitDiff, gitHunks, gitLog, gitPrTarget, gitRevertFile, gitPush, gitPushAndCreatePr, gitStageAll, gitStagedDiff, gitStageFile, gitStageHunk, gitStatus, gitSync, gitUnstageAll, gitUnstageFile } from "./git.ts";
import { generateCommitMessage } from "./commitMessage.ts";
import { getRepoHostContext } from "./repoHost.ts";
import { installPackage, listPackages, removePackage, updatePackage } from "./packages.ts";
import { listSkills } from "./skills.ts";
import { readProjectDirectory, watchProjectDirectory } from "./fileExplorer.ts";
import { listProjectFiles } from "./files.ts";
import { prepareImages, readProjectImage, readProjectMedia } from "./images.ts";
import { loadGraphicalExtensions } from "./extensions.ts";
import { fileManagerName, listInstalledEditors, openFileIn, openProjectIn } from "./editors.ts";
import { liveSettingsFor, piPaths, queuePiSettings, readPiSettings, writePiSettings } from "./piSettings.ts";
import { piSettingsPatchSchema, type PiSettingsPatch } from "../shared/pi-settings.ts";
import { attachTerminal, clearTerminal, closeTerminal, closeProjectTerminals, createTerminal, detachTerminal, listShellProfiles, listTerminals, liveTerminalProjects, renameTerminal, terminalDiagnostics, resizeTerminal, restartTerminal, stopAllTerminals, writeTerminal, } from "./terminal.ts";
import { extensionCallParamsSchema, updateChannelSchema, type AccessStatus, type HostEvents, type HostRequestName, type HostRequests, type PiStatus } from "../shared/rpc-schema.ts";
import type { CommandInfo, ForkPoint, ModelInfo, RpcSessionState, SessionTreeNode, ThinkingLevel } from "../shared/pi-types.ts";
import { tuiClientFrameSchema, tuiCompletionEditSchema, tuiCompletionsSchema, type TuiHostFrame } from "../shared/tui-frames.ts";
import { localServerConnection, localServerStatus, startLocalServer, stopLocalServer } from "./localServer.ts";
import { setSleepBlocked } from "./powerSaveGuard.ts";
import { remoteAccessRunning, remoteAccessStatus, startRemoteAccess, stopRemoteAccess, } from "./remoteAccess.ts";
import { checkForUpdate, setUpdateChannel, installUpdate, startUpdates, updateState } from "./updates.ts";
import { createDiagnosticsReport, recordRendererCrash } from "./diagnostics.ts";
/** One Pi process per session: Pi already permits concurrent sessions in a project. */
const pis = new Map<string, PiProcess>();
// Pi gives even an unsent chat a session file, but the renderer deliberately
// keeps it invisible until its first prompt. Keep that process distinct from
// the project's opened chats so pre-send controls configure the right chat.
const draftRuntimes = new WeakSet<PiProcess>();
const draftPis = new Map<string, PiProcess>();
const starting = new Map<string, Promise<PiProcess>>();
const startingPis = new Map<string, PiProcess>();
let shuttingDown = false;
let runtimeGeneration = 0;
const restartingProjects = new Set<string>();
const retiringSessions = new Set<string>();
const retirementTasks = new Map<string, Promise<void>>();
let restartingAll = false;
const runtimeIds = new WeakMap<PiProcess, string>();
const runtimeEvents = new WeakMap<PiProcess, number>();
const retainedSurfaces = new WeakMap<PiProcess, Set<string>>();
const extensionActivity = new WeakMap<PiProcess, Set<string>>();
let runtimeSequence = 0;
let eventSequence = 0;
const revisions = new Map<string, { value: string }>();
type RuntimeBinding = { file: string | undefined; generation: number; ready: Promise<void>; writes: number; observation: number };
const runtimeBindings = new WeakMap<PiProcess, RuntimeBinding>();
const conflicts = new Set<string>();
const outstanding = new Map<string, number>();
const authRoutes = new Map<string, {
  pi: PiProcess;
  id: string;
  flowId?: string;
}>();
let authSequence = 0;
const activeAuthFlows = new Set<string>();
async function revision(file: string): Promise<string> {
  try {
    const value = await stat(file);
    return `${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return "missing";
    throw error;
  }
}
function ownsBinding(pi: PiProcess, binding: RuntimeBinding): boolean {
  return pi.isAvailable && runtimeBindings.get(pi) === binding && binding.generation === runtimeGeneration
    && (!binding.file || pis.get(binding.file) === pi);
}
function sessionWriteCount(file: string): number {
  const pi = pis.get(file);
  const binding = pi && runtimeBindings.get(pi);
  return pi && binding?.file === file && ownsBinding(pi, binding) ? binding.writes : 0;
}
class CoherencePendingError extends Error {
  constructor() { super("This chat is changing. Try again."); }
}
async function assertCoherent(file: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const owner = pis.get(file);
    const binding = owner && runtimeBindings.get(owner);
    await binding?.ready;
    const baseline = revisions.get(file);
    const current = await revision(file);
    // Even an equal-valued acknowledgment advances the observation boundary.
    // Never compare a read from one side of that boundary to the other side.
    if (pis.get(file) !== owner || (owner && runtimeBindings.get(owner) !== binding) || revisions.get(file) !== baseline)
      continue;
    if (conflicts.has(file) || (owner && baseline === undefined) || (baseline !== undefined && baseline.value !== current && !owner?.isRunning && !sessionWriteCount(file))) {
      conflicts.add(file);
      throw new Error("This chat changed outside NativePi. Reload it before making changes.");
    }
    return;
  }
  throw new CoherencePendingError();
}
async function acknowledgeRevision(pi: PiProcess, binding: RuntimeBinding): Promise<void> {
  if (!binding.file || !ownsBinding(pi, binding))
    return;
  const observation = ++binding.observation;
  await binding.ready;
  if (!ownsBinding(pi, binding))
    return;
  const current = await revision(binding.file);
  // A newer acknowledgment owns publication, including when its stat fails.
  // Falling back to an older read could bless a state captured before its write.
  if (ownsBinding(pi, binding) && binding.observation === observation)
    revisions.set(binding.file, { value: current });
}
function beginSessionWrite(pi: PiProcess, binding: RuntimeBinding): () => Promise<void> {
  binding.writes++;
  return async () => {
    try {
      if (!pi.isRunning)
        await acknowledgeRevision(pi, binding);
    }
    finally {
      binding.writes--;
    }
  };
}
let mainWindow: BrowserWindow | null = null;
type HostEventListener = <K extends keyof HostEvents>(channel: K, payload: HostEvents[K]) => void;
const hostEventListeners = new Set<HostEventListener>();
export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}
function pushDesktop<K extends keyof HostEvents>(channel: K, payload: HostEvents[K]): void {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send(channel, payload);
}
function push<K extends keyof HostEvents>(channel: K, payload: HostEvents[K]): void {
  pushDesktop(channel, payload);
  for (const listener of hostEventListeners) {
    try {
      listener(channel, payload);
    }
    catch (error) {
      console.error("Host event listener failed", error);
    }
  }
}
export function subscribeHostEvents(listener: HostEventListener): () => void {
  hostEventListeners.add(listener);
  return () => hostEventListeners.delete(listener);
}
function status(projectDir: string, status: PiStatus, detail?: string): void {
  push("piStatus", { projectDir, status, detail });
}
/** Idle reclamation grace is independent of run and session coherence. */
const idleAfter = new Map<string, number>();
const SETTLE_GRACE_MS = 3000;
let idleReclaimTimer: ReturnType<typeof setInterval> | undefined;
const idleRetirements = new Map<string, Promise<void>>();
function startIdleReclamation(): void {
  idleReclaimTimer ??= setInterval(() => {
    void stopIdlePis().catch(error => console.error("Could not reclaim idle Pi", error));
  }, 30_000);
  idleReclaimTimer.unref();
}
type SessionWatch = {
  observedRevision?: string;
  stop: () => void;
};
const sessionWatches = new Map<string, SessionWatch>();
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
type ExplorerWatch = {
  stop: () => void;
};
const explorerWatches = new Map<string, Map<string, ExplorerWatch>>();
function setExplorerWatches(projectDir: string, paths: string[]): void {
  const current = explorerWatches.get(projectDir) ?? new Map<string, ExplorerWatch>();
  explorerWatches.set(projectDir, current);
  const wanted = new Set(paths);
  for (const [dir, watch] of current) {
    if (wanted.has(dir))
      continue;
    watch.stop();
    current.delete(dir);
  }
  for (const dir of wanted) {
    if (current.has(dir))
      continue;
    // `release` is what `stop()` currently means: recording the cancellation
    // until the watcher exists, and closing it afterwards.
    let stopped = false;
    let release = () => {
      stopped = true;
    };
    const entry: ExplorerWatch = { stop: () => release() };
    current.set(dir, entry);
    void watchProjectDirectory(projectDir, dir, () => {
      if (explorerWatches.get(projectDir)?.get(dir) === entry)
        push("projectFilesChanged", { projectDir, path: dir });
    }).then((stop) => {
      if (stopped)
        stop();
      else
        release = stop;
    }, () => { });
  }
  if (current.size === 0)
    explorerWatches.delete(projectDir);
}
function stopExplorerWatches(projectDir: string): void {
  for (const watch of explorerWatches.get(projectDir)?.values() ?? [])
    watch.stop();
  explorerWatches.delete(projectDir);
}
function stopProjectSessionWatch(projectDir: string): void {
  projectSessionWatches.get(projectDir)?.();
  projectSessionWatches.delete(projectDir);
}
function projectHasActiveRun(projectDir: string): boolean {
  return [...new Set([...pis.values(), ...draftPis.values(), ...startingPis.values()])]
    .some(pi => pi.projectDir === projectDir && (pi.isRunning || Boolean(pi.boundSessionFile && sessionWriteCount(pi.boundSessionFile)) || startingPis.has(pi.boundSessionFile ?? `new:${projectDir}`)))
    || [...outstanding].some(([key, count]) => key === projectDir && count > 0);
}
/** Session path the window should match this process against. */
function clientSessionFile(projectDir: string, pi: PiProcess) {
  // A blank chat's draft Pi already has a hidden session file on disk, but the
  // renderer still treats that view as `activeSessionFile: null`. Tagging the
  // bound path would make every frame look like another chat's.
  return draftRuntimes.has(pi) ? undefined : pi.boundSessionFile;
}
const eventBatches = new Map<PiProcess, {
  projectDir: string;
  events: PiMessage[];
  timer: ReturnType<typeof setTimeout>;
}>();
function flushEventBatch(pi: PiProcess): void {
  const batch = eventBatches.get(pi);
  if (!batch)
    return;
  clearTimeout(batch.timer);
  eventBatches.delete(pi);
  push("piEvent", {
    projectDir: batch.projectDir,
    sessionFile: clientSessionFile(batch.projectDir, pi),
    sequence: ++eventSequence, runtimeId: runtimeIds.get(pi),
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
    // Rich Markdown parsing is substantially more expensive than forwarding a
    // token. Two-frame batches keep the stream feeling live without asking the
    // renderer to rebuild highlighted Markdown up to sixty times per second.
    timer: setTimeout(() => flushEventBatch(pi), 32),
  });
}
function forwardEvent(projectDir: string, pi: PiProcess, event: PiMessage): void {
  runtimeEvents.set(pi, (runtimeEvents.get(pi) ?? 0) + 1);
  const sessionFile = pi.boundSessionFile ?? projectDir;
  idleAfter.set(sessionFile, Date.now() + SETTLE_GRACE_MS);
  if (event.type === "extension_ui_request") {
    const activity = extensionActivity.get(pi) ?? new Set<string>();
    extensionActivity.set(pi, activity);
    // A status/widget can represent extension work beyond agent_settled (for
    // example asynchronous subagents). Be conservative about disposing it.
    if (event.method === "setStatus" || event.method === "setWidget") {
      const key = `${event.method}:${event.statusKey ?? event.widgetKey}`;
      if (event.statusText !== undefined || event.widgetLines !== undefined) activity.add(key);
      else activity.delete(key);
    } else if (["select", "confirm", "input", "editor"].includes(String(event.method))) {
      activity.add(`prompt:${event.id}`);
    }
  }
  if (event["type"] === "agent_settled") {
    for (const key of extensionActivity.get(pi) ?? []) {
      if (key.startsWith("prompt:")) extensionActivity.get(pi)?.delete(key);
    }
    const binding = runtimeBindings.get(pi);
    if (binding)
      void beginSessionWrite(pi, binding)().catch(error => console.error("Could not observe settled session", error));
    // Live message/name events already update every client's sidebar. Re-reading
    // all of this project's history after each turn scales with its lifetime.
  }
  if (event["type"] === "message_update") {
    queueDisplayDelta(projectDir, pi, event);
    return;
  }
  flushEventBatch(pi);
  push("piEvent", { projectDir, sessionFile: clientSessionFile(projectDir, pi), sequence: ++eventSequence, runtimeId: runtimeIds.get(pi), event });
}
/** Ask before closing active work or disconnecting other viewers. */
let quitConfirmed = false;
export function quitBlocked(): boolean {
  if (quitConfirmed)
    return false;
  const livePis = [...new Set([...pis.values(), ...draftPis.values(), ...startingPis.values()])];
  const runs = livePis
    .filter((pi) => pi.isRunning || Boolean(pi.boundSessionFile && sessionWriteCount(pi.boundSessionFile)) || (outstanding.get(pi.projectDir) ?? 0) > 0)
    .map((pi) => pi.projectDir).concat(ephemeralProjects());
  const terminals = liveTerminalProjects();
  const viewers = localServerStatus().clients.length;
  if (runs.length === 0 && terminals.length === 0 && viewers === 0)
    return false;
  pushDesktop("quitRequested", { work: { runs, terminals, viewers } });
  return true;
}
function stopSessionWatch(sessionFile: string): void {
  const watch = sessionWatches.get(sessionFile);
  watch?.stop();
  sessionWatches.delete(sessionFile);
}
function sessionWatchWanted(file: string): boolean {
  return !shuttingDown && (pis.has(file) || [...clients].some(client => [...client.sessions.values()].includes(file)));
}
async function reconcileSessionWatch(projectDir: string, sessionFile: string): Promise<void> {
  if (!sessionWatchWanted(sessionFile)) {
    stopSessionWatch(sessionFile);
    return;
  }
  if (sessionWatches.has(sessionFile))
    return;
  const entry: SessionWatch = { stop: () => { } };
  sessionWatches.set(sessionFile, entry);
  try {
    entry.observedRevision = await revision(sessionFile);
  }
  catch (error) {
    if (sessionWatches.get(sessionFile) === entry)
      sessionWatches.delete(sessionFile);
    throw error;
  }
  if (sessionWatches.get(sessionFile) !== entry)
    return;
  const check = async () => {
    const current = await revision(sessionFile);
    if (sessionWatches.get(sessionFile) !== entry)
      return;
    const changed = current !== entry.observedRevision;
    entry.observedRevision = current;
    const pi = pis.get(sessionFile);
    if (pi?.isRunning || sessionWriteCount(sessionFile) || retiringSessions.has(sessionFile))
      return;
    if (pi) {
      try {
        await assertCoherent(sessionFile);
      }
      catch (error) {
        if (!(error instanceof CoherencePendingError) && sessionWatches.get(sessionFile) === entry)
          push("sessionChangedExternally", { projectDir, sessionFile });
      }
    }
    else if (changed)
      push("sessionChangedExternally", { projectDir, sessionFile });
  };
  entry.stop = watchSessionFile(sessionFile, () => void check().catch(() => {
    if (sessionWatches.get(sessionFile) === entry)
      push("sessionChangedExternally", { projectDir, sessionFile });
  }));
  await check();
}
function stopAllSessionWatches(): void {
  for (const watch of sessionWatches.values()) {
    watch.stop();
  }
  sessionWatches.clear();
}
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
async function acceptChatTitle(projectDir: string, pi: PiProcess, sessionFile: string, title: string): Promise<void> {
  const binding = runtimeBindings.get(pi);
  if (!binding || binding.file !== sessionFile || !pi.isAvailable) return;
  await binding.ready;
  await assertCoherent(sessionFile);
  if (!ownsBinding(pi, binding)) return;
  const finish = beginSessionWrite(pi, binding);
  try {
    await pi.frameRequest<boolean>(requestId => ({ type: "nativepi_tui_accept_title", requestId, sessionFile, title }));
    // Pi emits session_info_changed when the proposed name is accepted.
  } finally { await finish(); }
}
function forwardPiFrame(projectDir: string, pi: PiProcess, frame: TuiHostFrame): void {
  if (frame.type === "nativepi_tui_prompt_suggestion") flushEventBatch(pi);
  if (frame.type === "nativepi_tui_propose_title") {
    void acceptChatTitle(projectDir, pi, frame.sessionFile, frame.title).catch(error => console.error("Could not name chat", error));
    return;
  }
  const surfaces = retainedSurfaces.get(pi) ?? new Set<string>();
  retainedSurfaces.set(pi, surfaces);
  // Historical timeline entries can be replayed. Live extension components
  // may own background work, even when the parent agent turn has settled.
  if (frame.type === "nativepi_tui_open" && frame.surface.placement !== "timeline")
    surfaces.add(frame.surface.id);
  if (frame.type === "nativepi_tui_close")
    surfaces.delete(frame.surfaceId);
  if (frame.type === "nativepi_tui_reset") {
    surfaces.clear();
    extensionActivity.delete(pi);
  }
  if (frame.type === "nativepi_tui_session") {
    if (!pi.isAvailable)
      return;
    void rememberPi(pi, frame.sessionFile).catch(error => console.error("Could not observe replacement session", error));
    return;
  }
  if ((frame.type === "nativepi_tui_auth_prompt" || frame.type === "nativepi_tui_auth_notice") && frame.flowId && !activeAuthFlows.has(frame.flowId))
    return;
  if (frame.type === "nativepi_tui_auth_prompt") {
    const id = `runtime-auth-${++authSequence}`;
    authRoutes.set(id, { pi, id: frame.id, flowId: frame.flowId });
    push("authPrompt", { projectDir, sessionFile: clientSessionFile(projectDir, pi), flowId: frame.flowId, runtimeId: runtimeIds.get(pi), id, prompt: frame.prompt });
    return;
  }
  if (frame.type === "nativepi_tui_auth_notice") {
    push("authNotice", { projectDir, sessionFile: clientSessionFile(projectDir, pi), runtimeId: runtimeIds.get(pi), flowId: frame.flowId, notice: frame.notice });
    if (frame.notice.kind === "auth_url")
      void shell.openExternal(frame.notice.url);
    return;
  }
  push("tuiFrame", { projectDir, runtimeId: runtimeIds.get(pi), sessionFile: clientSessionFile(projectDir, pi), frame });
}
function rememberPi(pi: PiProcess, sessionFile: string | undefined): Promise<void> {
  const current = runtimeBindings.get(pi);
  if (!pi.isAvailable || shuttingDown || restartingAll || restartingProjects.has(pi.projectDir)
    || (current && current.generation !== runtimeGeneration))
    return Promise.reject(new Error("Pi session replacement was cancelled"));
  if (current && current.file === sessionFile)
    return current.ready;
  const previous = current ? current.file : pi.boundSessionFile;
  const ownedPrevious = previous && pis.get(previous) === pi;
  if (ownedPrevious)
    pis.delete(previous);
  pi.boundSessionFile = sessionFile;
  if (sessionFile)
    pis.set(sessionFile, pi);
  if (ownedPrevious && previous !== sessionFile) {
    revisions.delete(previous);
    void reconcileSessionWatch(pi.projectDir, previous).catch(error => console.error("Could not watch session", error));
  }
  const binding: RuntimeBinding = { file: sessionFile, generation: runtimeGeneration, ready: Promise.resolve(), writes: 0, observation: 0 };
  runtimeBindings.set(pi, binding);
  binding.ready = (async () => {
    const observed = sessionFile ? await revision(sessionFile) : undefined;
    if (!pi.isAvailable || runtimeBindings.get(pi) !== binding || binding.generation !== runtimeGeneration
      || (sessionFile && pis.get(sessionFile) !== pi))
      throw new Error("Pi session replacement was cancelled");
    if (sessionFile && observed !== undefined)
      revisions.set(sessionFile, { value: observed });
  })();
  return binding.ready.then(() => sessionFile ? reconcileSessionWatch(pi.projectDir, sessionFile) : undefined);
}
async function stopIdlePis(keep?: PiProcess): Promise<void> {
  const now = Date.now();
  const idle = [...pis.entries()].filter(([sessionFile, pi]) => pi !== keep
    && pi.isAvailable
    && !shuttingDown
    && ![...clients].some(client => client.activeProject === pi.projectDir
      && (draftRuntimes.has(pi) ? !client.sessions.has(pi.projectDir) : client.sessions.get(pi.projectDir) === sessionFile))
    && ![...startingPis.values()].includes(pi)
    && !retiringSessions.has(sessionFile)
    && !pi.isRunning
    && !pi.hasPendingRequests
    && !retainedSurfaces.get(pi)?.size
    && !extensionActivity.get(pi)?.size
    && !sessionWriteCount(sessionFile)
    && (outstanding.get(pi.projectDir) ?? 0) <= (keep?.projectDir === pi.projectDir ? 1 : 0)
    && now >= (idleAfter.get(sessionFile) ?? 0));
  for (const [sessionFile, pi] of idle) {
    retiringSessions.add(sessionFile);
    if (pis.get(sessionFile) === pi) {
      pis.delete(sessionFile);
      revisions.delete(sessionFile);
    }
    if (draftPis.get(pi.projectDir) === pi) draftPis.delete(pi.projectDir);
  }
  await Promise.all(idle.map(([file, pi]) => {
    const key = draftRuntimes.has(pi) ? `new:${pi.projectDir}` : file;
    const stopping = pi.stop().finally(() => {
      retiringSessions.delete(file);
      idleRetirements.delete(key);
    });
    idleRetirements.set(key, stopping);
    return stopping;
  }));
}
function projectPi(projectDir: string, sessionFile?: string | null): PiProcess | undefined {
  if (sessionFile) {
    const pi = pis.get(sessionFile);
    return pi?.projectDir === projectDir ? pi : undefined;
  }
  return draftPis.get(projectDir) ?? startingPis.get(`new:${projectDir}`);
}
function ensurePi(projectDir: string, sessionFile?: string): Promise<PiProcess> {
  const retiring = idleRetirements.get(sessionFile ?? `new:${projectDir}`);
  if (retiring) return retiring.then(() => ensurePi(projectDir, sessionFile));
  if (shuttingDown || restartingAll || restartingProjects.has(projectDir) || (sessionFile && retiringSessions.has(sessionFile)))
    return Promise.reject(new Error("Pi is stopping. Try again after restart."));
  startIdleReclamation();
  const generation = runtimeGeneration;
  const existing = sessionFile ? projectPi(projectDir, sessionFile) : draftPis.get(projectDir);
  if (existing)
    return (runtimeBindings.get(existing)?.ready ?? Promise.resolve()).then(() => existing);
  const key = sessionFile ?? `new:${projectDir}`;
  const inflight = starting.get(key);
  if (inflight)
    return inflight;
  const startup = (async () => {
    status(projectDir, "starting", projectDir);
    let pi!: PiProcess;
    let startupFailureReported = false;
    const chatMode = resolve(projectDir) === resolve(join(app.getPath("userData"), "conversations"));
    const chatArgs = chatMode ? ["--nativepi-chat", "--no-extensions", "--no-context-files", "--no-skills", "--no-prompt-templates", ...(await loadState()).chatExtensions.flatMap(path => ["-e", path])] : [];
    pi = new PiProcess(projectDir, (msg) => forwardEvent(projectDir, pi, msg), (code, processError, expected) => {
      // Panes belong to the process that drew them: a Pi that dies takes its
      // surfaces with it, and the window has to be told or they stay on screen
      // with nothing behind them.
      flushEventBatch(pi);
      for (const [id, route] of authRoutes)
        if (route.pi === pi)
          authRoutes.delete(id);
      push("tuiFrame", { projectDir, runtimeId: runtimeIds.get(pi), sessionFile: clientSessionFile(projectDir, pi), frame: { type: "nativepi_tui_reset" } });
      const ownedSession = pi.boundSessionFile && pis.get(pi.boundSessionFile) === pi;
      if (ownedSession)
        pis.delete(pi.boundSessionFile!);
      if (draftPis.get(projectDir) === pi)
        draftPis.delete(projectDir);
      if (pi.boundSessionFile) {
        if (ownedSession)
          revisions.delete(pi.boundSessionFile);
        void reconcileSessionWatch(projectDir, pi.boundSessionFile).catch(error => console.error("Could not watch session", error));
      }
      if (startingPis.get(key) === pi)
        startingPis.delete(key);
      // A Pi that dies mid-turn never reaches `agent_settled`, so drop the
      // marker with the process rather than leaving this project looking
      // permanently busy to the watcher.
      if (pi.boundSessionFile)
        idleAfter.delete(pi.boundSessionFile);
      idleAfter.delete(projectDir);
      if (!expected && !startupFailureReported) {
        startupFailureReported = true;
        push("piError", {
          runtimeId: runtimeIds.get(pi), projectDir,
          sessionFile: clientSessionFile(projectDir, pi),
          message: processError?.message ?? `Pi exited (${code ?? "?"})`,
        });
      }
      if (![...pis.values(), ...draftPis.values(), ...startingPis.values()].some((other) => other.projectDir === projectDir)) {
        status(projectDir, "exited", `exit ${code ?? "?"}`);
      }
    }, (frame) => forwardPiFrame(projectDir, pi, frame), [
      ...chatArgs,
      ...(sessionFile ? ["--session", sessionFile] : []),
    ]);
    if (!sessionFile)
      draftRuntimes.add(pi);
    runtimeIds.set(pi, String(++runtimeSequence));
    startingPis.set(key, pi);
    try {
      let readinessTimer: ReturnType<typeof setTimeout> | undefined;
      const state = await Promise.race([
        pi.request<RpcSessionState>({ type: "get_state" }),
        new Promise<never>((_, reject) => { readinessTimer = setTimeout(() => reject(new Error("Pi did not become ready in time")), 30000); }),
      ]).finally(() => clearTimeout(readinessTimer));
      if (shuttingDown || restartingAll || restartingProjects.has(projectDir) || (sessionFile && retiringSessions.has(sessionFile)) || generation !== runtimeGeneration)
        throw new Error("Pi startup was cancelled");
      if (sessionFile && state.sessionFile !== sessionFile) {
        const switched = await pi.request<{
          cancelled: boolean;
        }>({ type: "switch_session", sessionPath: sessionFile });
        if (switched.cancelled)
          throw new Error("Session switch was cancelled");
        await rememberPi(pi, sessionFile);
      }
      else {
        await rememberPi(pi, state.sessionFile);
      }
      if (!sessionFile)
        draftPis.set(projectDir, pi);
      if (!pi.isAvailable || shuttingDown || restartingAll || restartingProjects.has(projectDir))
        throw new Error("Pi startup was cancelled");
      const preferences = (await loadState()).preferences;
      pi.sendFrame({ type: "nativepi_tui_prompt_suggestions", enabled: preferences.promptSuggestions });
      pi.sendFrame({ type: "nativepi_tui_chat_title_settings", settings: preferences.chatTitle });
      status(projectDir, "ready");
      return pi;
    }
    catch (error) {
      const message = errorMessage(error);
      if (!startupFailureReported) {
        startupFailureReported = true;
        push("piError", { runtimeId: runtimeIds.get(pi), projectDir, sessionFile, message });
      }
      await pi.stop();
      status(projectDir, "error", message);
      throw error;
    }
    finally {
      if (startingPis.get(key) === pi)
        startingPis.delete(key);
    }
  })();
  starting.set(key, startup);
  void startup.then(() => {
    if (starting.get(key) === startup)
      starting.delete(key);
  }, () => {
    if (starting.get(key) === startup)
      starting.delete(key);
  });
  return startup;
}
async function rebound(pi: PiProcess): Promise<string | undefined> {
  const state = await pi.request<RpcSessionState>({ type: "get_state" });
  await rememberPi(pi, state.sessionFile);
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
/**
* The extension UI channel, at the window boundary.
*
* These carry keystrokes and draft text into a component running in the Pi
* process, and the caret positions a third-party provider is about to be handed.
* The frame schema already bounds the shapes; this is the same check applied to
* what the window sends, so main is not the one place trusting either side.
*/
const searchControllers = new Map<string, AbortController>();
/** `path` may be empty: that is how the explorer asks for the project root. */
/** Capped because it is a watcher each: an explorer with 500 folders open is already past useful. */
async function knownProject(projectDir: string): Promise<boolean> {
  const project = resolve(projectDir);
  return (await loadState()).projects.some((entry) => resolve(entry.path) === project);
}
function isThinkingLevel(level: unknown): level is ThinkingLevel {
  return thinkingLevelSchema.safeParse(level).success;
}
type HandlerMap = {
  [K in HostRequestName]: (params: HostRequests[K]["params"], pi?: PiProcess) => Promise<HostRequests[K]["response"]> | HostRequests[K]["response"];
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
  workWorkspace: async () => { const path = join(app.getPath("userData"), "work"); await mkdir(path, { recursive: true }); return { path }; },
  chatWorkspace: async () => { const path = join(app.getPath("userData"), "conversations"); await mkdir(path, { recursive: true }); return { path }; },
  loadState: () => loadState(),
  saveState: async ({ state }) => {
    await saveState(state);
    for (const pi of new Set([...pis.values(), ...draftPis.values(), ...startingPis.values()])) {
      if (pi.isAvailable) {
        pi.sendFrame({ type: "nativepi_tui_prompt_suggestions", enabled: state.preferences.promptSuggestions });
        pi.sendFrame({ type: "nativepi_tui_chat_title_settings", settings: state.preferences.chatTitle });
      }
    }
    return { ok: true };
  },
  listSessions: async ({ projectDir }) => ({ sessions: await listSessions(projectDir) }),
  searchSessions: async (params) => {
    const { requestId, projectDirs, query } = requestParams.searchSessions.parse(params);
    searchControllers.get(requestId)?.abort();
    const controller = new AbortController();
    searchControllers.set(requestId, controller);
    try {
      return { results: await searchSessions(projectDirs, query, controller.signal) };
    }
    finally {
      if (searchControllers.get(requestId) === controller)
        searchControllers.delete(requestId);
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
        if (sessionFile && (pis.get(sessionFile)?.isRunning || sessionWriteCount(sessionFile) || retiringSessions.has(sessionFile)))
          return;
        // Filesystem events can arrive after our write acknowledgment. Only an
        // outside revision (or a cold file) needs full sidebar reconciliation.
        void (async () => {
          const current = sessionFile ? await revision(sessionFile) : undefined;
          if (sessionFile && pis.has(sessionFile) && !conflicts.has(sessionFile)
            && revisions.get(sessionFile)?.value === current) return;
          notifySessionsChanged(projectDir);
        })().catch(() => notifySessionsChanged(projectDir));
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
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      // Disposal hooks may take seconds. They must not delay the newly opened
      // chat; reacquiring a retiring host already waits for its own shutdown.
      void stopIdlePis(pi).catch(error => console.error("Could not reclaim idle Pi", error));
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  restartPi: async ({ projectDir }) => {
    await retireRuntimes(projectDir);
    return { ok: true };
  },
  restartAllPi: async () => { await retireRuntimes(); return { ok: true }; },
  reloadSession: async ({ projectDir, sessionFile }) => {
    let claimed = false;
    try {
      if (retiringSessions.has(sessionFile))
        throw new Error("This chat is already stopping.");
      const pi = projectPi(projectDir, sessionFile);
      if (pi?.isRunning || sessionWriteCount(sessionFile) || starting.has(sessionFile))
        throw new Error("Stop this chat before reloading it.");
      retiringSessions.add(sessionFile);
      claimed = true;
      if (pi) {
        pis.delete(sessionFile);
        await pi.stop();
      }
      await reconcileSessionWatch(projectDir, sessionFile);
      conflicts.delete(sessionFile);
      revisions.delete(sessionFile);
      return { ok: true };
    }
    catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
    finally {
      if (claimed)
        retiringSessions.delete(sessionFile);
    }
  },
  readSessionSnapshot: async ({ sessionFile }) => {
    let entries: Awaited<ReturnType<typeof readSession>> = [];
    let eventWatermark = eventSequence;
    for (let attempt = 0; attempt < 3; attempt++) {
      const pi = pis.get(sessionFile);
      if (pi)
        flushEventBatch(pi);
      const sequence = pi ? runtimeEvents.get(pi) : undefined;
      const before = await revision(sessionFile);
      entries = await readSession(sessionFile);
      const after = await revision(sessionFile);
      if (pi)
        flushEventBatch(pi);
      eventWatermark = eventSequence;
      if (pis.get(sessionFile) === pi && !pi?.isRunning && !sessionWriteCount(sessionFile) && !starting.has(sessionFile) && !retiringSessions.has(sessionFile)
        && before === after && (!pi || runtimeEvents.get(pi) === sequence)) {
        return { entries, eventWatermark, runtimeId: pi ? runtimeIds.get(pi) : undefined, consistency: "stable" as const, revision: after };
      }
    }
    return { entries, eventWatermark, runtimeId: pis.get(sessionFile) ? runtimeIds.get(pis.get(sessionFile)!) : undefined, consistency: "retry" as const };
  },
  importSession: async ({ projectDir, sourceFile }) => {
    try {
      const source = sourceFile ?? (await pickSessionFile());
      if (!source)
        return { ok: false, canceled: true };
      const manager = SessionManager.forkFrom(source, projectDir);
      return { ok: true, sessionFile: manager.getSessionFile() };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  submit: async ({ projectDir, sessionFile, message, images, model, thinkingLevel, streamingBehavior }, runtime) => {
    try {
      const pi = runtime!;
      if (!sessionFile) {
        // `ensurePi` created this draft session for its pre-send controls.
        // Starting another session here would discard those choices.
        sessionFile = pi.boundSessionFile ?? (await pi.request<RpcSessionState>({ type: "get_state" })).sessionFile ?? null;
        if (sessionFile)
          await rememberPi(pi, sessionFile);
        if (draftPis.get(projectDir) === pi)
          draftPis.delete(projectDir);
        draftRuntimes.delete(pi);
      }
      // The controls update optimistically. Apply their exact values here too,
      // so an immediate send cannot race the earlier requests or let a newly
      // started Pi process fall back to its defaults for this turn.
      if (model)
        await pi.request({ type: "set_model", provider: model.provider, modelId: model.id });
      if (thinkingLevel)
        await pi.request({ type: "set_thinking_level", level: thinkingLevel });
      await pi.request({ type: "prompt", message, images, streamingBehavior });
      if (sessionFile)
        idleAfter.delete(projectDir);
      return { ok: true, sessionFile: sessionFile ?? undefined };
    }
    catch (err) {
      if (sessionFile)
        idleAfter.delete(projectDir);
      return { ok: false, error: errorMessage(err) };
    }
  },
  enqueue: async ({ behavior, message, images }, pi) => {
    if (!pi)
      return { ok: false, error: "Pi is not running" };
    try {
      await pi.request({ type: behavior === "steer" ? "steer" : "follow_up", message, images });
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  prepareImages: async (params) => {
    try {
      const { files } = requestParams.prepareImages.parse(params);
      return await prepareImages(files);
    }
    catch {
      return { images: [], rejected: [] };
    }
  },
  abort: ({ projectDir, sessionFile }) => {
    projectPi(projectDir, sessionFile)?.send({ type: "abort" });
    return { ok: true };
  },
  getChatTitleModels: async ({ projectDir, sessionFile }) => {
    try {
      if (!projectDir) return await auth.listChatTitleModels();
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      return await pi.frameRequest<ChatTitleCatalog>(requestId => ({ type: "nativepi_tui_get_chat_title_models", requestId }));
    } catch (error) { return { models: [], error: errorMessage(error) }; }
  },
  getModels: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      const data = await pi.request<{
        models: unknown[];
      }>({ type: "get_available_models" });
      return { models: data.models.map(toModelInfo) };
    }
    catch (err) {
      return { models: [], error: errorMessage(err) };
    }
  },
  getSessionProviders: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      return { providers: await pi.getProviders() };
    }
    catch (err) {
      return { providers: [], error: errorMessage(err) };
    }
  },
  getState: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      const data = await pi.request<RpcSessionState>({ type: "get_state" });
      return { state: toSessionState(data) };
    }
    catch (err) {
      return { error: errorMessage(err) };
    }
  },
  getServiceTier: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      const state = serviceTierStateSchema.parse(await pi.frameRequest(requestId => ({ type: "nativepi_tui_get_service_tier", requestId })));
      return { state };
    } catch (error) { return { error: errorMessage(error) }; }
  },
  setServiceTier: async ({ tier, provider, modelId }, runtime) => {
    try {
      const state = serviceTierStateSchema.parse(await runtime!.frameRequest(requestId => ({ type: "nativepi_tui_set_service_tier", requestId, tier, provider, modelId, sessionFile: runtime!.boundSessionFile })));
      return { ok: true, state };
    } catch (error) { return { ok: false, error: errorMessage(error) }; }
  },
  getThinkingLevels: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      const data = await pi.request<{
        levels: unknown[];
      }>({ type: "get_available_thinking_levels" });
      return { levels: data.levels.filter(isThinkingLevel) };
    }
    catch (err) {
      return { levels: [], error: errorMessage(err) };
    }
  },
  setModel: async ({ provider, modelId }, runtime) => {
    try {
      const pi = runtime!;
      await pi.request({ type: "set_model", provider, modelId });
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  setThinkingLevel: async ({ level }, runtime) => {
    try {
      const pi = runtime!;
      await pi.request({ type: "set_thinking_level", level });
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  renameChat: async ({ name }, runtime) => {
    try {
      const pi = runtime!;
      await pi.request({ type: "set_session_name", name });
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  cloneChat: async (_params, runtime) => {
    try {
      const pi = runtime!;
      const res = await pi.request<{
        cancelled: boolean;
      }>({ type: "clone" });
      if (res.cancelled)
        return { ok: false, error: "Clone was cancelled" };
      return { ok: true, sessionFile: await rebound(pi) };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  deleteChat: async ({ projectDir, sessionFile }, pi) => {
    let claimed = false;
    try {
      if (retiringSessions.has(sessionFile) || starting.has(sessionFile) || sessionWriteCount(sessionFile) > 1)
        throw new Error("Wait for the current chat operation before deleting it.");
      retiringSessions.add(sessionFile);
      claimed = true;
      // Pi keeps the file open while bound to it; move it off this chat first so
      // the delete cannot race a write, and so Pi isn't left pointing at nothing.
      if (pi?.boundSessionFile === sessionFile) {
        if (pis.get(sessionFile) === pi) {
          pis.delete(sessionFile);
          revisions.delete(sessionFile);
        }
        await pi.stop();
      }
      stopSessionWatch(sessionFile);
      await deleteSession(projectDir, sessionFile);
      notifySessionsChanged(projectDir);
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
    finally {
      if (claimed)
        retiringSessions.delete(sessionFile);
    }
  },
  watchSession: async ({ projectDir, sessionFile }) => {
    if (sessionFile)
      await reconcileSessionWatch(projectDir, sessionFile);
    return { ok: true };
  },
  getForkPoints: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile);
      const data = await pi.request<{
        messages: ForkPoint[];
      }>({ type: "get_fork_messages" });
      return { points: data.messages };
    }
    catch (err) {
      return { points: [], error: errorMessage(err) };
    }
  },
  forkChat: async ({ entryId }, runtime) => {
    try {
      const pi = runtime!;
      const res = await pi.request<{
        text: string;
        cancelled: boolean;
      }>({ type: "fork", entryId });
      if (res.cancelled)
        return { ok: false, error: "Fork was cancelled" };
      return { ok: true, sessionFile: await rebound(pi), text: res.text };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  getTree: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile);
      const data = await pi.request<{
        tree: SessionTreeNode[];
        leafId: string | null;
      }>({ type: "get_tree" });
      return { tree: data.tree, leafId: data.leafId };
    }
    catch (err) {
      return { tree: [], leafId: null, error: errorMessage(err) };
    }
  },
  getUsageDashboard: async (params) => {
    try {
      const { projects } = requestParams.getUsageDashboard.parse(params);
      return { dashboard: await usageDashboard(projects) };
    }
    catch (err) {
      return { error: errorMessage(err) };
    }
  },
  getContextInspector: async ({ projectDir, sessionFile }) => {
    try {
      const pi = sessionFile ? await ensurePi(projectDir, sessionFile) : await ensurePi(projectDir);
      return { inspector: await pi.getContextInspector() };
    }
    catch (err) {
      return { error: errorMessage(err) };
    }
  },
  compact: async (_params, runtime) => {
    try {
      const pi = runtime!;
      await pi.request({ type: "compact" });
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  abortRetry: ({ sessionFile }) => {
    pis.get(sessionFile)?.send({ type: "abort_retry" });
    return { ok: true };
  },
  exportHtml: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile);
      const data = await pi.request<{
        path: string;
      }>({ type: "export_html" });
      return { ok: true, path: data.path };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  listProviders: async () => {
    try {
      return { providers: await auth.listProviders() };
    }
    catch (err) {
      return { providers: [], error: errorMessage(err) };
    }
  },
  login: async ({ projectDir, sessionFile, providerId, type, flowId }) => {
    const flow = flowId ?? `host-flow-${++authSequence}`;
    if (activeAuthFlows.has(flow))
      return { ok: false, error: "This authentication flow is already active." };
    activeAuthFlows.add(flow);
    let pi: PiProcess | undefined;
    try {
      if (projectDir) {
        pi = await ensurePi(projectDir, sessionFile ?? undefined);
        await pi.loginProvider(providerId, type, flow);
      }
      else
        await auth.login(providerId, type, {
          prompt: (id, prompt) => {
            if (activeAuthFlows.has(flow))
              push("authPrompt", { id, prompt, flowId: flow });
          },
          notice: notice => {
            if (activeAuthFlows.has(flow))
              push("authNotice", { notice, flowId: flow });
          },
        });
      return { ok: true };
    }
    catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
    finally {
      activeAuthFlows.delete(flow);
      for (const [id, route] of authRoutes)
        if (route.pi === pi && route.flowId === flow)
          authRoutes.delete(id);
    }
  },
  authRespond: ({ projectDir, id, value, cancel, flowId }) => {
    const route = authRoutes.get(id);
    if (route && flowId !== undefined && flowId !== route.flowId)
      return { ok: false };
    if (route) {
      authRoutes.delete(id);
      route.pi.respondAuthPrompt(route.id, { value, cancel });
    }
    else if (!projectDir)
      auth.respondPrompt(id, { value, cancel });
    return { ok: true };
  },
  logout: async ({ projectDir, sessionFile, providerId }) => {
    try {
      if (projectDir)
        await (await ensurePi(projectDir, sessionFile ?? undefined)).logoutProvider(providerId);
      else
        await auth.logout(providerId);
      return { ok: true };
    }
    catch (err) {
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
    if (!mainWindow)
      return { maximized: false };
    if (mainWindow.isMaximized())
      mainWindow.unmaximize();
    else
      mainWindow.maximize();
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
  windowIsFullScreen: () => ({ fullscreen: mainWindow?.isFullScreen() ?? false }),
  windowIsMaximized: () => ({ maximized: mainWindow?.isMaximized() ?? false }),
  openExternal: async ({ url }) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    }
    catch {
      return { ok: false };
    }
  },
  listEditors: async () => {
    try {
      return { editors: await listInstalledEditors() };
    }
    catch {
      return { editors: [{ id: "explorer", name: fileManagerName(), icon: "explorer" }] };
    }
  },
  openProjectIn: async (params) => {
    try {
      const { projectDir, editorId } = requestParams.openProjectIn.parse(params);
      await openProjectIn(projectDir, editorId);
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  openFileIn: async (params) => {
    try {
      const { projectDir, file, editorId, line, column } = requestParams.openFileIn.parse(params);
      await openFileIn(projectDir, file, editorId, line, column);
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  readProjectImage: async (params) => {
    try {
      const { projectDir, file } = requestParams.readProjectImage.parse(params);
      return { src: await readProjectImage(projectDir, file) };
    }
    catch (err) {
      return { error: errorMessage(err) };
    }
  },
  readProjectMedia: async (params) => {
    try {
      const { projectDir, file } = requestParams.readProjectMedia.parse(params);
      return { src: await readProjectMedia(projectDir, file) };
    }
    catch (err) {
      return { error: errorMessage(err) };
    }
  },
  versions: () => ({ pi: auth.PI_VERSION_STRING, app: app.getVersion() }),
  exportDiagnostics: async (params) => {
    try {
      const { projectDir } = requestParams.exportDiagnostics.parse(params);
      const state = await loadState();
      let piSettings: ReturnType<typeof readPiSettings> | undefined;
      let piSettingsError: string | undefined;
      try {
        piSettings = readPiSettings();
      }
      catch (error) {
        piSettingsError = errorMessage(error);
      }
      let packages: Awaited<ReturnType<typeof listPackages>> | undefined;
      let packageError: string | undefined;
      try {
        packages = await listPackages(projectDir ?? app.getPath("home"));
      }
      catch (error) {
        packageError = errorMessage(error);
      }
      return {
        ok: true,
        text: await createDiagnosticsReport({
          appVersion: app.getVersion(),
          piVersion: auth.PI_VERSION_STRING,
          projectDir,
          state,
          piSettings,
          piSettingsError,
          packages,
          packageError,
          terminal: terminalDiagnostics(),
        }),
      };
    }
    catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  },
  reportRendererError: (params) => {
    const { kind, message, stack } = requestParams.reportRendererError.parse(params);
    recordRendererCrash(kind, message, stack);
    return { ok: true };
  },
  updateState: () => updateState(),
  checkForUpdate: () => checkForUpdate(),
  setUpdateChannel: (params) => setUpdateChannel(z.object({ channel: updateChannelSchema }).parse(params).channel),
  installUpdate: async () => {
    if (updateState().status !== "ready")
      return { ok: false, error: "No update has finished downloading." };
    // The installer replaces files this process holds open, and it restarts the
    // app rather than closing it — a turn or a shell still running would be
    // killed by that restart instead of shut down.
    await shutdownHost();
    installUpdate();
    return { ok: true };
  },
  accessStatus: () => accessStatus(),
  startLocalAccess: () => transitionAccess("startLocal"),
  stopLocalAccess: () => transitionAccess("stopLocal"),
  replaceAccessLink: () => transitionAccess("replace"),
  revokeAccess: () => transitionAccess("revoke"),
  startRemoteAccess: () => transitionAccess("startRemote"),
  stopRemoteAccess: () => transitionAccess("stopRemote"),
  getPiSettings: () => {
    try {
      return { settings: readPiSettings() };
    }
    catch (err) {
      return { error: errorMessage(err) };
    }
  },
  // Queued as one unit: writing, pushing live, and reading back all have to see
  // the same file, or an overlapping write undoes this one.
  setPiSettings: ({ patch }) => queuePiSettings(async () => {
    try {
      const parsed = piSettingsPatchSchema.parse(patch);
      await writePiSettings(parsed);
      applyLive(parsed);
      // Read back rather than echo: this is what Pi now reports, including any
      // value it normalized on the way in.
      return { ok: true, settings: readPiSettings() };
    }
    catch (err) {
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
      const { data, mimeType, suggestedName } = requestParams.saveImage.parse(params);
      const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
      const defaultPath = suggestedName.includes(".") ? suggestedName : `${suggestedName}.${extension}`;
      const options = { defaultPath, filters: [{ name: "Image", extensions: [extension] }] };
      const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath)
        return { ok: false, canceled: true };
      await writeFile(result.filePath, Buffer.from(data, "base64"));
      return { ok: true, path: result.filePath };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  terminalEnsure: (params) => {
    const { projectDir, shellId } = requestParams.terminalEnsure.parse(params);
    const existing = listTerminals(projectDir);
    if (existing.length > 0)
      return { terminals: existing };
    return {
      terminals: [
        createTerminal(projectDir, shellId, undefined, (payload) => push("terminalData", payload), (payload) => push("terminalExit", payload)),
      ],
    };
  },
  terminalCreate: (params) => {
    const { projectDir, shellId, name } = requestParams.terminalCreate.parse(params);
    return {
      terminal: createTerminal(projectDir, shellId, name, (payload) => push("terminalData", payload), (payload) => push("terminalExit", payload)),
    };
  },
  terminalListShells: () => ({ shells: listShellProfiles() }),
  terminalRename: (params) => {
    const { projectDir, terminalId, name } = requestParams.terminalRename.parse(params);
    renameTerminal(projectDir, terminalId, name);
    return { ok: true };
  },
  terminalRestart: (params) => {
    const { projectDir, terminalId } = requestParams.terminalRestart.parse(params);
    const terminal = restartTerminal(projectDir, terminalId, (payload) => push("terminalData", payload), (payload) => push("terminalExit", payload));
    push("terminalRestart", { projectDir, terminal });
    return { terminal };
  },
  terminalAttach: (params) => {
    const { projectDir, terminalId } = requestParams.terminalRestart.parse(params);
    return attachTerminal(projectDir, terminalId);
  },
  terminalDetach: (params) => {
    const { projectDir, terminalId } = requestParams.terminalRestart.parse(params);
    detachTerminal(projectDir, terminalId);
    return { ok: true };
  },
  terminalWrite: (params) => {
    const { projectDir, terminalId, data } = requestParams.terminalWrite.parse(params);
    writeTerminal(projectDir, terminalId, data);
    return { ok: true };
  },
  terminalResize: (params) => {
    const { projectDir, terminalId, cols, rows } = requestParams.terminalResize.parse(params);
    resizeTerminal(projectDir, terminalId, cols, rows);
    return { ok: true };
  },
  terminalClear: (params) => {
    const { projectDir, terminalId } = requestParams.terminalRestart.parse(params);
    clearTerminal(projectDir, terminalId);
    return { ok: true };
  },
  terminalClose: (params) => {
    const { projectDir, terminalId } = requestParams.terminalRestart.parse(params);
    closeTerminal(projectDir, terminalId);
    return { ok: true };
  },
  terminalCloseProject: (params) => {
    const { projectDir } = requestParams.listSessions.parse(params);
    closeProjectTerminals(projectDir);
    return { ok: true };
  },
  gitStatus: async ({ projectDir }) => ({ status: await gitStatus(projectDir) }),
  gitLog: async ({ projectDir, query, limit }) => ({ commits: await gitLog(projectDir, query, limit) }),
  gitCommitDetails: ({ projectDir, hash }) => gitCommitDetails(projectDir, hash),
  gitCommitDiff: async ({ projectDir, hash, file }) => ({ diff: await gitCommitDiff(projectDir, hash, file) }),
  gitDiff: async ({ projectDir, file, untracked, staged }) => ({ diff: await gitDiff(projectDir, file, untracked, staged) }),
  gitHunks: async ({ projectDir, file, untracked }) => ({ hunks: await gitHunks(projectDir, file, untracked) }),
  gitStageHunk: async (params) => {
    try {
      const { projectDir, file, untracked, patch } = requestParams.gitStageHunk.parse(params);
      return await gitStageHunk(projectDir, file, untracked, patch);
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  gitRevertFile: async (params) => {
    try {
      const { projectDir, file } = requestParams.gitStageFile.parse(params);
      return await gitRevertFile(projectDir, file);
    }
    catch (error) {
      return { ok: false, error: String(error) };
    }
  },
  gitStageFile: async (params) => {
    try {
      const { projectDir, file } = requestParams.gitStageFile.parse(params);
      return await gitStageFile(projectDir, file);
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  gitUnstageFile: async (params) => {
    try {
      const { projectDir, file, originalPath } = requestParams.gitUnstageFile.parse(params);
      return await gitUnstageFile(projectDir, file, originalPath);
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  gitStageAll: async ({ projectDir }) => await gitStageAll(projectDir),
  gitUnstageAll: async ({ projectDir }) => await gitUnstageAll(projectDir),
  gitGenerateCommitMessage: async (params) => {
    try {
      const { projectDir, sessionFile, model: selectedModel } = requestParams.gitGenerateCommitMessage.parse(params);
      const diff = await gitStagedDiff(projectDir);
      if (!diff)
        return { error: "Stage at least one change before generating a commit message." };
      let model = selectedModel;
      if (!model) {
        const pi = await ensurePi(projectDir, sessionFile ?? undefined);
        const state = await pi.request<RpcSessionState>({ type: "get_state" });
        model = state.model ? `${state.model.provider}/${state.model.id}` : undefined;
      }
      if (!model)
        return { error: "Select a model before generating a commit message." };
      if (shuttingDown || restartingAll || restartingProjects.has(projectDir))
        throw new Error("Pi is stopping. Try again after restart.");
      return { message: await generateCommitMessage(projectDir, diff, model) };
    }
    catch (err) {
      return { error: errorMessage(err) };
    }
  },
  gitCommit: async (params) => {
    try {
      const { projectDir, message } = requestParams.gitCommit.parse(params);
      return await gitCommit(projectDir, message);
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  gitPush: async ({ projectDir }) => await gitPush(projectDir),
  gitSync: async ({ projectDir }) => await gitSync(projectDir),
  gitPrTarget: async ({ projectDir }) => ({ target: await gitPrTarget(projectDir) }),
  gitPushAndCreatePr: async (params) => {
    try {
      const { projectDir, title, body, expectedTarget } = requestParams.gitPushAndCreatePr.parse(params);
      return await gitPushAndCreatePr(projectDir, title, body, expectedTarget);
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  gitBranches: async ({ projectDir }) => ({ branches: await gitBranches(projectDir) }),
  gitCheckout: async (params) => {
    try {
      const { projectDir, branch, create } = requestParams.gitCheckout.parse(params);
      if (projectHasActiveRun(projectDir))
        return { ok: false, error: "Stop every run in this project before switching branches." };
      return await gitCheckout(projectDir, branch, create);
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  gitAddWorktree: async (params) => {
    try {
      const { projectDir, branch, create } = requestParams.gitCheckout.parse(params);
      return await gitAddWorktree(projectDir, branch, create);
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  repoHostContext: async ({ projectDir }) => {
    try {
      const context = await getRepoHostContext(projectDir);
      return { context: context ? context : null };
    }
    catch {
      return { context: null };
    }
  },
  listCommands: async ({ projectDir, sessionFile }) => {
    try {
      const pi = await ensurePi(projectDir, sessionFile ?? undefined);
      return { commands: parseCommands(await pi.request({ type: "get_commands" })) };
    }
    catch {
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
    }
    catch {
      // The composer opens its menu regardless; an empty one says "nothing to
      // insert", which is the truth as far as this window can tell.
      return { skills: [] };
    }
  },
  listProjectFiles: async ({ projectDir }) => {
    try {
      return { files: await listProjectFiles(projectDir) };
    }
    catch {
      return { files: [] };
    }
  },
  readProjectDiffPreview: async (params) => {
    const { projectDir, file, mode } = requestParams.readProjectDiffPreview.parse(params);
    if (!await knownProject(projectDir)) throw new Error("That project is not available.");
    return readProjectDiffPreview(projectDir, file, mode);
  },
  readProjectDirectory: async (params) => {
    const { projectDir, path: dir } = requestParams.readProjectDirectory.parse(params);
    if (!await knownProject(projectDir))
      return { entries: [], error: "That project is not available." };
    try {
      return { entries: await readProjectDirectory(projectDir, dir) };
    }
    catch {
      // A folder can vanish or be unreadable between the click and the read;
      // the explorer says so on that one row and leaves the rest standing.
      return { entries: [], error: "That folder could not be read." };
    }
  },
  watchProjectDirectories: async (params) => {
    const { projectDir, paths } = requestParams.watchProjectDirectories.parse(params);
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
    }
    catch (err) {
      return { packages: [], extensions: [], projectTrusted: false, errors: [errorMessage(err)] };
    }
  },
  installPackage: async ({ projectDir, source, scope }) => {
    try {
      await installPackage(projectDir, source, scope);
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  removePackage: async ({ projectDir, source, scope }) => {
    try {
      await removePackage(projectDir, source, scope);
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  updatePackage: async ({ projectDir, source }) => {
    try {
      await updatePackage(projectDir, source);
      return { ok: true };
    }
    catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  },
  callExtension: async (request, runtime) => {
    try {
      const { extension, method, params } = extensionCallParamsSchema.parse(request);
      const pi = runtime!;
      const result = await pi.callExtension(extension, method, params);
      await runtimeBindings.get(pi)?.ready;
      return { result };
    }
    catch (err) {
      return { error: errorMessage(err) };
    }
  },
  loadGraphicalExtensions: async ({ projectDir }) => {
    try {
      const extensions = await loadGraphicalExtensions(projectDir);
      if (resolve(projectDir) !== resolve(join(app.getPath("userData"), "conversations"))) return { extensions };
      const allowed = (await loadState()).chatExtensions;
      return { extensions: extensions.filter(extension => allowed.some(file => resolve(file).startsWith(resolve(extension.id) + (process.platform === "win32" ? "\\" : "/")))) };
    }
    catch {
      return { extensions: [] };
    }
  },
  extensionRespond: ({ response }, pi) => {
    pi?.sendRaw(response);
    if (pi) extensionActivity.get(pi)?.delete(`prompt:${response.id}`);
    return { ok: true };
  },
  tuiSend: async (params, pi) => {
    const { projectDir, sessionFile, frame } = requestParams.tuiSend.parse(params);
    (frame.type === "nativepi_tui_input" ? pi : projectPi(projectDir, sessionFile))?.sendFrame(frame);
    return { ok: true };
  },
  tuiComplete: async (params) => {
    const { projectDir, sessionFile, lines, cursorLine, cursorCol } = requestParams.tuiComplete.parse(params);
    const pi = projectPi(projectDir, sessionFile);
    if (!pi)
      return { completions: null };
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
    }
    catch (err) {
      return { completions: null, error: errorMessage(err) };
    }
  },
  tuiApply: async (params) => {
    const { projectDir, sessionFile, lines, cursorLine, cursorCol, item, prefix } = requestParams.tuiApply.parse(params);
    const pi = projectPi(projectDir, sessionFile);
    if (!pi)
      return { edit: null };
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
    }
    catch (err) {
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
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  const rendererPort = rendererUrl
    ? Number(new URL(rendererUrl).port || 80)
    : undefined;
  await startLocalServer({
    token: accessToken,
    rendererDir: resolve(import.meta.dirname, "../renderer"),
    createClient: () => new HostClient(),
    invoke: invokeHostRequest,
    subscribe: subscribeHostEvents,
    rendererPort,
  }, localNetwork);
}
async function startRemoteAccessForCurrentServer(): Promise<void> {
  const connection = localServerConnection();
  if (!connection)
    throw new Error("NativePi could not start its access server.");
  const epoch = accessGeneration;
  await startRemoteAccess(connection.port, connection.token, join(app.getPath("userData"), "bin"), async () => {
    if (epoch !== accessGeneration)
      return;
    desiredRemote = false;
    if (!localServerStatus().running)
      await stopLocalServer();
    setSleepBlocked(localServerConnection() !== undefined);
  });
}
let accessToken: string | undefined;
let desiredLocal = false;
let desiredRemote = false;
let accessGeneration = 0;
let accessTask: Promise<AccessStatus> | undefined;
function transitionAccess(action: "startLocal" | "stopLocal" | "startRemote" | "stopRemote" | "replace" | "revoke"): Promise<AccessStatus> {
  const before = `${desiredLocal}:${desiredRemote}`;
  const previousLocal = desiredLocal;
  accessToken ??= localServerConnection()?.token;
  if (action === "startLocal")
    desiredLocal = true;
  if (action === "stopLocal")
    desiredLocal = false;
  if (action === "startRemote")
    desiredRemote = true;
  if (action === "stopRemote")
    desiredRemote = false;
  if (action === "revoke") {
    desiredLocal = false;
    desiredRemote = false;
  }
  if (action !== "replace" && before === `${desiredLocal}:${desiredRemote}`) {
    if (accessTask)
      return accessTask;
    if (Boolean(localServerConnection()) === (desiredLocal || desiredRemote)
      && remoteAccessStatus().state === (desiredRemote ? "running" : "idle"))
      return Promise.resolve(accessStatus());
  }
  const epoch = ++accessGeneration;
  const local = desiredLocal;
  const remote = desiredRemote;
  const replace = action === "replace" || action === "revoke";
  if (replace)
    accessToken = undefined;
  const restartOrigin = replace || previousLocal !== local || (!local && !remote);
  const cancelled = Promise.all([stopRemoteAccess(), restartOrigin ? stopLocalServer() : Promise.resolve()]);
  const previous = accessTask;
  const task = (async () => {
    await previous?.catch(() => { });
    await cancelled;
    if (epoch !== accessGeneration)
      return accessStatus();
    try {
      if (local || remote) {
        await ensureLocalAccess(local);
        accessToken = localServerConnection()?.token;
      }
      if (epoch !== accessGeneration)
        return accessStatus();
      setSleepBlocked(localServerConnection() !== undefined);
      if (remote)
        await startRemoteAccessForCurrentServer();
      if (epoch !== accessGeneration)
        return accessStatus();
      if (remote && remoteAccessStatus().state !== "running") {
        desiredRemote = false;
        if (!local)
          await stopLocalServer();
      }
      return accessStatus();
    }
    catch (error) {
      if (epoch !== accessGeneration)
        return accessStatus();
      desiredRemote = false;
      if (!local)
        await stopLocalServer();
      return accessStatus(errorMessage(error));
    }
    finally {
      if (epoch === accessGeneration)
        setSleepBlocked(localServerConnection() !== undefined);
    }
  })();
  accessTask = task;
  void task.then(() => {
    if (accessTask === task)
      accessTask = undefined;
  }, () => {
    if (accessTask === task)
      accessTask = undefined;
  });
  return task;
}
function accessStatus(localError?: string): AccessStatus {
  const local = localServerStatus();
  // Any server bound and listening — local network or loopback backing a
  // remote tunnel — is a reason this machine should not go to sleep.
  return {
    local: localError ? { ...local, error: localError } : local,
    remote: remoteAccessStatus(),
  };
}
export class HostClient extends ClientLeases {
  activeProject?: string;
  sessions = new Map<string, string>();
  projects = new Set<string>();
  directories = new Map<string, string[]>();
  constructor() { super(); clients.add(this); }
  override dispose(): void {
    super.dispose();
    clients.delete(this);
    for (const project of this.projects)
      if (![...clients].some(client => client.projects.has(project)))
        stopProjectSessionWatch(project);
    for (const project of this.directories.keys())
      reconcileDirectories(project);
    for (const [project, file] of this.sessions)
      void reconcileSessionWatch(project, file).catch(error => console.error("Could not watch session", error));
  }
}
const clients = new Set<HostClient>();
let desktopClient: HostClient | undefined;
function reconcileDirectories(project: string): void {
  setExplorerWatches(project, [...new Set([...clients].flatMap(client => client.directories.get(project) ?? []))]);
}
const sessionWrites = new Set<HostRequestName>(["submit", "enqueue", "setModel", "setThinkingLevel", "setServiceTier", "renameChat", "cloneChat", "forkChat", "compact", "deleteChat", "callExtension", "extensionRespond"]);
// These operations use only a live process (or delete a cold file). All other
// mutations acquire Pi before capturing the binding they may write through.
const existingSessionWrites = new Set<HostRequestName>(["enqueue", "extensionRespond", "tuiSend", "deleteChat"]);
const gitWorktreeWrites = new Set<HostRequestName>(["gitCheckout", "gitRevertFile", "gitStageHunk", "gitStageFile", "gitUnstageFile", "gitStageAll", "gitUnstageAll", "gitCommit", "gitSync"]);
export async function invokeHostRequest<K extends HostRequestName>(name: K, raw: HostRequests[K]["params"], client = desktopClient ??= new HostClient()): Promise<HostRequests[K]["response"]> {
  const params = validateHostRequest(name, raw);
  const record = params as Record<string, unknown>;
  for (const key of ["projectDir", "sessionFile"] as const)
    if (typeof record[key] === "string")
      record[key] = resolve(record[key]);
  if (client.disposed)
    throw new Error("This client disconnected");
  const values = params as {
    projectDir?: string;
    sessionFile?: string | null;
    paths?: string[];
    terminalId?: string;
    attachmentId?: string;
  };
  const project = values.projectDir;
  const file = values.sessionFile;
  if (project && file && pis.has(file) && pis.get(file)?.projectDir !== project)
    throw new Error("That chat belongs to another project");
  if (gitWorktreeWrites.has(name) && project && projectHasActiveRun(project))
    return { ok: false, error: "Stop every run in this project before changing Git state." } as HostRequests[K]["response"];
  if (name === "watchProjectDirectories" && project) {
    if (!await knownProject(project) || client.disposed)
      return { ok: true } as HostRequests[K]["response"];
    client.directories.set(project, values.paths ?? []);
    reconcileDirectories(project);
    return { ok: true } as HostRequests[K]["response"];
  }
  if (name === "watchProjectSessions" && project)
    client.projects.add(project);
  if (name === "unwatchProjectSessions" && project) {
    client.projects.delete(project);
    if (client.activeProject === project) client.activeProject = undefined;
    const previous = client.sessions.get(project);
    client.sessions.delete(project);
    if (previous) await reconcileSessionWatch(project, previous);
    if (![...clients].some(client => client.projects.has(project)))
      stopProjectSessionWatch(project);
    return { ok: true } as HostRequests[K]["response"];
  }
  if (name === "watchSession" && project) {
    client.activeProject = project;
    const previous = client.sessions.get(project);
    if (file)
      client.sessions.set(project, file);
    else
      client.sessions.delete(project);
    if (previous && previous !== file)
      await reconcileSessionWatch(project, previous);
  }
  const terminalKey = `terminal:${project}\0${values.terminalId}\0${values.attachmentId ?? "default"}`;
  if (name === "terminalDetach") {
    client.release(terminalKey);
    return { ok: true } as HostRequests[K]["response"];
  }
  if (name === "terminalAttach" && client.has(terminalKey)) {
    // Repeated attach returns a fresh snapshot without taking another lease.
    const snapshot = attachTerminal(project!, values.terminalId!);
    detachTerminal(project!, values.terminalId!);
    return snapshot as HostRequests[K]["response"];
  }
  const mayWriteSession = sessionWrites.has(name) || (name === "tuiSend" && (params as HostRequests["tuiSend"]["params"]).frame.type === "nativepi_tui_input");
  let pi: PiProcess | undefined;
  let finishSessionWrite: (() => Promise<void>) | undefined;
  if (project)
    outstanding.set(project, (outstanding.get(project) ?? 0) + 1);
  try {
    if (mayWriteSession && project) {
      try {
        if (file)
          await assertCoherent(file);
        pi = existingSessionWrites.has(name) ? projectPi(project, file) : await ensurePi(project, file ?? undefined);
        const binding = pi && runtimeBindings.get(pi);
        await binding?.ready;
        if (binding?.file)
          await assertCoherent(binding.file);
        if (projectPi(project, file) !== pi || (pi && (!binding || !ownsBinding(pi, binding) || (file && binding.file !== file))))
          throw new Error("Pi session changed. Try again.");
        if (pi && binding)
          finishSessionWrite = beginSessionWrite(pi, binding);
      }
      catch (error) {
        return { ok: false, error: errorMessage(error) } as HostRequests[K]["response"];
      }
    }
    const handler = handlers[name] as (value: HostRequests[K]["params"], pi?: PiProcess) => Promise<HostRequests[K]["response"]> | HostRequests[K]["response"];
    const result = await handler(params, pi);
    if (name === "terminalAttach")
      client.acquire(terminalKey, () => detachTerminal(project!, values.terminalId!));
    if (client.disposed) {
      for (const project of client.projects)
        if (![...clients].some(other => other.projects.has(project)))
          stopProjectSessionWatch(project);
      for (const project of client.directories.keys())
        reconcileDirectories(project);
      for (const [project, file] of client.sessions)
        await reconcileSessionWatch(project, file);
      throw new Error("This client disconnected");
    }
    return result;
  }
  finally {
    if (project)
      outstanding.set(project, Math.max(0, (outstanding.get(project) ?? 1) - 1));
    if (file)
      idleAfter.set(file, Date.now() + SETTLE_GRACE_MS);
    await finishSessionWrite?.();
  }
}
export function initializeHost(): void {
  // Started from here rather than from the window: `push` is what turns an
  // update into something the renderer can see, and it lives in this module.
  startUpdates((state) => push("updateState", state));
}
function retireRuntimes(projectDir?: string): Promise<void> {
  const key = projectDir ?? "*";
  const existing = retirementTasks.get("*") ?? retirementTasks.get(key);
  if (existing)
    return existing;
  if (projectDir)
    restartingProjects.add(projectDir);
  else
    restartingAll = true;
  const acquisitions = [...starting.entries()].filter(([key]) => !projectDir || startingPis.get(key)?.projectDir === projectDir).map(([, task]) => task);
  const all = [...new Set([...pis.values(), ...draftPis.values(), ...startingPis.values()])].filter(pi => !projectDir || pi.projectDir === projectDir);
  const previous = [...retirementTasks.values()];
  const task = (async () => {
    try {
      await Promise.all([stopEphemeral(projectDir), ...all.map(pi => pi.stop()), ...previous]);
      await Promise.allSettled(acquisitions);
      for (const [key, pi] of pis)
        if (all.includes(pi))
          pis.delete(key);
      for (const [key, pi] of draftPis)
        if (all.includes(pi))
          draftPis.delete(key);
    }
    finally {
      if (projectDir)
        restartingProjects.delete(projectDir);
      else
        restartingAll = false;
      retirementTasks.delete(key);
    }
  })();
  retirementTasks.set(key, task);
  return task;
}
let shutdownTask: Promise<void> | undefined;
export function shutdownHost(): Promise<void> { return shutdownTask ??= shutdown(); }
async function shutdown(): Promise<void> {
  shuttingDown = true;
  for (const client of [...clients])
    client.dispose();
  runtimeGeneration++;
  await Promise.all([stopAllPi(), stopPackageOperations()]);
  await Promise.all([drainState(), auth.settleAuthWrites()]);
}
export async function stopAllPi(): Promise<void> {
  clearInterval(idleReclaimTimer);
  idleReclaimTimer = undefined;
  await Promise.all(idleRetirements.values());
  await retireRuntimes();
  for (const pi of eventBatches.keys())
    flushEventBatch(pi);
  stopAllSessionWatches();
  for (const projectDir of projectSessionWatches.keys())
    stopProjectSessionWatch(projectDir);
  for (const projectDir of [...explorerWatches.keys()])
    stopExplorerWatches(projectDir);
  for (const timer of sessionNotificationTimers.values())
    clearTimeout(timer);
  sessionNotificationTimers.clear();
  stopAllTerminals();
  await transitionAccess("revoke");
  setSleepBlocked(false);
}
