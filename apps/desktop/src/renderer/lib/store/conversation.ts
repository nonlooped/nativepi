import { isAssistant } from "../../../shared/messages.ts";
import type { AppState, Conversation, SetState } from "./types.ts";

/**
 * The state a conversation starts from, shared by opening, creating and
 * switching chats.
 *
 * A function, not a constant: these arrays go into the store, and handing every
 * reset the same instances would let one chat's transcript alias another's.
 */
export function emptyConversation(): Conversation {
  return {
    projectDir: null,
    sessionFile: null,
    sessionName: undefined,
    entries: [],
    streaming: null,
    running: false,
    aborted: false,
    runStartedAt: null,
    compacting: false,
    retry: null,
    pending: [],
    queue: { steering: [], followUp: [] },
    error: undefined,
    errorRecovery: undefined,
    externalChange: null,
  };
}

/**
 * What selectors fall back to when a project has no runtime yet. One frozen
 * instance, so a selector returning it does not re-render on every store write.
 */
const EMPTY_CONVERSATION: Conversation = Object.freeze(emptyConversation());

export function conversationFor(s: AppState, projectPath: string | null, sessionFile: string | null = s.activeSessionFile): Conversation {
  return (projectPath ? s.conversations[sessionFile ?? projectPath] : undefined) ?? EMPTY_CONVERSATION;
}

/** The conversation the UI is looking at. Components select through this. */
export function activeConversation(s: AppState): Conversation {
  return conversationFor(s, s.activeProjectPath);
}

/** Replacing an error transfers banner ownership, even when the text is identical. */
export function mergeConversation(current: Conversation, patch: Partial<Conversation>): Conversation {
  const errorOwner = Object.hasOwn(patch, "error") ? { modelControlError: undefined } : {};
  return { ...current, ...errorOwner, ...patch };
}

/** Merge a patch into one project's conversation, creating it if needed. */
export function patchConversation(
  set: SetState,
  projectDir: string,
  sessionFile: string | null,
  patch: Partial<Conversation> | ((c: Conversation) => Partial<Conversation>),
): void {
  set((s) => {
    const key = sessionFile ?? projectDir;
    const current = s.conversations[key] ?? { ...emptyConversation(), projectDir, sessionFile };
    const resolved = typeof patch === "function" ? patch(current) : patch;
    return { conversations: { ...s.conversations, [key]: mergeConversation(current, resolved) } };
  });
}

/** A prediction belongs only to the completed answer it was generated from. */
export function offeredPromptSuggestion(conversation: Conversation): string | null {
  const predicted = conversation.promptSuggestion;
  if (!predicted || conversation.running || conversation.compacting || conversation.externalChange
    || conversation.aborted || conversation.error || conversation.pending.length > 0
    || conversation.queue.steering.length > 0 || conversation.queue.followUp.length > 0) return null;
  const last = conversation.entries.findLast(entry => entry.type === "message");
  return last?.type === "message" && isAssistant(last.message) && last.message.timestamp === predicted.timestamp
    ? predicted.text : null;
}
