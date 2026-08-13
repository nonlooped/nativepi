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
} from "./internals.ts";
import { type SliceCreator, type WorkspaceSlice } from "./types.ts";

export const createWorkspaceSlice: SliceCreator<WorkspaceSlice> = (set, get) => ({
  ready: false,
  projects: [],
  activeProjectPath: null,
  piStatus: {},

  init: async () => {
    const loaded = await rpc.request.loadState({});
    replaceLastChats(loaded.lastChatByProject ?? {});
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
      sidebarSize: loaded.panes?.sidebarSize ?? 14,
      contextPaneOpen: loaded.panes?.contextPaneOpen ?? false,
      // Only a saved preference counts as a choice; on a first run NativePi
      // may open the pane itself once it knows the repo has changes.
      contextPaneChosen: loaded.panes !== undefined,
    });
    if (!loaded.focusStartedAt) persist(get);
    if (!restoreProject) void get().loadProviders();
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
    const last = runningConv?.sessionFile || getLastChat(path);
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
        forgetLastChat(path);
      }
    }
    if (!selectedRememberedChat && folder.stillSelected()) {
      if (!historyLoaded) await get().refreshSessions(path);
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

  restartPi: async () => {
    const path = get().activeProjectPath;
    if (!path) return;
    set((s) => ({
      conversations: Object.fromEntries(
        Object.entries(s.conversations).map(([key, conversation]) =>
          conversation.projectDir === path
            ? [key, { ...conversation, running: false, runStartedAt: null, error: undefined, errorRecovery: undefined }]
            : [key, conversation],
        ),
      ),
    }));
    await rpc.request.restartPi({ projectDir: path });
    if (get().activeProjectPath === path) warmProject(set, get, path);
  },

  onStatus: (projectDir, status) => {
    set((s) => ({ piStatus: { ...s.piStatus, [projectDir]: status } }));
  },
});
