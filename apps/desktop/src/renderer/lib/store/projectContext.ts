import { rpc } from "../rpc.ts";
import { showHint } from "../toast.tsx";
import { dropAllSurfaces, dropSurface, writeSurface } from "../tuiSurfaces.ts";
import { markGitRefreshed, persist } from "./internals.ts";
import { NO_EXTENSION_UI_STATE, type ProjectContextSlice, type SliceCreator } from "./types.ts";

export const createProjectContextSlice: SliceCreator<ProjectContextSlice> = (set, get) => ({
  git: null,
  extPrompts: [],
  extStatuses: {},
  extWidgets: {},
  extRenderers: [],
  extLoadErrors: [],
  extSurfaces: [],
  extTriggers: [],
  extUiState: NO_EXTENSION_UI_STATE,

  refreshGit: async () => {
    const path = get().activeProjectPath;
    if (!path) return;
    markGitRefreshed();
    const { status } = await rpc.request.gitStatus({ projectDir: path });
    if (get().activeProjectPath !== path) return;
    set({ git: status });
    // First run only: a repo that already has changes is the one case where
    // opening the pane unprompted tells the user something they wanted to know.
    if (!get().contextPaneChosen && status.isRepo && status.files.length > 0) {
      set({ contextPaneOpen: true, contextPaneChosen: true });
      persist(get);
    }
  },

  switchBranch: async (branch, create) => {
    const path = get().activeProjectPath;
    if (!path) return { ok: false, error: "No project is open." };
    const res = await rpc.request.gitCheckout({ projectDir: path, branch, create });
    if (!res.ok) return res;
    if (get().activeProjectPath === path) {
      await get().refreshGit();
      showHint(branch);
    }
    return res;
  },

  // Extensions are loaded by Pi at startup, so a reload is a restart.
  reloadExtensions: async () => get().restartPi(),

  respondExtension: ({ value, confirmed, cancel }) => {
    const s = get();
    const current = s.extPrompts[0];
    const projectDir = s.activeProjectPath;
    if (!current || !projectDir) return;
    const response = cancel
      ? ({ type: "extension_ui_response", id: current.id, cancelled: true } as const)
      : current.method === "confirm"
        ? ({ type: "extension_ui_response", id: current.id, confirmed: confirmed ?? false } as const)
        : ({ type: "extension_ui_response", id: current.id, value: value ?? "" } as const);
    void rpc.request.extensionRespond({ projectDir, response });
    set({ extPrompts: s.extPrompts.slice(1) });
  },

  /**
   * Fold a pi-tui frame into the window.
   *
   * Drawing does not pass through here: `writeSurface` hands it to the pane's
   * terminal, which is written to rather than re-rendered, and a store update per
   * keystroke would re-render the window around it. What the store keeps is the
   * list of surfaces to mount and the chrome an extension has changed.
   *
   * Only the project on screen is folded in, for the reason the extension prompts
   * are: a background project's footer has nothing to attach to.
   */
  onTuiFrame: ({ projectDir, frame }) => {
    if (projectDir !== get().activeProjectPath) return;
    switch (frame.type) {
      case "nativepi_tui_open":
        set((s) => ({ extSurfaces: [...s.extSurfaces, frame.surface] }));
        return;
      case "nativepi_tui_write":
        writeSurface(frame.surfaceId, frame.data);
        return;
      case "nativepi_tui_close":
        dropSurface(frame.surfaceId);
        set((s) => ({ extSurfaces: s.extSurfaces.filter((surface) => surface.id !== frame.surfaceId) }));
        return;
      case "nativepi_tui_reset":
        dropAllSurfaces();
        set({ extSurfaces: [], extTriggers: [], extUiState: NO_EXTENSION_UI_STATE });
        return;
      case "nativepi_tui_triggers":
        set({ extTriggers: frame.characters });
        return;
      // A patch carries only the fields the extension set, and `null` is a value
      // in three of them — "restore the default" — so absence is the only thing
      // that means "leave this alone".
      case "nativepi_tui_state":
        set((s) => ({ extUiState: { ...s.extUiState, ...frame.state } }));
        return;
      case "nativepi_tui_paste":
        get().insertIntoComposer(frame.text);
        return;
    }
  },
});
