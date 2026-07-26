import { rpc } from "../rpc.ts";
import { showHint } from "../toast.ts";
import { markGitRefreshed, persist } from "./internals.ts";
import type { ProjectContextSlice, SliceCreator } from "./types.ts";

export const createProjectContextSlice: SliceCreator<ProjectContextSlice> = (set, get) => ({
  git: null,
  extPrompts: [],
  extStatuses: {},
  extWidgets: {},
  extRenderers: [],
  extLoadErrors: [],

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

  // A worktree is a second checkout in its own directory, which is precisely
  // what a NativePi project already is — so it becomes one, with its own Pi and
  // its own chats, rather than a second notion of "where work happens".
  branchInWorktree: async (branch, create) => {
    const path = get().activeProjectPath;
    if (!path) return { ok: false, error: "No project is open." };
    const res = await rpc.request.gitAddWorktree({ projectDir: path, branch, create });
    if (!res.ok || !res.path) return { ok: false, error: res.error };
    await get().openProjectPath(res.path);
    return { ok: true };
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
});
