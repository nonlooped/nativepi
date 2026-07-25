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

  toggleContextPane: () => {
    set((s) => ({ contextPaneOpen: !s.contextPaneOpen, contextPaneChosen: true }));
    persist(get);
  },

  // Counters, not booleans: the view acts on each increment, so two consecutive
  // requests for the same thing are two separate scrolls rather than one.
  requestJumpToLatest: () => set((s) => ({ jumpRequest: s.jumpRequest + 1 })),
  requestSearchFocus: () => set((s) => ({ searchFocusRequest: s.searchFocusRequest + 1 })),
});
