import type { NativePiState } from "../../../shared/rpc-schema.ts";
import { draftKeyFor } from "../../../shared/messages.ts";
import { isRemote, rpc } from "../rpc.ts";
import { dropAllSurfaces } from "../tuiSurfaces.ts";
import { NO_EXTENSION_UI_STATE, type GetState, type SetState } from "./types.ts";
import { patchConversation } from "./conversation.ts";

// Non-rendered ownership is keyed by the store, never shared between store instances.
export function runtime(get: GetState) {
  let value = runtimes.get(get);
  if (!value) {
    value = {
      lastChats: {}, selection: 0, folder: 0, epoch: 0, modelProjection: 0, levelsProjection: 0, lastGitRefresh: 0,
      draftReports: new Map(), eventVersions: new Map(), runtimes: new Map(), bindings: new Map(),
      projectEpochs: new Map(), runtimeProjects: new Map(), eventWatermarks: new Map(),
      acknowledgedEvents: new Map(), retired: new Set(), blockedDrafts: new Set(),
    };
    runtimes.set(get, value);
  }
  return value;
}
interface Runtime {
  lastChats: Record<string, string>;
  selection: number;
  folder: number;
  epoch: number;
  modelProjection: number;
  levelsProjection: number;
  levelsModel?: ReturnType<GetState>["model"];
  modelStateRecovery?: () => boolean;
  modelStateRead?: () => boolean;
  projectEpochs: Map<string, number>;
  runtimeProjects: Map<string, string>;
  eventWatermarks: Map<string, { runtimeId?: string; sequence: number; pending: Set<number> }>;
  acknowledgedEvents: Map<string, number>;
  eventVersions: Map<string, number>;
  runtimes: Map<string, string>;
  bindings: Map<string, string>;
  retired: Set<string>;
  blockedDrafts: Set<string>;
  lastGitRefresh: number;
  draftReports: Map<string, ReturnType<typeof setTimeout>>;
  saveTimer?: ReturnType<typeof setTimeout>;
  disposed?: boolean;
}
const runtimes = new WeakMap<GetState, Runtime>();
export function observeRuntime(get: GetState, projectDir: string, sessionFile: string | null | undefined, id: string): void {
  const owner = runtime(get);
  owner.runtimes.set(sessionFile ?? projectDir, id);
  owner.runtimeProjects.set(id, projectDir);
  if (sessionFile) owner.bindings.set(id, sessionFile);
}
export function runtimeEpoch(get: GetState, projectDir: string | null): string {
  const owner = runtime(get);
  return `${owner.epoch}:${projectDir ? owner.projectEpochs.get(projectDir) ?? 0 : 0}`;
}
export function selectionGuard(get: GetState) {
  const owner = runtime(get);
  const { selection } = owner;
  const epoch = runtimeEpoch(get, get().activeProjectPath);
  const { activeProjectPath, activeSessionFile } = get();
  return () => owner.selection === selection && runtimeEpoch(get, activeProjectPath) === epoch
    && get().activeProjectPath === activeProjectPath && get().activeSessionFile === activeSessionFile;
}

export function getLastChat(get: GetState, projectPath: string): string | undefined {
  return runtime(get).lastChats[projectPath];
}

export function setLastChat(get: GetState, projectPath: string, sessionFile: string): void {
  runtime(get).lastChats = { ...runtime(get).lastChats, [projectPath]: sessionFile };
}

export function forgetLastChat(get: GetState, projectPath: string): void {
  const { [projectPath]: _removed, ...rest } = runtime(get).lastChats;
  runtime(get).lastChats = rest;
}

export function replaceLastChats(get: GetState, map: Record<string, string>): void {
  runtime(get).lastChats = map;
}

/**
 * Tell the Pi host what the composer holds.
 *
 * `ctx.ui.getEditorText()` is synchronous, so an extension asking what the user
 * is writing cannot be answered with a round trip — the host has to already know.
 * Coalesced to one message per idle moment: this fires on every keystroke, and
 * the answer only has to be true by the time an extension asks for it.
 */

