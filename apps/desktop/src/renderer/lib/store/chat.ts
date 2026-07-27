import type { SessionEntry, ThinkingLevel } from "../../../shared/pi-types.ts";
import type { ExtensionUiRequest } from "../../../shared/pi-types.ts";
import { rpc } from "../rpc.ts";
import { conversationFor, emptyConversation, patchConversation } from "./conversation.ts";
import { applyExtensionUi, reduce, sessionInfoName } from "./events.ts";
import {
  draftKey,
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
  conversations: {},
  sendBehavior: "followUp",
  drafts: {},

  refreshSessions: async (projectPath) => {
    const { sessions } = await rpc.request.listSessions({ projectDir: projectPath });
    if (get().activeProjectPath !== projectPath) return;
    set((s) => ({ sessionsByProject: { ...s.sessionsByProject, [projectPath]: sessions } }));
  },

  selectChat: async (sessionFile) => {
    const projectPath = get().activeProjectPath;
    set({ activeSessionFile: sessionFile, isNewChat: false });
    if (projectPath) {
      setLastChat(projectPath, sessionFile);
      persist(get);
      // Watch the chat being viewed for writes from another NativePi window or
      // a Pi CLI in a terminal.
      void rpc.request.watchSession({ projectDir: projectPath, sessionFile });
      // A run already streaming into this chat keeps its live state — this is
      // the path back into a project that kept working in the background, and
      // its conversation has been fed every event in the meantime.
      const conv = get().conversations[projectPath];
      if (conv && conv.sessionFile === sessionFile && (conv.running || conv.error !== undefined)) return;
      patchConversation(set, projectPath, () => ({ ...emptyConversation(), sessionFile }));
    }
    const { entries } = await rpc.request.readSession({ sessionFile });
    if (get().activeSessionFile !== sessionFile || get().activeProjectPath !== projectPath) return;
    if (projectPath) {
      patchConversation(set, projectPath, {
        entries: entries.filter((e): e is SessionEntry => e.type !== "session"),
        sessionName: sessionInfoName(entries),
      });
    }
  },

  newChat: () => {
    const projectDir = get().activeProjectPath;
    if (projectDir) {
      void rpc.request.watchSession({ projectDir, sessionFile: null });
      patchConversation(set, projectDir, () => emptyConversation());
    }
    set({ activeSessionFile: null, isNewChat: true });
  },

  importSession: async () => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return;
    const res = await rpc.request.importSession({ projectDir });
    if (res.canceled) return;
    if (!res.ok || !res.sessionFile) {
      patchConversation(set, projectDir, { error: res.error ?? "Failed to import chat" });
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
    if (!projectDir || conversationFor(s, projectDir).externalChange) return;
    const key = draftKey(get);
    const text = (s.drafts[key] ?? "").trim();
    if (!text) return;

    const pendingEntry: PendingMessage = { id: pendingId++, text };
    patchConversation(set, projectDir, (c) => ({
      pending: [...c.pending, pendingEntry],
      error: undefined,
      errorRecovery: undefined,
      runStartedAt: Date.now(),
    }));
    get().setDraft("");

    const res = await rpc.request.submit({ projectDir, sessionFile: s.activeSessionFile, message: text });
    if (!res.ok) {
      patchConversation(set, projectDir, (c) => ({
        pending: c.pending.filter((p) => p.id !== pendingEntry.id),
        error: res.error ?? "Failed to send",
        errorRecovery: "retrySend",
        runStartedAt: null,
      }));
      set((st) => ({ drafts: { ...st.drafts, [key]: text } }));
      return;
    }
    if (res.sessionFile) {
      patchConversation(set, projectDir, { sessionFile: res.sessionFile });
      setLastChat(projectDir, res.sessionFile);
      persist(get);
      if (get().activeProjectPath === projectDir && get().activeSessionFile !== res.sessionFile) {
        set({ activeSessionFile: res.sessionFile, isNewChat: false });
        void rpc.request.watchSession({ projectDir, sessionFile: res.sessionFile });
        void get().refreshSessions(projectDir);
      }
    }
  },

  enqueue: async (behavior) => {
    const s = get();
    const projectDir = s.activeProjectPath;
    if (!projectDir || conversationFor(s, projectDir).externalChange) return;
    const key = draftKey(get);
    const text = (s.drafts[key] ?? "").trim();
    if (!text) return;

    // No optimistic entry: Pi echoes the queued message back via queue_update,
    // which is the source of truth for what's pending.
    patchConversation(set, projectDir, { error: undefined });
    get().setDraft("");

    const res = await rpc.request.enqueue({ projectDir, behavior, message: text });
    if (!res.ok) {
      patchConversation(set, projectDir, {
        error: res.error ?? "Failed to queue message",
        errorRecovery: "retrySend",
      });
      set((st) => ({ drafts: { ...st.drafts, [key]: text } }));
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
      if (get().activeSessionFile === sessionFile) {
        patchConversation(set, projectDir, { sessionName: name });
      }
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
    const projectDir = get().activeProjectPath;
    if (!sessionFile) return;
    if (projectDir) patchConversation(set, projectDir, { externalChange: null });
    await get().selectChat(sessionFile);
    if (projectDir && get().activeProjectPath === projectDir) await get().refreshSessions(projectDir);
  },

  clearError: () => {
    const projectDir = get().activeProjectPath;
    if (projectDir) patchConversation(set, projectDir, { error: undefined, errorRecovery: undefined });
  },

  onEvent: ({ projectDir, sessionFile, event }) => {
    const s = get();
    if (event.type === "extension_ui_request") {
      // Extension UI (dialogs, statuses, widgets) is chrome for the project on
      // screen; an inactive project's prompts would have nothing to attach to.
      if (projectDir === s.activeProjectPath) applyExtensionUi(set, get, event as ExtensionUiRequest);
      return;
    }
    if (event.type === "thinking_level_changed") {
      if (projectDir === s.activeProjectPath) {
        set({ thinkingLevel: (event as { level: ThinkingLevel }).level });
      }
      return;
    }
    // Every project's events fold into its own conversation, active or not, so
    // a run keeps its state — and its transcript — while another project is on
    // screen. Events for a chat other than the one this runtime belongs to are
    // still dropped, exactly as before.
    const conv = conversationFor(s, projectDir);
    if (sessionFile && conv.sessionFile && sessionFile !== conv.sessionFile) return;
    if (projectDir === s.activeProjectPath) {
      // Files change throughout a turn, not only at its end: refresh as messages
      // land, so the changes pane is live rather than stale for the whole
      // duration of a run. Rate-limited here rather than in refreshGit, so an
      // explicit Refresh click is never swallowed.
      if (event.type === "agent_settled") void get().refreshGit();
      else if (event.type === "message_end" && !gitRefreshedWithin(1000)) void get().refreshGit();
    }
    patchConversation(set, projectDir, reduce(conv, event));
  },

  onPiError: (projectDir, message) => {
    // The draft was cleared by the submit that succeeded, so there is nothing
    // to re-send; restarting Pi is the recovery that actually applies.
    patchConversation(set, projectDir, {
      error: message,
      errorRecovery: "restartPi",
      running: false,
      runStartedAt: null,
    });
  },

  onSessionChangedExternally: ({ projectDir, sessionFile }) => {
    const conv = get().conversations[projectDir];
    if (!conv || sessionFile !== conv.sessionFile) return;
    if (conv.running || conv.externalChange) return;
    patchConversation(set, projectDir, { externalChange: { sessionFile } });
  },
});
