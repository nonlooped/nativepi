import { chipText } from "../composerText.ts";
import { mentionPath } from "../drops.ts";
import { createHydration } from "./hydration.ts";
import type { AgentMessage, PiEventBatch, SessionEntry, SessionSummary, ThinkingLevel } from "../../../shared/pi-types.ts";
import type { ExtensionUiRequest } from "../../../shared/pi-types.ts";
import { isRemote, rpc } from "../rpc.ts";
import { conversationFor, emptyConversation, mergeConversation, patchConversation } from "./conversation.ts";
import { applyExtensionUi, reduce, sessionInfoName } from "./events.ts";
import {
  applyFolderTrust,
  draftKey,
  enterProjectFolder,
  forgetLastChat,
  getLastChat,
  gitRefreshedWithin,
  persist,
  rememberProject,
  reportDraft,
  writeDraft,
  setLastChat,
  warmProject,
  runtime,
  observeRuntime,
  selectionGuard,
  requireModelStateRecovery,
} from "./internals.ts";
import { readAsBase64, toImageContent } from "../attachments.ts";
import { showAttachmentsRejected } from "../toast.tsx";
import { MAX_IMAGE_BYTES } from "../../../shared/images.ts";
import type { ImageAttachment } from "../../../shared/rpc-schema.ts";
import { isChatFinished, togglePinnedPath } from "../chatOrganization.ts";
import { dropAllSurfaces } from "../tuiSurfaces.ts";
import { isAssistant, isUser, sessionPromptSummary } from "../../../shared/messages.ts";
import { draftKeyFor } from "../../../shared/messages.ts";
import { NO_EXTENSION_UI_STATE, type ChatSlice, type Conversation, type GetState, type PendingMessage, type SetState, type SliceCreator } from "./types.ts";

const MAX_REMOTE_IMAGE_BATCH_BYTES = 48 * 1024 * 1024;

function retainLiveConversations(conversations: Record<string, Conversation>, selectedKey: string) {
  return Object.fromEntries(Object.entries(conversations).filter(([key, conversation]) =>
    key === selectedKey
    || conversation.running
    || conversation.compacting
    || conversation.pending.length > 0
    || conversation.queue.steering.length > 0
    || conversation.queue.followUp.length > 0
    || conversation.retry !== null
    || conversation.error !== undefined
    || conversation.externalChange !== null,
  ));
}

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