export function reportDraft(get: GetState, projectDir: string | null, sessionFile: string | null, text: string): void {
  if (!projectDir) return;
  const reports = runtime(get).draftReports;
  const key = draftKeyFor(projectDir, sessionFile);
  clearTimeout(reports.get(key));
  const timer = setTimeout(() => {
    reports.delete(key);
    void rpc.request
      .tuiSend({ projectDir, sessionFile, frame: { type: "nativepi_tui_editor", text } })
      .catch(() => {});
  }, 150);
  reports.set(key, timer);
}

export function writeDraft(set: SetState, get: GetState, projectDir: string | null, sessionFile: string | null, text: string): void {
  const key = draftKeyFor(projectDir, sessionFile);
  set(state => ({ drafts: { ...state.drafts, [key]: text } }));
  persist(get);
  reportDraft(get, projectDir, sessionFile, text);
}

/** When git was last refreshed, so a busy turn cannot spam `git status`. */

export function markGitRefreshed(get: GetState): void {
  runtime(get).lastGitRefresh = Date.now();
}

export function gitRefreshedWithin(get: GetState, ms: number): boolean {
  return Date.now() - runtime(get).lastGitRefresh < ms;
}

export function rememberProject(set: SetState, get: GetState, path: string): void {
  if (get().projects.some((project) => project.path === path)) return;
  const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
  set((s) => ({ projects: [...s.projects, { path, name }] }));
  persist(get);
}

export interface FolderEntry {
  stillSelected: () => boolean;
  trustCheck: Promise<{ required: boolean; trusted: boolean }>;
}

/**
 * Switch Git, trust, terminals, and Pi to this folder without choosing a chat.
 *
 * The previous folder's conversation is left alone: it keeps folding in events
 * while off screen, and is picked back up on return. Its TUI panes belonged to
 * a Pi that is still running, and nothing about them arrives again on its own,
 * so the folder being entered is asked to say it all again.
 *
 * `selectProject` then restores the last (or first) chat; `selectChat` uses this
 * when the opened chat lives in a different folder so that chat becomes the
 * workspace instead of that folder's remembered one.
 */
export function enterProjectFolder(set: SetState, get: GetState, path: string): FolderEntry {
  ++runtime(get).selection;
  const selection = ++runtime(get).folder;
  const stillSelected = () => selection === runtime(get).folder && get().activeProjectPath === path;
  const extPrompts = get().extensionPromptsByProject[path] ?? [];
  set((state) => ({
    activeProjectPath: path,
    activeSessionFile: null,
    isNewChat: false,
    models: [],
    model: undefined,
    thinkingLevelReady: false,
    thinkingLevelVersion: state.thinkingLevelVersion + 1,
    thinkingLevels: [],
    thinkingLevelsLoading: true,
    thinkingLevelsError: undefined,
    trustPrompt: null,
    trust: null,
    git: null,
    repoHost: undefined,
    extPrompts,
    extStatuses: {},
    extWidgets: {},
    extRenderers: [],
    extLoadErrors: [],
    extSurfaces: [],
    extTriggers: [],
    extUiState: NO_EXTENSION_UI_STATE,
    providers: [],
    providersLoaded: false,
    authFlow: null,
  }));
  dropAllSurfaces();
  void rpc.request.tuiSend({ projectDir: path, sessionFile: get().activeSessionFile, frame: { type: "nativepi_tui_sync" } }).catch(() => {});
  persist(get);
  // The trust check does not depend on the session list, and a round trip
  // costs ~200ms over the public tunnel against nothing on the desktop, so it
  // goes out alongside rather than after. Rejections are handled at the await
  // in applyFolderTrust; the no-op catch only stops the gap counting as unhandled.
  const trustCheck = rpc.request.checkTrust({ projectDir: path });
  trustCheck.catch(() => {});
  return { stillSelected, trustCheck };
}

export async function applyFolderTrust(
  set: SetState,
  get: GetState,
  path: string,
  folder: FolderEntry,
): Promise<void> {
  const trust = await folder.trustCheck;
  if (!folder.stillSelected()) return;
  set({ trust });
  if (trust.required && !trust.trusted) {
    set({ trustPrompt: { projectPath: path } });
  } else {
    await warmProject(set, get, path);
  }
}

/**
 * Persist the workspace, coalesced.
 *
 * Nearly every action touches something persisted, so writing on each one would
 * mean a file write per keystroke while typing a draft.
 */

