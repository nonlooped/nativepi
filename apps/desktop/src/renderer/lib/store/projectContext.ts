import { insertAtComposerCaret } from "../composerInsert.ts";
import { rpc } from "../rpc.ts";
import { showHint } from "../toast.tsx";
import { dropAllSurfaces, dropSurface, writeSurface } from "../tuiSurfaces.ts";
import { markGitRefreshed, persist } from "./internals.ts";
import { NO_EXTENSION_UI_STATE, type ProjectContextSlice, type SliceCreator } from "./types.ts";

export const createProjectContextSlice: SliceCreator<ProjectContextSlice> = (set, get) => ({
  git: null,
  repoHost: undefined,
  extPrompts: [],
  extensionPromptsByProject: {},
  extStatuses: {},
  extWidgets: {},
  extRenderers: [],
  extLoadErrors: [],
  extSurfaces: [],
  extTriggers: [],
  extUiState: NO_EXTENSION_UI_STATE,
  recentFilesByProject: {},

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

  refreshRepoHost: async () => {
    const path = get().activeProjectPath;
    if (!path) return;
    const { context } = await rpc.request.repoHostContext({ projectDir: path });
    if (get().activeProjectPath !== path) return;
    set({ repoHost: context });
  },

  switchBranch: async (branch, create) => {
    const path = get().activeProjectPath;
    if (!path) return { ok: false, error: "No project is open." };
    const res = await rpc.request.gitCheckout({ projectDir: path, branch, create });
    if (!res.ok) return res;
    if (get().activeProjectPath === path) {
      await get().refreshGit();
      await get().refreshRepoHost();
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
    const prompts = s.extPrompts.slice(1);
    set({
      extPrompts: prompts,
      extensionPromptsByProject: { ...s.extensionPromptsByProject, [projectDir]: prompts },
    });
    void rpc.request.extensionRespond({ projectDir, sessionFile: s.activeSessionFile, response });
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
  onTuiFrame: ({ projectDir, sessionFile, frame }) => {
    if (projectDir !== get().activeProjectPath || (sessionFile && sessionFile !== get().activeSessionFile)) return;
    switch (frame.type) {
      // Keyed by id rather than appended: a resync re-announces surfaces the
      // window may still be holding, and the same pane twice is not two panes.
      case "nativepi_tui_open":
        set((s) => ({
          extSurfaces: [...s.extSurfaces.filter((surface) => surface.id !== frame.surface.id), frame.surface],
        }));
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
      // At the caret where there is one, which is what `pasteToEditor` means in
      // the terminal: an extension completing a path mid-sentence is not asking
      // for a new paragraph at the end of the draft.
      case "nativepi_tui_paste":
        if (!insertAtComposerCaret(frame.text)) get().insertIntoComposer(frame.text);
        return;
    }
  },

  recordFileOpened: (projectPath, path) => {
    set((s) => {
      const existing = s.recentFilesByProject[projectPath] ?? [];
      const prior = existing.find((f) => f.path === path);
      const entry = { path, lastOpenedAt: Date.now(), openCount: (prior?.openCount ?? 0) + 1 };
      const rest = existing.filter((f) => f.path !== path);
      return { recentFilesByProject: { ...s.recentFilesByProject, [projectPath]: [entry, ...rest].slice(0, 30) } };
    });
    persist(get);
  },
});