function recordSidebarMessage(set: SetState, projectDir: string, sessionFile: string, message: AgentMessage) {
  if (!isUser(message) && !isAssistant(message)) return;
  set((state) => {
    const sessions = state.sessionsByProject[projectDir];
    const index = sessions?.findIndex((session) => session.path === sessionFile) ?? -1;
    if (index < 0 || !sessions) return {};
    const session = sessions[index]!;
    const timestamp = typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
      ? new Date(message.timestamp).toISOString()
      : new Date().toISOString();
    const providers = isAssistant(message) && message.provider
      ? [message.provider, ...session.providers.filter((provider) => provider !== message.provider)]
      : session.providers;
    const firstSubmittedMessage = session.id === session.path && session.messageCount === 1 && isUser(message);
    const next = [...sessions];
    next[index] = {
      ...session,
      lastPrompt: isUser(message) ? sessionPromptSummary(message.content) : session.lastPrompt,
      providers,
      messageCount: session.messageCount + (firstSubmittedMessage ? 0 : 1),
      modified: timestamp,
    };
    return { sessionsByProject: { ...state.sessionsByProject, [projectDir]: next } };
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
  reportDraft(get, get().activeProjectPath, get().activeSessionFile, get().drafts[draftKey(get)] ?? "");
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
  if ((state.preparing[key] ?? 0) > 0) return null;
  const text = (state.drafts[key] ?? "").trim();
  const images = state.attachments[key] ?? [];
  return text || images.length > 0 ? { state, projectDir, key, text, images } : null;
}

function projectDirForSession(get: GetState, sessionFile: string): string | null {
  const state = get();
  for (const [projectPath, sessions] of Object.entries(state.sessionsByProject)) {
    if (sessions.some((session) => session.path === sessionFile)) return projectPath;
  }
  return state.conversations[sessionFile]?.projectDir ?? null;
}

function reviveActiveIfFinished(get: GetState): void {
  const s = get();
  const sessionFile = s.activeSessionFile;
  if (!sessionFile) return;
  const created = (s.activeProjectPath ? s.sessionsByProject[s.activeProjectPath] : undefined)
    ?.find((session) => session.path === sessionFile)?.created ?? "";
  if (!isChatFinished(created, sessionFile, s.focusStartedAt, s.finishedChats[sessionFile], s.focusedChats)) return;
  get().returnChatToFocus(sessionFile);
}

/** Take the images off a draft; `send` and `enqueue` both hand them to Pi. */
function clearAttachments(set: SetState, key: string): void {
  set((s) => {
    const { [key]: _sent, ...rest } = s.attachments;
    return { attachments: rest };
  });
}

function restoredDraft(sent: string, newer: string | undefined): string {
  return newer ? `${sent}\n\n${newer}` : sent;
}

function addAttachments(set: SetState, key: string, images: ImageAttachment[], atFront = false): void {
  if (images.length === 0) return;
  set((s) => {
    const held = s.attachments[key] ?? [];
    const merged = atFront ? [...images, ...held] : [...held, ...images];
    return { attachments: { ...s.attachments, [key]: merged } };
  });
}

function countPreparing(set: SetState, key: string, delta: number): void {
  set((s) => {
    const count = (s.preparing[key] ?? 0) + delta;
    if (count > 0) return { preparing: { ...s.preparing, [key]: count } };
    const { [key]: _done, ...rest } = s.preparing;
    return { preparing: rest };
  });
}

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => {
  let pendingId = 1;
  let nextColdChatToken = 1;
  const sessionWrites = new Set<string>();
  const sessionRefreshes = new Map<string, Promise<void>>();
  const attachmentTargets = new Map<string, { key: string }>();
  const coldChatTokens = new Map<string, number>();
  const coldSubmits = new Map<string, { token: number | undefined; conversation: Conversation; runtimeId?: string; echoedSessions: Set<string> }>();
  const hydration = createHydration(set, get);
  const attachmentTarget = (key: string) => {
    let target = attachmentTargets.get(key);
    if (!target) { target = { key }; attachmentTargets.set(key, target); }
    return target;
  };
  function moveAttachments(target: { key: string }, key: string) {
    const source = target.key;
    if (source === key) return;
    target.key = key;
    if (attachmentTargets.get(source) === target) attachmentTargets.delete(source);
    attachmentTargets.set(key, target);
    set(state => {
      const { [source]: images, ...attachments } = state.attachments;
      const { [source]: count, ...preparing } = state.preparing;
      return {
        attachments: images ? { ...attachments, [key]: [...(attachments[key] ?? []), ...images] } : attachments,
        preparing: count ? { ...preparing, [key]: (preparing[key] ?? 0) + count } : preparing,
      };
    });
  }
  function detachColdChat(projectDir: string) {
    const submitting = coldSubmits.get(projectDir);
    if (!submitting || coldChatTokens.get(projectDir) !== submitting.token) return;
    submitting.conversation = conversationFor(get(), projectDir, null);
    const target = attachmentTargets.get(draftKeyFor(projectDir, null));
    if (target) moveAttachments(target, `submitting:${submitting.token}:${projectDir}`);
  }
  return {
    sessionsByProject: {},
    sessionLoadStates: {},
    activeSessionFile: null,
    isNewChat: false,
    selectionVersion: 0,
    pinnedChats: [],
    finishedChats: {},
    focusedChats: [],
    focusStartedAt: new Date().toISOString(),
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
      set((s) => {
        const pinning = !s.pinnedChats.includes(sessionFile);
        if (!pinning) return { pinnedChats: togglePinnedPath(s.pinnedChats, sessionFile) };
        const { [sessionFile]: _finished, ...finishedChats } = s.finishedChats;
        return {
          pinnedChats: togglePinnedPath(s.pinnedChats, sessionFile),
          finishedChats,
          focusedChats: [...new Set([...s.focusedChats, sessionFile])],
        };
      });
      persist(get);
    },

    finishChat: (sessionFile) => {
      set((s) => ({
        finishedChats: { ...s.finishedChats, [sessionFile]: new Date().toISOString() },
        focusedChats: s.focusedChats.filter((path) => path !== sessionFile),
        pinnedChats: s.pinnedChats.filter((path) => path !== sessionFile),
      }));
      persist(get);
    },

    returnChatToFocus: (sessionFile) => {
      set((s) => {
        const { [sessionFile]: _finished, ...finishedChats } = s.finishedChats;
        return {
          finishedChats,
          focusedChats: [...new Set([...s.focusedChats, sessionFile])],
        };
      });
      persist(get);
    },

    selectChat: async (sessionFile, projectDir) => {
      const projectPath = projectDir ?? projectDirForSession(get, sessionFile) ?? get().activeProjectPath;
      if (!projectPath) return;
      const folder = projectPath !== get().activeProjectPath ? enterProjectFolder(set, get, projectPath) : null;
      try {
        ++runtime(get).selection;
        detachColdChat(projectPath);
        coldChatTokens.delete(projectPath);
        clearSessionExtensionUi(set);
        set((state) => ({
          selectionVersion: state.selectionVersion + 1,
          activeSessionFile: sessionFile,
          isNewChat: false,
          models: [],
          model: undefined,
          thinkingLevel: "off",
          thinkingLevelReady: false,
          thinkingLevelVersion: state.thinkingLevelVersion + 1,
          thinkingLevels: [], thinkingLevelsLoading: true, thinkingLevelsError: undefined,
          conversations: retainLiveConversations(state.conversations, sessionFile),
        }));
        const selected = selectionGuard(get);
        reportActiveDraft(get);
        setLastChat(get, projectPath, sessionFile);
        persist(get);
        // Watch the chat being viewed for writes from another NativePi window or
        // a Pi CLI in a terminal.
        void rpc.request.watchSession({ projectDir: projectPath, sessionFile }).catch(() => {});
        void rpc.request.tuiSend({
          projectDir: projectPath,
          sessionFile,
          frame: { type: "nativepi_tui_sync" },
        }).catch(() => {});
        // A run already streaming into this chat keeps its live state — this is
        // the path back into a project that kept working in the background, and
        // its conversation has been fed every event in the meantime.
        if (!get().conversations[sessionFile]) patchConversation(set, projectPath, sessionFile, { projectDir: projectPath, sessionFile });
        await hydration.read(projectPath, sessionFile);
        if (!selected()) return;
        const trust = get().trust;
        if (trust && (!trust.required || trust.trusted)) await warmProject(set, get, projectPath);
      } finally {
        if (folder) {
          await applyFolderTrust(set, get, projectPath, folder);
          if ((get().sessionLoadStates[projectPath] ?? "unloaded") === "unloaded") void get().refreshSessions(projectPath);
        }
      }
    },

    newChat: () => {
      ++runtime(get).selection;
      clearSessionExtensionUi(set);
      const projectDir = get().activeProjectPath;
      if (projectDir) {
        detachColdChat(projectDir);
        if (coldSubmits.has(projectDir)) runtime(get).blockedDrafts.add(projectDir);
        attachmentTargets.delete(draftKeyFor(projectDir, null));
        coldChatTokens.set(projectDir, nextColdChatToken++);
      }
      if (projectDir) {
        void rpc.request.watchSession({ projectDir, sessionFile: null }).catch(() => {});
        patchConversation(set, projectDir, null, () => ({ ...emptyConversation(), projectDir }));
      }
      set((state) => ({ selectionVersion: state.selectionVersion + 1, activeSessionFile: null, isNewChat: true, thinkingLevelReady: false, thinkingLevelVersion: state.thinkingLevelVersion + 1 }));
      set({ models: [], model: undefined, providers: [], providersLoaded: false, thinkingLevels: [], thinkingLevelsLoading: true, thinkingLevelsError: undefined });
      reportActiveDraft(get);
      const trust = get().trust;
      if (projectDir && !coldSubmits.has(projectDir) && trust && (!trust.required || trust.trusted)) void warmProject(set, get, projectDir).catch(() => {});
    },

    newChatIn: async (projectDir) => {
      rememberProject(set, get, projectDir);
      const folder = projectDir !== get().activeProjectPath ? enterProjectFolder(set, get, projectDir) : null;
      get().newChat();
      if (folder) await applyFolderTrust(set, get, projectDir, folder);
    },

    importSession: async (targetProjectDir, sourceFile) => {
      const selected = selectionGuard(get);
      const projectDir = targetProjectDir ?? get().activeProjectPath;
      if (!projectDir) return false;
      const targetSessionFile = get().activeProjectPath === projectDir ? get().activeSessionFile : null;
      const res = await safeRequest(() => rpc.request.importSession({ projectDir, sourceFile }));
      if ("canceled" in res && res.canceled) return false;
      if (!res.ok || !res.sessionFile) {
        patchConversation(set, projectDir, targetSessionFile, { error: res.error ?? "Failed to import chat" });
        return false;
      }
      await get().refreshSessions(projectDir);
      if (selected()) await get().selectChat(res.sessionFile, projectDir);
      return true;
    },

    setSendBehavior: (sendBehavior) => set({ sendBehavior }),

    setDraft: (text) => {
      writeDraft(set, get, get().activeProjectPath, get().activeSessionFile, text);
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
      const target = attachmentTarget(draftKey(get));
      const key = target.key;
      const documents = files.filter((file) => !file.type.startsWith("image/"));
      const paths = documents.map((file) => ({ file, path: rpc.filePath(file) }));
      const mentions = paths.filter((item) => item.path).map((item) => chipText("file", mentionPath(get().activeProjectPath!, item.path)));
      if (mentions.length) {
        const draft = get().drafts[key] ?? "";
        get().setDraft(`${draft}${draft && !/\s$/.test(draft) ? " " : ""}${mentions.join(" ")} `);
      }
      const unavailable = paths.filter((item) => !item.path);
      if (unavailable.length) showAttachmentsRejected(unavailable.map((item) => `${item.file.name} (local file path unavailable)`));
      files = files.filter((file) => file.type.startsWith("image/"));
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
        addAttachments(set, target.key, result.images);
      } finally {
        countPreparing(set, target.key, -1);
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
      if (!draft.state.activeSessionFile && coldSubmits.has(draft.projectDir)) return;
      reviveActiveIfFinished(get);
      const { state: s, projectDir, key, text, images } = draft;
      const target = attachmentTarget(key);

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
      const optimisticConversation = conversationFor(get(), projectDir, s.activeSessionFile);
      const coldChatToken = s.activeSessionFile
        ? undefined
        : (coldChatTokens.get(projectDir) ?? (() => {
            const token = nextColdChatToken++;
            coldChatTokens.set(projectDir, token);
            return token;
          })());
      get().setDraft("");
      clearAttachments(set, key);

      const submitting = { token: coldChatToken, conversation: optimisticConversation, runtimeId: runtime(get).runtimes.get(projectDir), echoedSessions: new Set<string>() };
      if (!s.activeSessionFile) coldSubmits.set(projectDir, submitting);
      let res: Awaited<ReturnType<typeof rpc.request.submit>>;
      try {
        res = await rpc.request.submit({
          projectDir,
          sessionFile: s.activeSessionFile,
          message: text,
          images: images.map(toImageContent),
          model: s.model ? { provider: s.model.provider, id: s.model.id } : undefined,
          thinkingLevel: s.thinkingLevelReady ? s.thinkingLevel : undefined,
        });
      } catch (error) {
        res = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (!s.activeSessionFile && coldSubmits.get(projectDir) === submitting) {
        coldSubmits.delete(projectDir);
        runtime(get).blockedDrafts.delete(projectDir);
      }
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
        writeDraft(set, get, projectDir, s.activeSessionFile, restoredDraft(text, get().drafts[key]));
        moveAttachments(target, key);
        addAttachments(set, key, images, true);
        return;
      }
      if (res.sessionFile) {
        if (s.activeSessionFile) patchConversation(set, projectDir, res.sessionFile, { projectDir, sessionFile: res.sessionFile });
        if (!s.activeSessionFile) {
          const timestamp = new Date().toISOString();
          addSidebarSession(set, projectDir, {
            path: res.sessionFile,
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
          const sameColdChat = coldChatTokens.get(projectDir) === coldChatToken;
          moveAttachments(target, res.sessionFile);
          if (submitting.runtimeId) runtime(get).bindings.set(submitting.runtimeId, res.sessionFile);
          set((state) => {
            const projectConversation = state.conversations[projectDir];
            const conversations = { ...state.conversations };
            const draftConversation = sameColdChat ? projectConversation : submitting.conversation;
            if (sameColdChat) delete conversations[projectDir];
            const sessionConversation = conversations[res.sessionFile!];
            const pending = [...(sessionConversation?.pending ?? [])];
            for (const item of draftConversation?.pending ?? []) {
              if (item.id === pendingEntry?.id && submitting.echoedSessions.has(res.sessionFile!)) continue;
              if (!pending.some((candidate) => candidate.id === item.id)) pending.push(item);
            }
            const coldDraftKey = draftKeyFor(projectDir, null);
            const coldDraft = sameColdChat ? state.drafts[coldDraftKey] : undefined;

            const drafts = { ...state.drafts };
            const attachments = { ...state.attachments };
            const preparing = { ...state.preparing };
            if (sameColdChat) {
              delete drafts[coldDraftKey];
              delete attachments[coldDraftKey];
              delete preparing[coldDraftKey];
            }
            return {
              conversations: {
                ...conversations,
                [res.sessionFile!]: {
                  ...mergeConversation(draftConversation ?? emptyConversation(), sessionConversation ?? {}),
                  pending,
                  projectDir,
                  sessionFile: res.sessionFile!,
                },
              },
              drafts: coldDraft === undefined ? drafts : { ...drafts, [res.sessionFile!]: coldDraft },
              attachments,
              preparing,
            };
          });
        }
        hydration.retry(projectDir, res.sessionFile);
        setLastChat(get, projectDir, res.sessionFile);
        persist(get);
        if (
          get().activeProjectPath === projectDir
          && get().activeSessionFile === null
          && coldChatTokens.get(projectDir) === coldChatToken
        ) {
          // Binding changes the reader target without changing the visible chat.
          // Cold replies stay stale; recovery belongs to the newly bound target.
          const owner = runtime(get);
          const needsRecovery = get().thinkingLevelsLoading || owner.modelStateRecovery?.() || owner.modelStateRead?.();
          set({ activeSessionFile: res.sessionFile, isNewChat: false });
          if (needsRecovery) requireModelStateRecovery(set, get,
            get().thinkingLevelsError ?? "Pi’s session changed. Retry to read the current model.");
          void rpc.request.watchSession({ projectDir, sessionFile: res.sessionFile }).catch(() => {});
        }
      }
    },

    enqueue: async (behavior) => {
      const draft = currentDraft(get);
      if (!draft) return;
      if (!draft.state.activeSessionFile && coldSubmits.has(draft.projectDir)) return;
      reviveActiveIfFinished(get);
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
      let res: { ok: boolean; error?: string };
      try {
        res = text.startsWith("/")
          ? await rpc.request.submit({
              projectDir,
              sessionFile,
              message: text,
              images: images.map(toImageContent),
              streamingBehavior: behavior,
            })
          : await rpc.request.enqueue({ projectDir, sessionFile: sessionFile!, behavior, message: text, images: images.map(toImageContent) });
      } catch (error) {
        res = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (sessionFile) hydration.retry(projectDir, sessionFile);
      if (!res.ok) {
        patchConversation(set, projectDir, sessionFile, {
          error: res.error ?? "Failed to queue message",
          errorRecovery: "retrySend",
        });
        writeDraft(set, get, projectDir, sessionFile, restoredDraft(text, get().drafts[key]));
        addAttachments(set, key, images, true);
      }
    },

    abort: () => {
      const projectDir = get().activeProjectPath;
      const sessionFile = get().activeSessionFile;
      if (projectDir) void safeRequest(() => rpc.request.abort({ projectDir, sessionFile })).then(result => { if (!result.ok) patchConversation(set, projectDir, sessionFile, { error: ("error" in result ? result.error : undefined) ?? "Unable to stop this turn" }); });
    },

    abortRetry: () => {
      const projectDir = get().activeProjectPath;
      const sessionFile = get().activeSessionFile;
      if (projectDir && sessionFile) void safeRequest(() => rpc.request.abortRetry({ projectDir, sessionFile })).then(result => { if (!result.ok) patchConversation(set, projectDir, sessionFile, { error: ("error" in result ? result.error : undefined) ?? "Unable to stop retrying" }); });
    },

    renameChat: async (sessionFile, name, targetProject) => {
      const projectDir = targetProject ?? projectDirForSession(get, sessionFile) ?? get().activeProjectPath;
      const selected = selectionGuard(get);
      if (!projectDir) return { ok: false, error: "No active project" };
      if (sessionWrites.has(sessionFile)) return { ok: false, error: "This chat is already being updated." };
      sessionWrites.add(sessionFile);
      const previousName = get().sessionsByProject[projectDir]?.find((session) => session.path === sessionFile)?.name;
      patchSidebarSession(set, projectDir, sessionFile, { name });
      const res = await safeRequest(() => rpc.request.renameChat({ projectDir, sessionFile, name }));
      sessionWrites.delete(sessionFile);
      if (res.ok) {
        if (get().activeSessionFile === sessionFile) {
          patchConversation(set, projectDir, sessionFile, { sessionName: name });
        }
      } else {
        patchSidebarSession(set, projectDir, sessionFile, { name: previousName });
      }
      return res;
    },

    cloneChat: async (sessionFile, targetProject) => {
      const projectDir = targetProject ?? projectDirForSession(get, sessionFile) ?? get().activeProjectPath;
      const selected = selectionGuard(get);
      if (!projectDir) return { ok: false, error: "No active project" };
      if (sessionWrites.has(sessionFile)) return { ok: false, error: "This chat is already being updated." };
      sessionWrites.add(sessionFile);
      const res = await safeRequest(() => rpc.request.cloneChat({ projectDir, sessionFile }));
      sessionWrites.delete(sessionFile);
      if (res.ok && res.sessionFile) {
        await get().refreshSessions(projectDir);
        if (selected()) await get().selectChat(res.sessionFile, projectDir);
      }
      return res;
    },

    deleteChat: async (sessionFile, targetProject) => {
      const projectDir = targetProject ?? projectDirForSession(get, sessionFile) ?? get().activeProjectPath;
      const selected = selectionGuard(get);
      if (!projectDir) return { ok: false, error: "No active project" };
      if (sessionWrites.has(sessionFile)) return { ok: false, error: "This chat is already being updated." };
      sessionWrites.add(sessionFile);
      const removed = removeSidebarSession(set, get, projectDir, sessionFile);
      const res = await safeRequest(() => rpc.request.deleteChat({ projectDir, sessionFile }));
      sessionWrites.delete(sessionFile);
      if (!res.ok) {
        if (removed) addSidebarSession(set, projectDir, removed);
        return res;
      }

      if (getLastChat(get, projectDir) === sessionFile) forgetLastChat(get, projectDir);
      set((s) => {
        const { [sessionFile]: _draft, ...drafts } = s.drafts;
        const { [sessionFile]: _images, ...attachments } = s.attachments;
        const { [sessionFile]: _conversation, ...conversations } = s.conversations;
        return {
          drafts,
          attachments,
          conversations,
          pinnedChats: s.pinnedChats.filter((path) => path !== sessionFile),
          finishedChats: Object.fromEntries(
            Object.entries(s.finishedChats).filter(([path]) => path !== sessionFile),
          ),
          focusedChats: s.focusedChats.filter((path) => path !== sessionFile),
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

    forkChat: async (sessionFile, entryId, targetProject) => {
      const projectDir = targetProject ?? projectDirForSession(get, sessionFile) ?? get().activeProjectPath;
      const selected = selectionGuard(get);
      if (!projectDir) return { ok: false, error: "No active project" };
      if (sessionWrites.has(sessionFile)) return { ok: false, error: "This chat is already being updated." };
      sessionWrites.add(sessionFile);
      const res = await safeRequest(() => rpc.request.forkChat({ projectDir, sessionFile, entryId }));
      sessionWrites.delete(sessionFile);
      if (res.ok && res.sessionFile) {
        if (res.text) set((s) => ({ drafts: { ...s.drafts, [res.sessionFile!]: res.text! } }));
        await get().refreshSessions(projectDir);
        if (selected()) await get().selectChat(res.sessionFile, projectDir);
      }
      return res;
    },

    compactActive: async () => {
      const s = get();
      if (!s.activeProjectPath || !s.activeSessionFile) return;
      const result = await safeRequest(() => rpc.request.compact({ projectDir: s.activeProjectPath!, sessionFile: s.activeSessionFile! }));
      if (!result.ok) patchConversation(set, s.activeProjectPath, s.activeSessionFile, { error: result.error ?? "Unable to compact this chat" });
    },

    refreshSession: (projectDir, sessionFile) => hydration.read(projectDir, sessionFile),

    reloadActiveSession: async () => {
      const sessionFile = get().activeSessionFile;
      const projectDir = get().activeProjectPath;
      if (!sessionFile || !projectDir) return;
      const selected = selectionGuard(get);
      const result = await safeRequest(() => rpc.request.reloadSession({ projectDir, sessionFile }));
      if (!result.ok) { patchConversation(set, projectDir, sessionFile, { error: result.error ?? "Unable to reload chat" }); return; }
      patchConversation(set, projectDir, sessionFile, { externalChange: null });
      hydration.invalidate();
      await hydration.read(projectDir, sessionFile);
      if (selected()) await get().refreshSessions(projectDir);
    },

    clearError: () => {
      const projectDir = get().activeProjectPath;
      if (projectDir) patchConversation(set, projectDir, get().activeSessionFile, { error: undefined, errorRecovery: undefined });
    },

    onEvent: (payload) => {
      const { projectDir, event, runtimeId } = payload;
      const owner = runtime(get);
      if (runtimeId && owner.retired.has(runtimeId)) return;
      const sessionFile = payload.sessionFile ?? (runtimeId ? runtime(get).bindings.get(runtimeId) : undefined);
      if (sessionFile !== payload.sessionFile) payload = { ...payload, sessionFile };
      if (runtimeId) observeRuntime(get, projectDir, sessionFile, runtimeId);
      const submitting = !sessionFile ? coldSubmits.get(projectDir) : undefined;
      if (submitting) {
        if (runtimeId) submitting.runtimeId = runtimeId;
        if (coldChatTokens.get(projectDir) !== submitting.token) {
          const events = event.type === "nativepi_event_batch" ? (event as PiEventBatch).events : [event];
          for (const next of events) submitting.conversation = mergeConversation(submitting.conversation, reduce(submitting.conversation, next));
          return;
        }
      }
      if (runtimeId && payload.sequence !== undefined) {
        const watermark = owner.eventWatermarks.get(sessionFile ?? projectDir);
        if (watermark?.runtimeId === runtimeId && payload.sequence <= watermark.sequence) {
          // A fenced echo can acknowledge only sends present when the snapshot was accepted.
          // Replaying transcript content must never acknowledge a newer optimistic send.
          if (payload.sequence > (owner.acknowledgedEvents.get(runtimeId) ?? -1)) {
            const events = event.type === "nativepi_event_batch" ? (event as PiEventBatch).events : [event];
            let echoes = events.filter(next => next.type === "message_end" && isUser((next as { message: AgentMessage }).message)).length;
            patchConversation(set, projectDir, sessionFile ?? null, conversation => ({
              pending: conversation.pending.filter(item => {
                if (echoes === 0 || !watermark.pending.has(item.id)) return true;
                --echoes;
                return false;
              }),
            }));
            owner.acknowledgedEvents.set(runtimeId, payload.sequence);
          }
          return;
        }
      }
      const coldSubmit = coldSubmits.get(projectDir);
      if (sessionFile && coldSubmit) {
        const events = event.type === "nativepi_event_batch" ? (event as PiEventBatch).events : [event];
        if (events.some(next => next.type === "message_end" && isUser((next as { message: AgentMessage }).message))) coldSubmit.echoedSessions.add(sessionFile);
      }
      owner.eventVersions.set(sessionFile ?? projectDir, (owner.eventVersions.get(sessionFile ?? projectDir) ?? 0) + 1);
      hydration.event(payload);
      const s = get();
      if (event.type === "extension_ui_request") {
        const request = event as ExtensionUiRequest;
        const isPrompt = request.method === "select" || request.method === "confirm" || request.method === "input" || request.method === "editor";
        const isActiveSession = projectDir === s.activeProjectPath && (sessionFile ?? null) === (s.activeSessionFile ?? null);
        if (isActiveSession || isPrompt) applyExtensionUi(set, get, projectDir, sessionFile ?? null, request);
        return;
      }
      if (event.type === "thinking_level_changed") {
        if (
          projectDir === s.activeProjectPath
          && (sessionFile ?? null) === (s.activeSessionFile ?? null)
        ) {
          set((state) => ({
            thinkingLevel: (event as { level: ThinkingLevel }).level,
            thinkingLevelReady: true,
            thinkingLevelVersion: state.thinkingLevelVersion + 1,
          }));
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
        else if (event.type === "message_end" && !gitRefreshedWithin(get, 1000)) void get().refreshGit();
      }
      let eventPatch: Partial<Conversation>;
      if (event.type === "nativepi_event_batch") {
        let current = conv;
        eventPatch = {};
        for (const nextEvent of (event as PiEventBatch).events) {
          const nextPatch = reduce(current, nextEvent);
          eventPatch = { ...eventPatch, ...nextPatch };
          current = mergeConversation(current, nextPatch);
        }
      } else {
        eventPatch = reduce(conv, event);
      }
      if (runtimeId && payload.sequence !== undefined) {
        owner.acknowledgedEvents.set(runtimeId, Math.max(payload.sequence, owner.acknowledgedEvents.get(runtimeId) ?? -1));
      }
      const patch = { ...eventPatch, projectDir, sessionFile: sessionFile ?? conv.sessionFile };
      patchConversation(set, projectDir, sessionFile ?? null, patch);
      const finalizedMessage = event.type === "message_end"
        ? (event as { message?: AgentMessage }).message
        : undefined;
      if (sessionFile && finalizedMessage) {
        recordSidebarMessage(set, projectDir, sessionFile, finalizedMessage);
      }
      if (event.type === "agent_settled" && sessionFile) hydration.retry(projectDir, sessionFile);
      if (event.type === "agent_settled" && conv.runStartedAt !== null) {
        set((state) => {
          const prompts = (state.extensionPromptsByProject[projectDir] ?? [])
            .filter((prompt) => prompt.sessionFile !== (sessionFile ?? null));
          return {
            extensionPromptsByProject: { ...state.extensionPromptsByProject, [projectDir]: prompts },
            ...(projectDir === state.activeProjectPath ? { extPrompts: prompts } : {}),
          };
        });
      }
    },

    onPiError: (projectDir, message, sessionFile, runtimeId) => {
      if (runtimeId && runtime(get).retired.has(runtimeId)) return;
      sessionFile ??= runtimeId ? runtime(get).bindings.get(runtimeId) : undefined;
      if (runtimeId) observeRuntime(get, projectDir, sessionFile, runtimeId);
      const submitting = coldSubmits.get(projectDir);
      const failure: Partial<Conversation> = { error: message, errorRecovery: "restartPi", running: false, streaming: null, runStartedAt: null };
      if (!sessionFile && runtimeId && submitting?.runtimeId === runtimeId && coldChatTokens.get(projectDir) !== submitting.token) {
        submitting.conversation = mergeConversation(submitting.conversation, failure);
        return;
      }
      const running = Object.values(get().conversations).find((conversation) =>
        conversation.projectDir === projectDir && (conversation.running || conversation.pending.length > 0),
      );
      const target = sessionFile ?? (runtimeId ? null : running?.sessionFile
        ?? (get().activeProjectPath === projectDir ? get().activeSessionFile : null));
      patchConversation(set, projectDir, target, failure);
    },

    onSessionChangedExternally: ({ projectDir, sessionFile }) => {
      const conv = get().conversations[sessionFile];
      if (!conv || sessionFile !== conv.sessionFile) return;
      if (conv.running || conv.externalChange) return;
      patchConversation(set, projectDir, sessionFile, { externalChange: { sessionFile } });
    },
  };
};

async function safeRequest<T extends { ok: boolean; error?: string }>(run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try { return await run(); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