function persistedState(get: GetState): NativePiState {
  const s = get();
  const map = { ...runtime(get).lastChats };
  if (s.activeProjectPath && s.activeSessionFile) map[s.activeProjectPath] = s.activeSessionFile;
  return {
    version: 1,
    projects: s.projects,
    lastProjectPath: s.activeProjectPath ?? undefined,
    lastChatByProject: map,
    drafts: s.drafts,
    favoriteModels: s.favoriteModels ?? [],
    commitMessageModel: s.commitMessageModel,
    pinnedChats: s.pinnedChats,
    finishedChats: s.finishedChats,
    focusedChats: s.focusedChats,
    focusStartedAt: s.focusStartedAt,
    panes: {
      sidebarOpen: s.sidebarOpen,
      sidebarWidth: s.sidebarWidth,
      contextPaneWidth: s.contextPaneWidth,
      terminalHeight: s.terminalHeight,
      contextPaneOpen: s.contextPaneOpen,
    },
    reopenLastProject: s.reopenLastProject,
    preferences: s.preferences,
    keybindingOverrides: s.keybindingOverrides,
  };
}

export async function flushPersist(get: GetState): Promise<void> {
  if (isRemote || !get().ready || runtime(get).disposed) return;
  clearTimeout(runtime(get).saveTimer);
  runtime(get).saveTimer = undefined;
  const result = await rpc.request.saveState({ state: persistedState(get) });
  if (!result.ok) throw new Error("Could not save the workspace.");
}

export function persist(get: GetState): void {
  if (isRemote || !get().ready || runtime(get).disposed) return;
  clearTimeout(runtime(get).saveTimer);
  runtime(get).saveTimer = setTimeout(() => {
    runtime(get).saveTimer = undefined;
    if (!get().ready || runtime(get).disposed) return;
    void rpc.request.saveState({ state: persistedState(get) }).catch(() => {});
  }, 250);
}

/** Where the current composer draft is stored. */
export function draftKey(get: GetState): string {
  const s = get();
  return draftKeyFor(s.activeProjectPath, s.activeSessionFile);
}

/** Authoritative reads and model controls supersede both model and levels work. */
export function modelProjectionGuard(get: GetState): () => boolean {
  const owner = runtime(get);
  const version = ++owner.modelProjection;
  ++owner.levelsProjection;
  const selected = selectionGuard(get);
  return () => selected() && owner.modelProjection === version;
}

function clearModelControlError(set: SetState, get: GetState, projectDir: string, sessionFile: string | null): void {
  if (!get().conversations[sessionFile ?? projectDir]?.modelControlError) return;
  patchConversation(set, projectDir, sessionFile, conversation => conversation.modelControlError
    ? { error: undefined, modelControlError: undefined } : {});
}

function reportModelControlError(set: SetState, projectDir: string, sessionFile: string | null, message: string): void {
  patchConversation(set, projectDir, sessionFile, conversation =>
    conversation.modelControlError || (!conversation.error && !conversation.errorRecovery)
      ? { error: message, modelControlError: true } : {});
}

/** Retire selected readers and give the current target an explicit authoritative retry. */
export function requireModelStateRecovery(
  set: SetState, get: GetState, message: string, levels: ReturnType<GetState>["thinkingLevels"] = [],
): void {
  modelProjectionGuard(get);
  runtime(get).modelStateRecovery = selectionGuard(get);
  set({ thinkingLevels: levels, thinkingLevelsLoading: false, thinkingLevelsError: message });
  const { activeProjectPath, activeSessionFile } = get();
  if (activeProjectPath) reportModelControlError(set, activeProjectPath, activeSessionFile, message);
}

export function startThinkingLevels(set: SetState, get: GetState, projectDir: string, sessionFile: string | null): void {
  clearModelControlError(set, get, projectDir, sessionFile);
  set({ thinkingLevels: [], thinkingLevelsLoading: true, thinkingLevelsError: undefined });
}

