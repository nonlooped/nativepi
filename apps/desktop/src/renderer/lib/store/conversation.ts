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
    runStartedAt: null,
    runEntryStart: null,
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

/** Merge a patch into one project's conversation, creating it if needed. */
export function patchConversation(
  set: SetState,
  projectDir: string,
  sessionFile: string | null,
  patch: Partial<Conversation> | ((c: Conversation) => Partial<Conversation>),
): void {
  set((s) => {
    const key = sessionFile ?? projectDir;
    const current = s.conversations[key] ?? emptyConversation();
    const resolved = typeof patch === "function" ? patch(current) : patch;
    return { conversations: { ...s.conversations, [key]: { ...current, ...resolved } } };
  });
}
