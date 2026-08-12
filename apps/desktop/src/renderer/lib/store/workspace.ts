import { rpc } from "../rpc.ts";
import { sanitizeOverrides } from "../shortcuts.ts";
import { showHint } from "../toast.tsx";
import { dropAllSurfaces } from "../tuiSurfaces.ts";
import {
  forgetLastChat,
  getLastChat,
  persist,
  replaceLastChats,
  warmProject,
} from "./internals.ts";
import { NO_EXTENSION_UI_STATE, type SliceCreator, type WorkspaceSlice } from "./types.ts";

let projectSelection = 0;

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
    const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
    if (!get().projects.some((p) => p.path === path)) {
      set((s) => ({ projects: [...s.projects, { path, name }] }));
      persist(get);
    }
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
    const selection = ++projectSelection;
    const stillSelected = () => selection === projectSelection && get().activeProjectPath === path;
    // The previous project's conversation is left alone: it keeps folding in
    // events while off screen, and is picked back up on return.
    const extPrompts = get().extensionPromptsByProject[path] ?? [];
    set({
      activeProjectPath: path,
      activeSessionFile: null,
      isNewChat: false,
      models: [],
      model: undefined,
      thinkingLevels: ["off"],
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
    });
    // The panes belonged to the project being left, and their components belong
    // to a Pi that is still running. Nothing about them arrives again on its own —
    // the frame that opened each one was sent once, to a window that has now
    // forgotten it — so the project being entered is asked to say it all again.
    // A project whose Pi is not running yet has nothing to answer, and the
    // surfaces open normally when it starts.
    dropAllSurfaces();
    void rpc.request.tuiSend({ projectDir: path, sessionFile: get().activeSessionFile, frame: { type: "nativepi_tui_sync" } }).catch(() => {});
    persist(get);

    // The trust check does not depend on the session list, and a round trip
    // costs ~200ms over the public tunnel against nothing on the desktop, so it
    // goes out alongside rather than after. Rejections are handled at the await
    // below; the no-op catch only stops the gap counting as unhandled.
    const trustCheck = rpc.request.checkTrust({ projectDir: path });
    trustCheck.catch(() => {});

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
        selectedRememberedChat = stillSelected() && get().activeSessionFile === last;
      } catch {
        forgetLastChat(path);
      }
    }
    if (!selectedRememberedChat && stillSelected()) {
      if (!historyLoaded) await get().refreshSessions(path);
      const sessions = get().sessionsByProject[path] ?? [];
      if (sessions[0]) await get().selectChat(sessions[0].path);
      else get().newChat();
    }

    // A project with local extensions/skills needs a trust decision before Pi
    // loads them. Ask first; warm Pi only once the user has decided.
    const trust = await trustCheck;
    if (!stillSelected()) return;
    set({ trust });
    if (trust.required && !trust.trusted) {
      set({ trustPrompt: { projectPath: path } });
    } else {
      warmProject(set, get, path);
    }
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
