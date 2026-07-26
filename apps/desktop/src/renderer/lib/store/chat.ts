import type { SessionEntry } from "../../../shared/pi-types.ts";
import type { ExtensionUiRequest } from "../../../shared/pi-types.ts";
import { rpc } from "../rpc.ts";
import { applyExtensionUi, reduce, sessionInfoName } from "./events.ts";
import {
  draftKey,
  emptyConversation,
  forgetLastChat,
  getLastChat,
  gitRefreshedWithin,
  persist,
  setLastChat,
} from "./internals.ts";
import type { ChatSlice, PendingMessage, SliceCreator } from "./types.ts";

let pendingId = 1;

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => ({
  sessionsByProject: {},
  activeSessionFile: null,
  isNewChat: false,
  ...emptyConversation(),
  sendBehavior: "followUp",
  drafts: {},

  refreshSessions: async (projectPath) => {
    const { sessions } = await rpc.request.listSessions({ projectDir: projectPath });
    if (get().activeProjectPath !== projectPath) return;
    set((s) => ({ sessionsByProject: { ...s.sessionsByProject, [projectPath]: sessions } }));
  },

  selectChat: async (sessionFile) => {
    set({ activeSessionFile: sessionFile, isNewChat: false, ...emptyConversation() });
    const projectPath = get().activeProjectPath;
    if (projectPath) {
      setLastChat(projectPath, sessionFile);
      persist(get);
      // Watch the chat being viewed for writes from another NativePi window or
      // a Pi CLI in a terminal.
      void rpc.request.watchSession({ projectDir: projectPath, sessionFile });
    }
    const { entries } = await rpc.request.readSession({ sessionFile });
    if (get().activeSessionFile !== sessionFile) return;
    set({
      entries: entries.filter((e): e is SessionEntry => e.type !== "session"),
      sessionName: sessionInfoName(entries),
    });
  },

  newChat: () => {
    const projectDir = get().activeProjectPath;
    if (projectDir) void rpc.request.watchSession({ projectDir, sessionFile: null });
    set({
      activeSessionFile: null,
      isNewChat: true,
      sessionName: undefined,
      ...emptyConversation(),
    });
  },

  importSession: async () => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return;
    const res = await rpc.request.importSession({ projectDir });
    if (res.canceled) return;
    if (!res.ok || !res.sessionFile) {
      set({ error: res.error ?? "Failed to import chat" });
      return;
    }
    await get().refreshSessions(projectDir);
    if (get().activeProjectPath === projectDir) await get().selectChat(res.sessionFile);
  },

  setSendBehavior: (sendBehavior) => set({ sendBehavior }),

  setDraft: (text) => {
    const key = draftKey(get);
    set((s) => ({ drafts: { ...s.drafts, [key]: text } }));
    persist(get);
  },

  send: async () => {
    const s = get();
    const projectDir = s.activeProjectPath;
    // Section 16: while another writer owns this chat we send nothing, and the
    // draft stays exactly where the user left it.
    if (!projectDir || s.externalChange) return;
    const key = draftKey(get);
    const text = (s.drafts[key] ?? "").trim();
    if (!text) return;

    const pendingEntry: PendingMessage = { id: pendingId++, text };
    set((st) => ({
      pending: [...st.pending, pendingEntry],
      drafts: { ...st.drafts, [key]: "" },
      error: undefined,
      errorRecovery: undefined,
      runStartedAt: Date.now(),
    }));
    persist(get);

    const res = await rpc.request.submit({ projectDir, sessionFile: s.activeSessionFile, message: text });
    if (!res.ok) {
      set((st) => ({
        pending: st.pending.filter((p) => p.id !== pendingEntry.id),
        drafts: { ...st.drafts, [key]: text },
        error: res.error ?? "Failed to send",
        errorRecovery: "retrySend",
        runStartedAt: null,
      }));
      return;
    }
    if (res.sessionFile && get().activeSessionFile !== res.sessionFile) {
      set({ activeSessionFile: res.sessionFile, isNewChat: false });
      if (get().activeProjectPath) setLastChat(projectDir, res.sessionFile);
      persist(get);
      void rpc.request.watchSession({ projectDir, sessionFile: res.sessionFile });
      void get().refreshSessions(projectDir);
    }
  },

  enqueue: async (behavior) => {
    const s = get();
    const projectDir = s.activeProjectPath;
    if (!projectDir || s.externalChange) return;
    const key = draftKey(get);
    const text = (s.drafts[key] ?? "").trim();
    if (!text) return;

    // No optimistic entry: Pi echoes the queued message back via queue_update,
    // which is the source of truth for what's pending.
    set((st) => ({ drafts: { ...st.drafts, [key]: "" }, error: undefined }));
    persist(get);

    const res = await rpc.request.enqueue({ projectDir, behavior, message: text });
    if (!res.ok) {
      set((st) => ({
        drafts: { ...st.drafts, [key]: text },
        error: res.error ?? "Failed to queue message",
        errorRecovery: "retrySend",
      }));
    }
  },

  abort: () => {
    const projectDir = get().activeProjectPath;
    if (projectDir) void rpc.request.abort({ projectDir });
  },

  abortRetry: () => {
    const projectDir = get().activeProjectPath;
    if (projectDir) void rpc.request.abortRetry({ projectDir });
  },

  renameChat: async (sessionFile, name) => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return { ok: false, error: "No active project" };
    const res = await rpc.request.renameChat({ projectDir, sessionFile, name });
    if (res.ok) {
      await get().refreshSessions(projectDir);
      if (get().activeSessionFile === sessionFile) set({ sessionName: name });
    }
    return res;
  },

  cloneChat: async (sessionFile) => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return { ok: false, error: "No active project" };
    const res = await rpc.request.cloneChat({ projectDir, sessionFile });
    if (res.ok && res.sessionFile) {
      await get().refreshSessions(projectDir);
      await get().selectChat(res.sessionFile);
    }
    return res;
  },

  deleteChat: async (sessionFile) => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return { ok: false, error: "No active project" };
    const res = await rpc.request.deleteChat({ projectDir, sessionFile });
    if (!res.ok) return res;

    if (getLastChat(projectDir) === sessionFile) forgetLastChat(projectDir);
    set((s) => {
      const { [sessionFile]: _draft, ...drafts } = s.drafts;
      return { drafts };
    });
    await get().refreshSessions(projectDir);
    if (get().activeSessionFile === sessionFile) {
      const next = get().sessionsByProject[projectDir]?.[0];
      if (next) await get().selectChat(next.path);
      else get().newChat();
    }
    persist(get);
    return { ok: true };
  },

  forkChat: async (sessionFile, entryId) => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return { ok: false, error: "No active project" };
    const res = await rpc.request.forkChat({ projectDir, sessionFile, entryId });
    if (res.ok && res.sessionFile) {
      if (res.text) set((s) => ({ drafts: { ...s.drafts, [res.sessionFile!]: res.text! } }));
      await get().refreshSessions(projectDir);
      await get().selectChat(res.sessionFile);
    }
    return res;
  },

  compactActive: async () => {
    const s = get();
    if (!s.activeProjectPath || !s.activeSessionFile) return;
    await rpc.request.compact({ projectDir: s.activeProjectPath, sessionFile: s.activeSessionFile });
  },

  reloadActiveSession: async () => {
    const sessionFile = get().activeSessionFile;
    if (!sessionFile) return;
    set({ externalChange: null });
    await get().selectChat(sessionFile);
    const projectDir = get().activeProjectPath;
    if (projectDir) await get().refreshSessions(projectDir);
  },

  clearError: () => set({ error: undefined, errorRecovery: undefined }),

  onEvent: ({ projectDir, sessionFile, event }) => {
    const s = get();
    if (projectDir !== s.activeProjectPath) return;
    if (event.type === "extension_ui_request") {
      applyExtensionUi(set, get, event as ExtensionUiRequest);
      return;
    }
    if (sessionFile && s.activeSessionFile && sessionFile !== s.activeSessionFile) return;
    // Files change throughout a turn, not only at its end: refresh as messages
    // land, so the changes pane is live rather than stale for the whole
    // duration of a run. Rate-limited here rather than in refreshGit, so an
    // explicit Refresh click is never swallowed.
    if (event.type === "agent_settled") void get().refreshGit();
    else if (event.type === "message_end" && !gitRefreshedWithin(1000)) void get().refreshGit();
    set(reduce(s, event));
  },

  onPiError: (projectDir, message) => {
    if (projectDir !== get().activeProjectPath) return;
    // The draft was cleared by the submit that succeeded, so there is nothing
    // to re-send; restarting Pi is the recovery that actually applies.
    set({ error: message, errorRecovery: "restartPi", running: false, runStartedAt: null });
  },

  onSessionChangedExternally: ({ projectDir, sessionFile }) => {
    const s = get();
    if (projectDir !== s.activeProjectPath || sessionFile !== s.activeSessionFile) return;
    if (s.running || s.externalChange) return;
    set({ externalChange: { sessionFile } });
  },
});