export async function loadThinkingLevels(
  set: SetState, get: GetState, projectDir: string, sessionFile: string | null, current: () => boolean,
): Promise<void> {
  const owner = runtime(get);
  const version = ++owner.levelsProjection;
  const projection = owner.modelProjection;
  owner.levelsModel = get().model;
  const valid = () => current() && owner.levelsProjection === version
    && owner.modelProjection === projection && get().model === owner.levelsModel;
  if (!valid()) return;
  startThinkingLevels(set, get, projectDir, sessionFile);
  try {
    const result = await rpc.request.getThinkingLevels({ projectDir, sessionFile });
    if (result.error !== undefined) throw new Error(result.error || "Pi could not load this model’s levels.");
    if (valid()) set({ thinkingLevels: result.levels, thinkingLevelsLoading: false });
  } catch (error) {
    if (!valid()) return;
    const message = (error instanceof Error ? error.message : String(error)) || "Pi could not load this model’s levels.";
    set({ thinkingLevels: [], thinkingLevelsLoading: false, thinkingLevelsError: message });
    reportModelControlError(set, projectDir, sessionFile, message);
  }
}

// Callers may propagate this failure, but the reader has already presented it.
export class ModelStateReadError extends Error {}

/** Read Pi's current model, then its levels, as one selected-view projection. */
export async function readModelState(set: SetState, get: GetState, path: string): Promise<void> {
  const sessionFile = get().activeSessionFile;
  const current = modelProjectionGuard(get);
  runtime(get).modelStateRead = current;
  const levelsVersion = runtime(get).levelsProjection;
  const version = runtime(get).eventVersions.get(sessionFile ?? path) ?? 0;
  const modelBefore = get().model;
  const thinkingVersion = get().thinkingLevelVersion;
  let result;
  try {
    result = await rpc.request.getState({ projectDir: path, sessionFile });
    if (result.error !== undefined || !result.state) throw new Error(result.error || "Pi could not read the current model.");
  } catch (error) {
    if (!current() || get().model !== modelBefore) return;
    const owner = runtime(get);
    // Keep the existing projection, but never accept levels from work
    // this read superseded (or a retry made while its model was unknown).
    const levels = owner.levelsProjection === levelsVersion ? get().thinkingLevels : [];
    const message = (error instanceof Error ? error.message : String(error)) || "Pi could not read the current model.";
    requireModelStateRecovery(set, get, message, levels);
    throw new ModelStateReadError(message, { cause: error });
  } finally {
    if (runtime(get).modelStateRead === current) runtime(get).modelStateRead = undefined;
  }
  if (!current() || get().model !== modelBefore) return;
  runtime(get).modelStateRecovery = undefined;
  const state = result.state;
  set({ model: state.model, ...(get().thinkingLevelVersion === thinkingVersion
    ? { thinkingLevel: state.thinkingLevel, thinkingLevelReady: true, thinkingLevelVersion: thinkingVersion + 1 } : {}) });
  // A state request begun before an event cannot undo that event's runtime projection.
  if ((runtime(get).eventVersions.get(sessionFile ?? path) ?? 0) === version) {
    patchConversation(set, path, sessionFile, { running: state.isStreaming, compacting: state.isCompacting,
      runStartedAt: state.isStreaming ? (get().conversations[sessionFile ?? path]?.runStartedAt ?? Date.now()) : null });
  }
  if (runtime(get).levelsProjection === levelsVersion) {
    await loadThinkingLevels(set, get, path, sessionFile, current);
  } else {
    // A levels-only request started after this state read, with no intervening
    // model work. It owns its settlement; the state read must not cancel or join it.
    runtime(get).levelsModel = state.model;
  }
}

/** Bring a project up, discarding results belonging to an older view or runtime. */
export async function warmProject(set: SetState, get: GetState, path: string): Promise<void> {
  const sessionFile = get().activeSessionFile;
  const selected = selectionGuard(get);
  try {
    const ensured = rpc.request.ensurePi({ projectDir: path, sessionFile: sessionFile ?? undefined }).then(result => {
      if (result.ok === false) throw new Error(result.error ?? "Could not start Pi.");
    });
    await Promise.all([
      ensured,
      get().refreshGit(),
      rpc.request.getModels({ projectDir: path, sessionFile }).then(r => { if (selected()) set({ models: r.models }); }),
      get().loadProviders?.(),
      readModelState(set, get, path),
      import("../extensionHost.ts").then(({ loadGraphicalExtensions }) => loadGraphicalExtensions(path)).then(res => {
        if (selected()) set({ extRenderers: res.extensions, extLoadErrors: res.errors });
      }),
    ]);
  } catch (error) {
    if (selected() && !(error instanceof ModelStateReadError)) patchConversation(set, path, sessionFile, { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
