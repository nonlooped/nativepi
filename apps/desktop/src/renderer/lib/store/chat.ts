import type { PiEventBatch, SessionEntry, SessionSummary, ThinkingLevel } from "../../../shared/pi-types.ts";
import type { ExtensionUiRequest } from "../../../shared/pi-types.ts";
import { isRemote, rpc } from "../rpc.ts";
import { conversationFor, emptyConversation, patchConversation } from "./conversation.ts";
import { applyExtensionUi, reduce, sessionInfoName } from "./events.ts";
import {
  draftKey,
  forgetLastChat,
  getLastChat,
  gitRefreshedWithin,
  persist,
  reportDraft,
  setLastChat,
} from "./internals.ts";
import { readAsBase64, toImageContent } from "../attachments.ts";
import { showAttachmentsRejected } from "../toast.tsx";
import { MAX_IMAGE_BYTES } from "../../../shared/images.ts";
import type { ImageAttachment } from "../../../shared/rpc-schema.ts";
import { togglePinnedPath } from "../chatOrganization.ts";
import { dropAllSurfaces } from "../tuiSurfaces.ts";
import { NO_EXTENSION_UI_STATE, type ChatSlice, type Conversation, type GetState, type PendingMessage, type SetState, type SliceCreator } from "./types.ts";

let pendingId = 1;
const MAX_REMOTE_IMAGE_BATCH_BYTES = 48 * 1024 * 1024;
const sessionRefreshes = new Map<string, Promise<void>>();

function patchSidebarSession(set: SetState, projectDir: string, sessionFile: string, patch: Partial<SessionSummary>) {
  set((state) => {
    const sessions = state.sessionsByProject[projectDir];
    const index = sessions?.findIndex((session) => session.path === sessionFile) ?? -1;
    if (index < 0 || !sessions) return {};
    const next = [...sessions];
    next[index] = { ...next[index]!, ...patch };
    return { sessionsByProject: { ...state.sessionsByProject, [projectDir]: next } };
  });
}

function addSidebarSession(set: SetState, projectDir: string, session: SessionSummary) {
  set((state) => {
    const sessions = state.sessionsByProject[projectDir];
    if (!sessions || sessions.some((existing) => existing.path === session.path)) return {};
    return { sessionsByProject: { ...state.sessionsByProject, [projectDir]: [session, ...sessions] } };
  });
}

function removeSidebarSession(set: SetState, get: GetState, projectDir: string, sessionFile: string): SessionSummary | undefined {
  const removed = get().sessionsByProject[projectDir]?.find((session) => session.path === sessionFile);
  set((state) => {
    const sessions = state.sessionsByProject[projectDir];
    if (!sessions || !sessions.some((session) => session.path === sessionFile)) return {};
    return { sessionsByProject: { ...state.sessionsByProject, [projectDir]: sessions.filter((session) => session.path !== sessionFile) } };
  });
  return removed;
}

function clearSessionExtensionUi(set: SetState) {
  dropAllSurfaces();
  set({
    extStatuses: {},
    extWidgets: {},
    extSurfaces: [],
    extTriggers: [],
    extUiState: NO_EXTENSION_UI_STATE,
  });
}

/**
 * Tell the host which draft the composer is showing now.
 *
 * `setDraft` reports every keystroke, which covers editing but not moving: a
 * chat switch changes the composer's contents without anyone typing, and an
 * extension calling the synchronous `ctx.ui.getEditorText()` would otherwise be
 * answered with the chat the user just left until they touched the new one.
 */
function reportActiveDraft(get: GetState): void {
  reportDraft(get().activeProjectPath, get().activeSessionFile, get().drafts[draftKey(get)] ?? "");
}

/**
 * The draft as it would be sent, or null if there is nothing to send.
 *
 * Images count: a screenshot with no words is a message, and refusing it would
 * make the user type something to justify it.
 */
function currentDraft(get: GetState) {
  const state = get();
  const projectDir = state.activeProjectPath;
  if (!projectDir || conversationFor(state, projectDir).externalChange) return null;
  const key = draftKey(get);
  const text = (state.drafts[key] ?? "").trim();
  const images = state.attachments[key] ?? [];
  return text || images.length > 0 ? { state, projectDir, key, text, images } : null;
}

