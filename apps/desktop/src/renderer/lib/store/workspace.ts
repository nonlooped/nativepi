import { rpc } from "../rpc.ts";
import { showHint } from "../toast.ts";
import {
  emptyConversation,
  getLastChat,
  persist,
  replaceLastChats,
  warmProject,
} from "./internals.ts";
import type { SliceCreator, WorkspaceSlice } from "./types.ts";

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
    set({
      ready: true,
      projects: loaded.projects,
      drafts: loaded.drafts ?? {},
      favoriteModels: loaded.favoriteModels ?? [],
      activeProjectPath: restoreProject,
      reopenLastProject,
      sidebarOpen: loaded.panes?.sidebarOpen ?? true,
      sidebarSize: loaded.panes?.sidebarSize ?? 18,
      contextPaneOpen: loaded.panes?.contextPaneOpen ?? false,
      // Only a saved preference counts as a choice; on a first run NativePi
      // may open the pane itself once it knows the repo has changes.
      contextPaneChosen: loaded.panes !== undefined,
    });
    void get().loadProviders();
    if (restoreProject) await get().selectProject(restoreProject);
  },

  addProject: async () => {
    const { path } = await rpc.request.pickProject({});
    if (!path) return;
    const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
    if (!get().projects.some((p) => p.path === path)) {
      set((s) => ({ projects: [...s.projects, { path, name }] }));
      persist(get);
    }
    await get().selectProject(path);
  },

  removeProject: async (path) => {
    // Stop any turn still running in this project before its transcript goes
    // away, so the agent isn't left editing files with nothing on screen.
    if (get().running && get().activeProjectPath === path) {
      await rpc.request.abort({ projectDir: path });
    }
    set((s) => ({ projects: s.projects.filter((p) => p.path !== path) }));
    if (get().activeProjectPath === path) {
      const next = get().projects[0]?.path ?? null;
      set({ activeProjectPath: next, activeSessionFile: null, entries: [], isNewChat: false });
      if (next) await get().selectProject(next);
    }
    persist(get);
  },

  selectProject: async (path) => {
    set({
      activeProjectPath: path,
      activeSessionFile: null,
      isNewChat: false,
      ...emptyConversation(),
      models: [],
      model: undefined,
      thinkingLevels: ["off"],
      trustPrompt: null,
      trust: null,
      git: null,
      extPrompts: [],
      extStatuses: {},
      extWidgets: {},
      extRenderers: [],
      extLoadErrors: [],
    });
    persist(get);

    await get().refreshSessions(path);

    const last = getLastChat(path);
    const sessions = get().sessionsByProject[path] ?? [];
    if (last && sessions.some((s) => s.path === last)) {
      await get().selectChat(last);
    } else if (sessions[0]) {
      await get().selectChat(sessions[0].path);
    } else {
      get().newChat();
    }

    // A project with local extensions/skills needs a trust decision before Pi
    // loads them. Ask first; warm Pi only once the user has decided.
    const trust = await rpc.request.checkTrust({ projectDir: path });
    if (get().activeProjectPath !== path) return;
    set({ trust });
    if (trust.required && !trust.trusted) {
      set({ trustPrompt: { projectPath: path } });
    } else {
      warmProject(set, get, path);
    }
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
    set({ error: undefined, errorRecovery: undefined });
    await rpc.request.restartPi({ projectDir: path });
    if (get().activeProjectPath === path) warmProject(set, get, path);
  },

  onStatus: (projectDir, status) => {
    set((s) => ({ piStatus: { ...s.piStatus, [projectDir]: status } }));
  },
});
