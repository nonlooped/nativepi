import { DEFAULT_PREFERENCES } from "../../../shared/rpc-schema.ts";
import { isRemote, rpc } from "../rpc.ts";
import { showUpdateNotice } from "../toast.tsx";
import { persist } from "./internals.ts";
import type { SliceCreator, UiSlice } from "./types.ts";

// `crypto.randomUUID` is unavailable in a plain-HTTP context, which a LAN link
// deliberately is; these ids only tell one list's rows apart.
let handoffId = 0;

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  settingsOpen: false,
  sidebarSize: 18,
  sidebarOpen: true,
  reopenLastProject: true,
  contextPaneOpen: false,
  contextPaneChosen: false,
  jumpRequest: 0,
  searchFocusRequest: 0,
  branchMenuRequested: false,
  terminalProjects: new Set(),
  preferences: DEFAULT_PREFERENCES,
  update: { status: "unsupported" },
  accessHandoffs: [],

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  setSidebarSize: (sidebarSize) => {
    set({ sidebarSize });
    persist(get);
  },

  setSidebarOpen: (sidebarOpen) => {
    set({ sidebarOpen });
    persist(get);
  },

  toggleSidebar: () => {
    set((s) => ({ sidebarOpen: !s.sidebarOpen }));
    persist(get);
  },

  setReopenLastProject: (reopenLastProject) => {
    set({ reopenLastProject });
    persist(get);
  },

  setPreference: (key, value) => {
    set((s) => ({ preferences: { ...s.preferences, [key]: value } }));
    persist(get);
  },

  toggleContextPane: () => {
    set((s) => ({ contextPaneOpen: !s.contextPaneOpen, contextPaneChosen: true }));
    persist(get);
  },

  // Counters, not booleans: the view acts on each increment, so two consecutive
  // requests for the same thing are two separate scrolls rather than one.
  requestJumpToLatest: () => set((s) => ({ jumpRequest: s.jumpRequest + 1 })),
  requestSearchFocus: () => set((s) => ({ searchFocusRequest: s.searchFocusRequest + 1 })),
  requestBranchMenu: () => {
    const projectPath = get().activeProjectPath;
    if (!projectPath || get().conversations[projectPath]?.running) return;
    set({ branchMenuRequested: true });
  },
  consumeBranchMenuRequest: () => set({ branchMenuRequested: false }),
  openTerminal: (projectPath) =>
    set((s) => ({ terminalProjects: new Set(s.terminalProjects).add(projectPath) })),
  toggleTerminal: (projectPath) =>
    set((s) => {
      const terminalProjects = new Set(s.terminalProjects);
      if (terminalProjects.has(projectPath)) terminalProjects.delete(projectPath);
      else terminalProjects.add(projectPath);
      return { terminalProjects };
    }),

  // Kept in the store rather than in the settings screen: closing Settings
  // unmounts that screen, and the account of where a link has gone is about the
  // window's whole session rather than one visit to a panel.
  recordAccessHandoff: (kind, scope, link) => {
    set((s) => ({
      accessHandoffs: [{ id: String(++handoffId), kind, scope, link, at: Date.now() }, ...s.accessHandoffs],
    }));
  },

  onUpdateState: (update) => {
    const previousStatus = get().update.status;
    set({ update });
    // A browser reaching NativePi over the local server is not the machine the
    // installer would run on, and its user is not the one who should be asked
    // to restart the desktop app. It hears nothing about updates.
    if (isRemote) return;
    showUpdateNotice(update, previousStatus, {
      download: () => void get().downloadUpdate(),
      install: () => void get().installUpdate(),
    });
  },

  // Each of these reports its outcome through the `updateState` event rather
  // than its return value, so a check started from Settings and one started by
  // the timer land in exactly the same place.
  checkForUpdate: async () => {
    await rpc.request.checkForUpdate({});
  },
  downloadUpdate: async () => {
    await rpc.request.downloadUpdate({});
  },
  installUpdate: async () => {
    await rpc.request.installUpdate({});
  },
});