/** Take the images off a draft; `send` and `enqueue` both hand them to Pi. */
function clearAttachments(set: SetState, key: string): void {
  set((s) => {
    const { [key]: _sent, ...rest } = s.attachments;
    return { attachments: rest };
  });
}

/** Put images back under a key without disturbing whatever is there now. */
function addAttachments(set: SetState, key: string, images: ImageAttachment[], atFront = false): void {
  if (images.length === 0) return;
  set((s) => {
    const held = s.attachments[key] ?? [];
    const merged = atFront ? [...images, ...held] : [...held, ...images];
    return { attachments: { ...s.attachments, [key]: merged } };
  });
}

/** One more, or one fewer, batch being read and resized for this draft. */
function countPreparing(set: SetState, key: string, delta: number): void {
  set((s) => {
    const count = (s.preparing[key] ?? 0) + delta;
    if (count > 0) return { preparing: { ...s.preparing, [key]: count } };
    const { [key]: _done, ...rest } = s.preparing;
    return { preparing: rest };
  });
}

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => ({
  sessionsByProject: {},
  sessionLoadStates: {},
  activeSessionFile: null,
  isNewChat: false,
  pinnedChats: [],
  conversations: {},
  sendBehavior: "followUp",
  drafts: {},
  attachments: {},
  preparing: {},

  refreshSessions: (projectPath) => {
    const current = sessionRefreshes.get(projectPath);
    if (current) return current;

    const refresh = (async () => {
      if (get().sessionLoadStates[projectPath] !== "loaded") {
        set((s) => ({ sessionLoadStates: { ...s.sessionLoadStates, [projectPath]: "loading" } }));
      }
      try {
        const { sessions } = await rpc.request.listSessions({ projectDir: projectPath });
        set((s) => ({
          sessionsByProject: { ...s.sessionsByProject, [projectPath]: sessions },
          sessionLoadStates: { ...s.sessionLoadStates, [projectPath]: "loaded" },
        }));
      } catch {
        set((s) => ({ sessionLoadStates: { ...s.sessionLoadStates, [projectPath]: "failed" } }));
      }
    })();

    sessionRefreshes.set(projectPath, refresh);
    void refresh.finally(() => {
      if (sessionRefreshes.get(projectPath) === refresh) sessionRefreshes.delete(projectPath);
    });
    return refresh;
  },

  togglePinnedChat: (sessionFile) => {
    set((s) => ({ pinnedChats: togglePinnedPath(s.pinnedChats, sessionFile) }));
    persist(get);
  },

  selectChat: async (sessionFile) => {
    const projectPath = get().activeProjectPath;
    clearSessionExtensionUi(set);
    set({ activeSessionFile: sessionFile, isNewChat: false });
    reportActiveDraft(get);
    if (projectPath) {
      setLastChat(projectPath, sessionFile);
      persist(get);
      // Watch the chat being viewed for writes from another NativePi window or
      // a Pi CLI in a terminal.
      void rpc.request.watchSession({ projectDir: projectPath, sessionFile });
      void rpc.request.tuiSend({
        projectDir: projectPath,
        sessionFile,
        frame: { type: "nativepi_tui_sync" },
      });
      // A run already streaming into this chat keeps its live state — this is
      // the path back into a project that kept working in the background, and
      // its conversation has been fed every event in the meantime.
      const conv = get().conversations[sessionFile];
      if (conv && (conv.running || conv.error !== undefined)) return;
      patchConversation(set, projectPath, sessionFile, () => ({ ...emptyConversation(), projectDir: projectPath, sessionFile }));
    }
    const { entries } = await rpc.request.readSession({ sessionFile });
    if (get().activeSessionFile !== sessionFile || get().activeProjectPath !== projectPath) return;
    if (projectPath) {
      patchConversation(set, projectPath, sessionFile, {
        entries: entries.filter((e): e is SessionEntry => e.type !== "session"),
        sessionName: sessionInfoName(entries),
      });
    }
  },

  newChat: () => {
    clearSessionExtensionUi(set);
    const projectDir = get().activeProjectPath;
    if (projectDir) {
      void rpc.request.watchSession({ projectDir, sessionFile: null });
      patchConversation(set, projectDir, null, () => ({ ...emptyConversation(), projectDir }));
    }
    set({ activeSessionFile: null, isNewChat: true });
    reportActiveDraft(get);
  },

  importSession: async (targetProjectDir, sourceFile) => {
    const projectDir = targetProjectDir ?? get().activeProjectPath;
    if (!projectDir) return false;
    const targetSessionFile = get().activeProjectPath === projectDir ? get().activeSessionFile : null;
    const res = await rpc.request.importSession({ projectDir, sourceFile });
    if (res.canceled) return false;
    if (!res.ok || !res.sessionFile) {
      patchConversation(set, projectDir, targetSessionFile, { error: res.error ?? "Failed to import chat" });
      return false;
    }
    await get().refreshSessions(projectDir);
    if (get().activeProjectPath === projectDir) await get().selectChat(res.sessionFile);
    return true;
  },

  setSendBehavior: (sendBehavior) => set({ sendBehavior }),

  setDraft: (text) => {
    const key = draftKey(get);
    set((s) => ({ drafts: { ...s.drafts, [key]: text } }));
    persist(get);
    reportDraft(get().activeProjectPath, get().activeSessionFile, text);
  },

  insertIntoComposer: (text) => {
    const current = get().drafts[draftKey(get)] ?? "";
    get().setDraft(current ? `${current}\n${text}` : text);
  },

  quoteInReply: (text) => {
    const quote = text
      .trim()
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join("\n");
    if (quote) get().insertIntoComposer(`${quote}\n\n`);
  },

  askAbout: (text) => {
    const quote = text
      .trim()
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join("\n");
    if (quote) get().insertIntoComposer(`${quote}\n\nWhat should I know about this?`);
  },

  /**
   * Hold images against the draft they were added to.
   *
   * The key is taken before any of the reading starts and kept: the user can
   * switch chat or project while a drop is being read and resized, and an image
   * that followed them would be attached to a conversation they never dropped it
   * on — and sent there. The draft it belongs to is the one that was open when
   * they let go.
   *
   * Anything too large to be worth sending is refused here rather than being
   * read: `readAsDataURL` on a 400 MB file costs the renderer that much memory
   * and more, all to have the main process turn it down afterwards.
   */
  attach: async (files) => {
    if (files.length === 0) return;
    const key = draftKey(get);
    const oversized = files.filter((file) => file.size > MAX_IMAGE_BYTES);
    const readable = files.filter((file) => file.size <= MAX_IMAGE_BYTES);
    if (oversized.length > 0) showAttachmentsRejected(oversized.map((file) => file.name || "Pasted image"));
    const accepted = isRemote && readable.reduce((size, file) => size + file.size, 0) > MAX_REMOTE_IMAGE_BATCH_BYTES
      ? []
      : readable;
    if (accepted.length !== readable.length) showAttachmentsRejected(readable.map((file) => file.name || "Pasted image"));
    if (accepted.length === 0) return;

    countPreparing(set, key, 1);
    try {
      const read = await Promise.all(accepted.map((file) => readAsBase64(file)));
      const result = await rpc.request.prepareImages({ files: read });
      if (result.rejected.length > 0) showAttachmentsRejected(result.rejected);
      addAttachments(set, key, result.images);
    } finally {
      countPreparing(set, key, -1);
    }
  },

  detach: (id) => {
    const key = draftKey(get);
    set((s) => {
      const remaining = (s.attachments[key] ?? []).filter((image) => image.id !== id);
      if (remaining.length > 0) return { attachments: { ...s.attachments, [key]: remaining } };
      const { [key]: _emptied, ...rest } = s.attachments;
      return { attachments: rest };
    });
  },

  send: async () => {
    // Section 16: while another writer owns this chat we send nothing, and the
    // draft stays exactly where the user left it.
    const draft = currentDraft(get);
    if (!draft) return;
    const { state: s, projectDir, key, text, images } = draft;

    /**
     * A `/` message gets no optimistic bubble.
     *
     * The bubble is removed when Pi echoes the user message back, and an
     * extension command may run to completion without one: it does its work and
     * returns, and nothing would ever arrive to take the "Sending…" spinner off
     * the screen or clear `runStartedAt` for the next run's timer. Only Pi knows
     * which kind of command this is, so nothing is claimed on its behalf —
     * whatever it does show up as arrives as events, a moment later.
     */
    const pendingEntry: PendingMessage | null = text.startsWith("/") ? null : { id: pendingId++, text, images };
    patchConversation(set, projectDir, s.activeSessionFile, (c) => ({
      pending: pendingEntry ? [...c.pending, pendingEntry] : c.pending,
      error: undefined,
      errorRecovery: undefined,
      runStartedAt: pendingEntry ? Date.now() : c.runStartedAt,
    }));
    get().setDraft("");
    clearAttachments(set, key);

    const res = await rpc.request.submit({
      projectDir,
      sessionFile: s.activeSessionFile,
      message: text,
      images: images.map(toImageContent),
    });
    if (!res.ok) {
      patchConversation(set, projectDir, s.activeSessionFile, (c) => ({
        pending: c.pending.filter((p) => p.id !== pendingEntry?.id),
        error: res.error ?? "Failed to send",
        errorRecovery: "retrySend",
        runStartedAt: null,
      }));
      // The images go back with the text: a retry that silently dropped them
      // would send a message about a screenshot that is no longer attached. They
      // go in front of whatever was attached while the send was in flight — the
      // composer stayed usable, and those images are for the next message.
      set((st) => ({ drafts: { ...st.drafts, [key]: text } }));
      addAttachments(set, key, images, true);
      return;
    }
    if (res.sessionFile) {
      patchConversation(set, projectDir, res.sessionFile, { projectDir, sessionFile: res.sessionFile });
      if (!s.activeSessionFile) {
        const timestamp = new Date().toISOString();
        addSidebarSession(set, projectDir, {
          path: res.sessionFile,
          // The watcher replaces this temporary summary with Pi's authoritative
          // metadata as soon as the first message is persisted.
          id: res.sessionFile,
          firstMessage: text,
          lastPrompt: text,
          providers: [],
          messageCount: 1,
          created: timestamp,
          modified: timestamp,
        });
      }
      if (!s.activeSessionFile) {
        set((state) => {
          const { [projectDir]: draft, ...conversations } = state.conversations;
          return { conversations: { ...conversations, [res.sessionFile!]: { ...(draft ?? emptyConversation()), projectDir, sessionFile: res.sessionFile! } } };
        });
      }
      setLastChat(projectDir, res.sessionFile);
      persist(get);
      if (get().activeProjectPath === projectDir && get().activeSessionFile !== res.sessionFile) {
        set({ activeSessionFile: res.sessionFile, isNewChat: false });
        void rpc.request.watchSession({ projectDir, sessionFile: res.sessionFile });
      }
    }
  },

  enqueue: async (behavior) => {
    const draft = currentDraft(get);
    if (!draft) return;
    const { state: sendState, projectDir, key, text, images } = draft;
    const sessionFile = sendState.activeSessionFile;

    // No optimistic entry: Pi echoes the queued message back via queue_update,
    // which is the source of truth for what's pending.
    patchConversation(set, projectDir, sessionFile, { error: undefined });
    get().setDraft("");
    clearAttachments(set, key);

    /**
     * A command goes to `prompt`, never to `steer` or `follow_up`.
     *
     * Pi refuses an extension command on the queueing commands outright, and
     * `prompt` is where it decides: an extension command runs immediately even
     * mid-turn, while a skill or a prompt template is queued the way `behavior`
     * asks. Sending every `/` message this way lets Pi make that call rather
     * than NativePi guessing which kind of command it is holding.
     */
    const res = text.startsWith("/")
      ? await rpc.request.submit({
          projectDir,
          sessionFile,
          message: text,
          images: images.map(toImageContent),
          streamingBehavior: behavior,
        })
      : await rpc.request.enqueue({ projectDir, sessionFile: sessionFile!, behavior, message: text, images: images.map(toImageContent) });
    if (!res.ok) {
      patchConversation(set, projectDir, sessionFile, {
        error: res.error ?? "Failed to queue message",
        errorRecovery: "retrySend",
      });
      set((st) => ({ drafts: { ...st.drafts, [key]: text } }));
      addAttachments(set, key, images, true);
    }
  },

  abort: () => {
    const projectDir = get().activeProjectPath;
    const sessionFile = get().activeSessionFile;
    if (projectDir && sessionFile) void rpc.request.abort({ projectDir, sessionFile });
  },

  abortRetry: () => {
    const projectDir = get().activeProjectPath;
    const sessionFile = get().activeSessionFile;
    if (projectDir && sessionFile) void rpc.request.abortRetry({ projectDir, sessionFile });
  },

  renameChat: async (sessionFile, name) => {
    const projectDir = get().activeProjectPath;
    if (!projectDir) return { ok: false, error: "No active project" };
    const previousName = get().sessionsByProject[projectDir]?.find((session) => session.path === sessionFile)?.name;
    patchSidebarSession(set, projectDir, sessionFile, { name });
    const res = await rpc.request.renameChat({ projectDir, sessionFile, name });
    if (res.ok) {
      if (get().activeSessionFile === sessionFile) {
        patchConversation(set, projectDir, sessionFile, { sessionName: name });
      }
    } else {
      patchSidebarSession(set, projectDir, sessionFile, { name: previousName });
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
    const removed = removeSidebarSession(set, get, projectDir, sessionFile);
    const res = await rpc.request.deleteChat({ projectDir, sessionFile });
    if (!res.ok) {
      if (removed) addSidebarSession(set, projectDir, removed);
      return res;
    }

    if (getLastChat(projectDir) === sessionFile) forgetLastChat(projectDir);
    set((s) => {
      const { [sessionFile]: _draft, ...drafts } = s.drafts;
      const { [sessionFile]: _images, ...attachments } = s.attachments;
      return {
        drafts,
        attachments,
        pinnedChats: s.pinnedChats.filter((path) => path !== sessionFile),
      };
    });
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
    if (projectDir) patchConversation(set, projectDir, sessionFile, { externalChange: null });
    await get().selectChat(sessionFile);
    if (projectDir && get().activeProjectPath === projectDir) await get().refreshSessions(projectDir);
  },

  clearError: () => {
    const projectDir = get().activeProjectPath;
    if (projectDir) patchConversation(set, projectDir, get().activeSessionFile, { error: undefined, errorRecovery: undefined });
  },

  onEvent: ({ projectDir, sessionFile, event }) => {
    const s = get();
    if (event.type === "extension_ui_request") {
      const request = event as ExtensionUiRequest;
      const isPrompt = request.method === "select" || request.method === "confirm" || request.method === "input" || request.method === "editor";
      const isActiveSession = projectDir === s.activeProjectPath && (sessionFile ?? null) === (s.activeSessionFile ?? null);
      if (isActiveSession || isPrompt) applyExtensionUi(set, get, projectDir, request);
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
    const conv = conversationFor(s, projectDir, sessionFile ?? null);
    if (projectDir === s.activeProjectPath) {
      // Files change throughout a turn, not only at its end: refresh as messages
      // land, so the changes pane is live rather than stale for the whole
      // duration of a run. Rate-limited here rather than in refreshGit, so an
      // explicit Refresh click is never swallowed.
      if (event.type === "agent_settled") void get().refreshGit();
      else if (event.type === "message_end" && !gitRefreshedWithin(1000)) void get().refreshGit();
    }
    let eventPatch: Partial<Conversation>;
    if (event.type === "nativepi_event_batch") {
      let current = conv;
      eventPatch = {};
      for (const nextEvent of (event as PiEventBatch).events) {
        const nextPatch = reduce(current, nextEvent);
        eventPatch = { ...eventPatch, ...nextPatch };
        current = { ...current, ...nextPatch };
      }
    } else {
      eventPatch = reduce(conv, event);
    }
    const patch = { ...eventPatch, projectDir, sessionFile: sessionFile ?? conv.sessionFile };
    patchConversation(set, projectDir, sessionFile ?? null, patch);
    if (event.type === "agent_settled" && conv.runStartedAt !== null) {
      set((state) => ({
        extensionPromptsByProject: { ...state.extensionPromptsByProject, [projectDir]: [] },
        ...(projectDir === state.activeProjectPath ? { extPrompts: [] } : {}),
      }));
    }
  },

  onPiError: (projectDir, message) => {
    // The draft was cleared by the submit that succeeded, so there is nothing
    // to re-send; restarting Pi is the recovery that actually applies.
    patchConversation(set, projectDir, get().activeProjectPath === projectDir ? get().activeSessionFile : null, {
      error: message,
      errorRecovery: "restartPi",
      running: false,
      runStartedAt: null,
    });
  },

  onSessionChangedExternally: ({ projectDir, sessionFile }) => {
    const conv = get().conversations[sessionFile];
    if (!conv || sessionFile !== conv.sessionFile) return;
    if (conv.running || conv.externalChange) return;
    patchConversation(set, projectDir, sessionFile, { externalChange: { sessionFile } });
  },
});
