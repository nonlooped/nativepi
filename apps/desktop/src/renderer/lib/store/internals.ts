import type { NativePiState } from "../../../shared/rpc-schema.ts";
import { draftKeyFor, modelKey } from "../../../shared/messages.ts";
import { isRemote, rpc } from "../rpc.ts";
import type { GetState, SetState } from "./types.ts";

/**
 * State the store keeps but never renders.
 *
 * These were closure variables inside the single `create` call. They are
 * module-level here because the store is a singleton either way, and because
 * more than one slice needs them.
 */

/** Last chat opened per project. Persisted, but not part of the rendered state. */
let lastChatByProject: Record<string, string> = {};

export function getLastChat(projectPath: string): string | undefined {
  return lastChatByProject[projectPath];
}

export function setLastChat(projectPath: string, sessionFile: string): void {
  lastChatByProject = { ...lastChatByProject, [projectPath]: sessionFile };
}

export function forgetLastChat(projectPath: string): void {
  const { [projectPath]: _removed, ...rest } = lastChatByProject;
  lastChatByProject = rest;
}

export function replaceLastChats(map: Record<string, string>): void {
  lastChatByProject = map;
}

/**
 * Tell the Pi host what the composer holds.
 *
 * `ctx.ui.getEditorText()` is synchronous, so an extension asking what the user
 * is writing cannot be answered with a round trip — the host has to already know.
 * Coalesced to one message per idle moment: this fires on every keystroke, and
 * the answer only has to be true by the time an extension asks for it.
 */
let draftReport: ReturnType<typeof setTimeout> | undefined;

export function reportDraft(projectDir: string | null, sessionFile: string | null, text: string): void {
  if (!projectDir) return;
  clearTimeout(draftReport);
  draftReport = setTimeout(() => {
    void rpc.request
      .tuiSend({ projectDir, sessionFile, frame: { type: "nativepi_tui_editor", text } })
      .catch(() => {});
  }, 150);
}

/** When git was last refreshed, so a busy turn cannot spam `git status`. */
let lastGitRefresh = 0;

export function markGitRefreshed(): void {
  lastGitRefresh = Date.now();
}

export function gitRefreshedWithin(ms: number): boolean {
  return Date.now() - lastGitRefresh < ms;
}

/**
 * Persist the workspace, coalesced.
 *
 * Nearly every action touches something persisted, so writing on each one would
 * mean a file write per keystroke while typing a draft.
 */
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function persist(get: GetState): void {
  if (isRemote) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = get();
    const map = { ...lastChatByProject };
    if (s.activeProjectPath && s.activeSessionFile) map[s.activeProjectPath] = s.activeSessionFile;

    const state: NativePiState = {
      version: 1,
      projects: s.projects,
      lastProjectPath: s.activeProjectPath ?? undefined,
      lastChatByProject: map,
      drafts: s.drafts,
      favoriteModels: s.favoriteModels ?? [],
      commitMessageModel: s.commitMessageModel,
      pinnedChats: s.pinnedChats,
      panes: {
        sidebarOpen: s.sidebarOpen,
        sidebarSize: s.sidebarSize,
        contextPaneOpen: s.contextPaneOpen,
      },
      reopenLastProject: s.reopenLastProject,
      preferences: s.preferences,
      keybindingOverrides: s.keybindingOverrides,
    };
    void rpc.request.saveState({ state });
  }, 250);
}

/** Where the current composer draft is stored. */
export function draftKey(get: GetState): string {
  const s = get();
  return draftKeyFor(s.activeProjectPath, s.activeSessionFile);
}

/**
 * Bring a project up: start Pi, then load what depends on it.
 *
 * Every result is discarded if the user has moved to another project in the
 * meantime, and the model checks additionally guard against a slow `get_state`
 * overwriting a model the user picked while it was in flight.
 */
export function warmProject(set: SetState, get: GetState, path: string): void {
  const sessionFile = get().activeSessionFile;
  void get().refreshGit();
  void rpc.request.ensurePi({ projectDir: path, sessionFile: sessionFile ?? undefined });

  void rpc.request.getModels({ projectDir: path, sessionFile }).then((r) => {
    if (get().activeProjectPath === path) set({ models: r.models });
  });

  // The main process's provider list comes from a standalone `ModelRuntime`
  // that never runs extension `activate()`, so a provider an extension
  // registers (e.g. a custom-model bridge) is invisible until it's merged in
  // from this project's own session, which did run activation.
  void rpc.request.getSessionProviders({ projectDir: path, sessionFile }).then((r) => {
    if (get().activeProjectPath !== path || r.error) return;
    set({ providers: r.providers, providersLoaded: true });
  });

  const currentModel = get().model;
  const modelBeforeLoad = currentModel ? modelKey(currentModel) : undefined;
  void rpc.request.getState({ projectDir: path, sessionFile }).then(async (r) => {
    const selectedModel = get().model;
    if (
      get().activeProjectPath !== path ||
      !r.state ||
      (selectedModel ? modelKey(selectedModel) : undefined) !== modelBeforeLoad
    ) {
      return;
    }
    set({ model: r.state.model, thinkingLevel: r.state.thinkingLevel });
    const loadedModel = r.state.model ? modelKey(r.state.model) : undefined;
    const levels = await rpc.request.getThinkingLevels({ projectDir: path, sessionFile });
    const activeModel = get().model;
    if (
      get().activeProjectPath === path &&
      (activeModel ? modelKey(activeModel) : undefined) === loadedModel &&
      levels.levels.length > 0
    ) {
      set({ thinkingLevels: levels.levels });
    }
  });

  void import("../extensionHost.ts").then(({ loadGraphicalExtensions }) => loadGraphicalExtensions(path)).then((res) => {
    if (get().activeProjectPath !== path) return;
    set({ extRenderers: res.extensions, extLoadErrors: res.errors });
  });
}
