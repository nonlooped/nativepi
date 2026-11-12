import { rpc } from "../rpc.ts";
import { sanitizeOverrides } from "../shortcuts.ts";
import { showHint } from "../toast.tsx";
import {
  applyFolderTrust,
  enterProjectFolder,
  forgetLastChat,
  getLastChat,
  persist,
  rememberProject,
  replaceLastChats,
  warmProject,
  runtime,
  runtimeEpoch,
  selectionGuard,
  ModelStateReadError,
  modelProjectionGuard,
  requireModelStateRecovery,
} from "./internals.ts";
import { emptyConversation, patchConversation } from "./conversation.ts";
import { dropAllSurfaces } from "../tuiSurfaces.ts";
import { NO_EXTENSION_UI_STATE, type SliceCreator, type WorkspaceSlice } from "./types.ts";

// Request-stage failures are handled under their captured recovery owner.
class RestartRequestError extends Error {}

export const createWorkspaceSlice: SliceCreator<WorkspaceSlice> = (set, get) => {
  const restarts = new Map<string, Promise<void>>();
  function restart(path?: string): Promise<void> {
    const key = path ?? "*";
    const current = restarts.get("*") ?? restarts.get(key);
    if (current) return current;
    const run = (async () => {
      // Invalidate pending reads before stopping; retire every observed old runtime.
      const owner = runtime(get);
      if (path) owner.projectEpochs.set(path, (owner.projectEpochs.get(path) ?? 0) + 1);
      else ++owner.epoch;
      const selectedProject = get().activeProjectPath;
      const sessionFile = selectedProject === path ? get().activeSessionFile : null;
      const epoch = runtimeEpoch(get, path ?? selectedProject);
      const affectedSelection = selectedProject && (!path || selectedProject === path);
      const ownsRecovery = affectedSelection ? modelProjectionGuard(get) : () => false;
      if (affectedSelection) owner.modelStateRecovery = selectionGuard(get);
      try {
        const response = path ? await rpc.request.restartPi({ projectDir: path }) : await rpc.request.restartAllPi({});
        if (!response.ok) throw new Error("Pi could not restart. Try again.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (ownsRecovery()) {
          requireModelStateRecovery(set, get, message);
          patchConversation(set, selectedProject!, get().activeSessionFile, { error: message, errorRecovery: "restartPi" });
        } else if (path && runtimeEpoch(get, path) === epoch
          && (get().activeProjectPath !== path || get().activeSessionFile !== sessionFile)) {
          // Keep the target's failure off screen without taking a newer view's loading ownership.
          patchConversation(set, path, sessionFile, { error: message, errorRecovery: "restartPi" });
        }
        throw new RestartRequestError(message, { cause: error });
      }
      if (path) owner.projectEpochs.set(path, (owner.projectEpochs.get(path) ?? 0) + 1);
      else ++owner.epoch;
      for (const [id, project] of owner.runtimeProjects) {
        if (!path || project === path) owner.retired.add(id);
      }
      set(state => ({
        conversations: Object.fromEntries(Object.entries(state.conversations).map(([key, conversation]) => {
          if (path && conversation.projectDir !== path) return [key, conversation];
          return [key, { ...emptyConversation(), projectDir: conversation.projectDir, sessionFile: conversation.sessionFile,
            entries: conversation.entries, sessionName: conversation.sessionName, externalChange: conversation.externalChange }];
        })),
        extensionPromptsByProject: Object.fromEntries(Object.entries(state.extensionPromptsByProject).filter(([project]) => path && project !== path)),
      }));
      const active = get().activeProjectPath;
      if (active && (!path || active === path)) {
        dropAllSurfaces();
        set(state => ({ extPrompts: [], extStatuses: {}, extWidgets: {}, extSurfaces: [], extTriggers: [], extUiState: NO_EXTENSION_UI_STATE,
          extRenderers: [], extLoadErrors: [], selectionVersion: state.selectionVersion + 1,
          models: [], model: undefined, providers: [], providersLoaded: false, thinkingLevelReady: false,
          thinkingLevels: [], thinkingLevelsLoading: true, thinkingLevelsError: undefined,
          thinkingLevelVersion: state.thinkingLevelVersion + 1 }));
      }
      const affected = new Map(Object.values(get().conversations)
        .filter(conversation => conversation.projectDir && conversation.sessionFile && (!path || conversation.projectDir === path))
        .map(conversation => [conversation.sessionFile!, conversation.projectDir!]));
      if (active && get().activeSessionFile && (!path || active === path)) affected.set(get().activeSessionFile!, active);
      await Promise.all([...affected].map(([session, project]) => get().refreshSession(project, session)));
      const current = get().activeProjectPath;
      const trust = get().trust;
      if (current && (!path || current === path) && trust && (!trust.required || trust.trusted)) await warmProject(set, get, current);
    })();
    restarts.set(key, run);
    void run.finally(() => { if (restarts.get(key) === run) restarts.delete(key); }).catch(() => {});
    return run;
  }
  return {
    ready: false,
    projects: [],
    activeProjectPath: null,
    piStatus: {},

    init: async () => {
      const loaded = await rpc.request.loadState({});
      replaceLastChats(get, loaded.lastChatByProject ?? {});
      const reopenLastProject = loaded.reopenLastProject ?? true;
      const restoreProject = reopenLastProject ? (loaded.lastProjectPath ?? null) : null;
      const focusStartedAt = loaded.focusStartedAt ?? new Date().toISOString();
      set({
        ready: true,
        projects: loaded.projects,
        drafts: loaded.drafts ?? {},
        favoriteModels: loaded.favoriteModels ?? [],
        commitMessageModel: loaded.commitMessageModel,
        pinnedChats: loaded.pinnedChats ?? [],
        finishedChats: loaded.finishedChats ?? {},
        focusedChats: loaded.focusedChats ?? [],
        focusStartedAt,
        activeProjectPath: restoreProject,
        reopenLastProject,
        preferences: loaded.preferences,
        keybindingOverrides: sanitizeOverrides(loaded.keybindingOverrides ?? {}),
        sidebarOpen: loaded.panes?.sidebarOpen ?? true,
        sidebarWidth: loaded.panes?.sidebarWidth ?? 304,
        contextPaneWidth: loaded.panes?.contextPaneWidth ?? 304,
        terminalHeight: loaded.panes?.terminalHeight,
        contextPaneOpen: loaded.panes?.contextPaneOpen ?? false,
        contextPaneChosen: loaded.panes !== undefined,
      });
      if (!loaded.focusStartedAt) persist(get);
      if (!restoreProject) void get().loadProviders().catch(() => {});
      // Read once as well as subscribing: the first check runs while the window
      // is still loading, so its result may already have been pushed and missed.
      void rpc.request.updateState({}).then((update) => get().onUpdateState(update));
      if (restoreProject) await get().selectProject(restoreProject);
    },

    addProject: async () => {
      const { path } = await rpc.request.pickProject({});
      if (path) await get().openProjectPath(path);
    },

    openProjectPath: async (path) => {
      rememberProject(set, get, path);
      await get().selectProject(path);
    },

    removeProject: async (path) => {
      // Stop any turn still running in this project before its state goes away,
      // whether or not the project is the one on screen.
      for (const conversation of Object.values(get().conversations)) {
        if (conversation.projectDir === path && (conversation.running || conversation.pending.length > 0)) {
          await rpc.request.abort({ projectDir: path, sessionFile: conversation.sessionFile });
        }
      }
      await rpc.request.terminalCloseProject({ projectDir: path });
      await rpc.request.unwatchProjectSessions({ projectDir: path });
      set((s) => {
        const conversations = Object.fromEntries(
          Object.entries(s.conversations).filter(([, conversation]) => conversation.projectDir !== path),
        );
        const terminalProjects = new Set(s.terminalProjects);
        terminalProjects.delete(path);
        return { projects: s.projects.filter((p) => p.path !== path), conversations, terminalProjects };
      });
      if (get().activeProjectPath === path) {
        const next = get().projects[0]?.path ?? null;
        set({ activeProjectPath: next, activeSessionFile: null, isNewChat: false });
        if (next) await get().selectProject(next);
      }
      persist(get);
    },

    selectProject: async (path) => {
      const folder = enterProjectFolder(set, get, path);

      // A chat still running in this project wins over the last-opened one: the
      // user coming back mid-run should land on the run, not beside it.
      const runningConv = Object.values(get().conversations).find(
        (conversation) => conversation.projectDir === path && conversation.running && conversation.sessionFile,
      );
      const last = runningConv?.sessionFile || getLastChat(get, path);
      const historyLoaded = get().sessionLoadStates[path] === "loaded";
      let selectedRememberedChat = false;
      if (last && (!historyLoaded || get().sessionsByProject[path]?.some((session) => session.path === last))) {
        if (!historyLoaded) {
          set((state) => ({ sessionLoadStates: { ...state.sessionLoadStates, [path]: "loading" } }));
        }
        try {
          await get().selectChat(last);
          selectedRememberedChat = folder.stillSelected() && get().activeSessionFile === last;
        } catch {
          forgetLastChat(get, path);
        }
      }
      if (!selectedRememberedChat && folder.stillSelected()) {
        const selected = selectionGuard(get);
        if (!historyLoaded) await get().refreshSessions(path);
        if (!selected()) return;
        if (!folder.stillSelected()) return;
        const sessions = get().sessionsByProject[path] ?? [];
        if (sessions[0]) await get().selectChat(sessions[0].path);
        else get().newChat();
      }

      await applyFolderTrust(set, get, path, folder);
      if (selectedRememberedChat && !historyLoaded) void get().refreshSessions(path);
    },

    selectAdjacentProject: async (direction) => {
      const s = get();
      if (s.projects.length < 2) return;
      const current = s.projects.findIndex((project) => project.path === s.activeProjectPath);
      const index = (current + direction + s.projects.length) % s.projects.length;
      const next = s.projects[index];
      if (!next || next.path === s.activeProjectPath) return;
      showHint(next.name);
      await get().selectProject(next.path);
    },

    restartPi: async (target) => {
      const path = target ?? get().activeProjectPath;
      if (!path) return;
      try { await restart(path); } catch (error) {
        const session = get().activeProjectPath === path ? get().activeSessionFile : null;
        if (!(error instanceof ModelStateReadError) && !(error instanceof RestartRequestError)) patchConversation(set, path, session, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    restartAllPi: async () => { await restart(); },

    onStatus: (projectDir, status) => {
      set((s) => ({ piStatus: { ...s.piStatus, [projectDir]: status } }));
    },
  };
};
