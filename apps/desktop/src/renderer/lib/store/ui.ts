import { DEFAULT_PREFERENCES } from "../../../shared/rpc-schema.ts";
import { persist } from "./internals.ts";
import type { SliceCreator, UiSlice } from "./types.ts";

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  settingsOpen: false,
  sidebarSize: 18,
  sidebarOpen: true,
  reopenLastProject: true,
  contextPaneOpen: false,
  contextPaneChosen: false,
  jumpRequest: 0,
  searchFocusRequest: 0,
  terminalProjects: new Set(),
  preferences: DEFAULT_PREFERENCES,

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
  openTerminal: (projectPath) =>
    set((s) => ({ terminalProjects: new Set(s.terminalProjects).add(projectPath) })),
  toggleTerminal: (projectPath) =>
    set((s) => {
      const terminalProjects = new Set(s.terminalProjects);
      if (terminalProjects.has(projectPath)) terminalProjects.delete(projectPath);
      else terminalProjects.add(projectPath);
      return { terminalProjects };
    }),
});
