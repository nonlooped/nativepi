import type {
  AgentMessage,
  AssistantMessage,
  AssistantMessageDelta,
  ExtensionUiRequest,
  FileEntry,
  PiEvent,
  SessionEntry,
} from "../../../shared/pi-types.ts";
import { draftKeyFor, isAssistant } from "../../../shared/messages.ts";
import { stripAnsi } from "../ansi.ts";
import { showExtensionNotification } from "../toast.tsx";
import type { Conversation, GetState, SetState } from "./types.ts";

/** Fold one Pi event into a conversation patch. Pure, so it can be read as a table. */
export function reduce(s: Conversation, event: PiEvent): Partial<Conversation> {
  switch (event.type) {
    case "agent_start":
      return {
        running: true,
        error: undefined,
        errorRecovery: undefined,
        runStartedAt: s.runStartedAt ?? Date.now(),
      };
    case "agent_settled":
      // Safety net: commit a partial (e.g. aborted) assistant message that Pi
      // never finalized with message_end, so it isn't lost when the preview clears.
      if (s.streaming)
        return {
          running: false,
          runStartedAt: null,
          streaming: null,
          retry: null,
          entries: [...s.entries, liveEntry(s.streaming)],
        };
      return { running: false, runStartedAt: null, streaming: null, retry: null };
    case "agent_end":
      return {};
    case "message_start": {
      if (isAssistant(event.message)) return { streaming: event.message };
      return {};
    }
    case "message_update": {
      const delta = (event as { assistantMessageEvent?: unknown }).assistantMessageEvent;
      return s.streaming && isAssistantMessageDelta(delta) ? { streaming: applyAssistantDelta(s.streaming, delta) } : {};
    }
    case "message_end": {
      // Pi delivers user/assistant/toolResult messages via message_end (and
      // persists them to the session file); entry_appended fires only for custom
      // extension entries. Commit the finalized message to the transcript here.
      const message = (event as { message?: AgentMessage }).message;
      const role = (message as { role?: string } | undefined)?.role;
      if (!message || (role !== "user" && role !== "assistant" && role !== "toolResult")) return {};
      const patch: Partial<Conversation> = { entries: [...s.entries, liveEntry(message)] };
      if (role === "assistant") patch.streaming = null;
      if (role === "user" && s.pending.length > 0) patch.pending = s.pending.slice(1);
      return patch;
    }
    case "entry_appended": {
      const entry = (event as { entry?: SessionEntry }).entry;
      if (!entry) return {};
      return { entries: upsert(s.entries, entry) };
    }
    case "queue_update":
      return {
        queue: {
          steering: [...((event as { steering?: string[] }).steering ?? [])],
          followUp: [...((event as { followUp?: string[] }).followUp ?? [])],
        },
      };
    case "session_info_changed":
      return { sessionName: (event as { name?: string }).name };
    case "compaction_start":
      return { compacting: true };
    case "compaction_end":
      return { compacting: false };
    case "auto_retry_start": {
      const e = event as { attempt: number; maxAttempts: number; errorMessage: string };
      return { retry: { attempt: e.attempt, maxAttempts: e.maxAttempts, error: e.errorMessage } };
    }
    case "auto_retry_end":
      return { retry: null };
    default:
      return {};
  }
}

let liveSeq = 1;

/**
 * Wrap a streamed message as a transcript entry.
 *
 * Pi assigns the real entry id when it persists; until the file is re-read these
 * carry a synthetic one, which is why `Transcript` keys responses by position.
 */
function liveEntry(message: AgentMessage): SessionEntry {
  return { type: "message", id: `live-${liveSeq++}`, parentId: null, timestamp: new Date().toISOString(), message };
}

/** Assemble Pi's compact stream protocol; message_end remains the final source of truth. */
function isAssistantMessageDelta(value: unknown): value is AssistantMessageDelta {
  if (!value || typeof value !== "object") return false;
  const event = value as { type?: unknown; contentIndex?: unknown; delta?: unknown; content?: unknown; toolCall?: unknown };
  if (event.type === "start" || event.type === "done" || event.type === "error") return true;
  if (typeof event.contentIndex !== "number" || !Number.isInteger(event.contentIndex) || event.contentIndex < 0) return false;
  if (event.type === "text_start" || event.type === "thinking_start" || event.type === "toolcall_start") return true;
  if (event.type === "text_delta" || event.type === "thinking_delta" || event.type === "toolcall_delta") return typeof event.delta === "string";
  if (event.type === "text_end" || event.type === "thinking_end") return typeof event.content === "string";
  return event.type === "toolcall_end" && isToolCall(event.toolCall);
}

function isToolCall(value: unknown): value is Extract<AssistantMessageDelta, { type: "toolcall_end" }>["toolCall"] {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "toolCall" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { name?: unknown }).name === "string" &&
    !!(value as { arguments?: unknown }).arguments &&
    typeof (value as { arguments?: unknown }).arguments === "object" &&
    !Array.isArray((value as { arguments?: unknown }).arguments)
  );
}

function applyAssistantDelta(message: AssistantMessage, delta: AssistantMessageDelta) {
  switch (delta.type) {
    case "text_start":
      return replaceContent(message, delta.contentIndex, { type: "text", text: "" });
    case "text_delta": {
      const current = message.content[delta.contentIndex];
      return replaceContent(message, delta.contentIndex, {
        type: "text",
        text: (current?.type === "text" ? current.text : "") + delta.delta,
      });
    }
    case "text_end":
      return replaceContent(message, delta.contentIndex, { type: "text", text: delta.content });
    case "thinking_start":
      return replaceContent(message, delta.contentIndex, { type: "thinking", thinking: "" });
    case "thinking_delta": {
      const current = message.content[delta.contentIndex];
      return replaceContent(message, delta.contentIndex, {
        type: "thinking",
        thinking: (current?.type === "thinking" ? current.thinking : "") + delta.delta,
      });
    }
    case "thinking_end":
      return replaceContent(message, delta.contentIndex, { type: "thinking", thinking: delta.content });
    case "toolcall_start":
      return replaceContent(message, delta.contentIndex, {
        type: "toolCall",
        id: `streaming-tool-${delta.contentIndex}`,
        name: "",
        arguments: {},
      });
    case "toolcall_end":
      return replaceContent(message, delta.contentIndex, delta.toolCall);
    // Stream starts, raw tool argument deltas, and terminal events contain no
    // displayable content beyond what message_start/message_end already carry.
    case "start":
    case "toolcall_delta":
    case "done":
    case "error":
      return message;
  }
}

function replaceContent(message: AssistantMessage, index: number, content: AssistantMessage["content"][number]) {
  const next = message.content.slice();
  next[index] = content;
  return { ...message, content: next };
}

function upsert(entries: SessionEntry[], entry: SessionEntry): SessionEntry[] {
  const i = entries.findIndex((e) => e.id === entry.id);
  if (i === -1) return [...entries, entry];
  const next = entries.slice();
  next[i] = entry;
  return next;
}

export function sessionInfoName(entries: FileEntry[]): string | undefined {
  let name: string | undefined;
  for (const e of entries) {
    if (e.type === "session_info" && typeof (e as { name?: string }).name === "string") {
      name = (e as { name?: string }).name;
    }
  }
  return name;
}

/** Apply an extension's UI request — a dialog, a status line, a widget, a toast. */
export function applyExtensionUi(set: SetState, get: GetState, projectDir: string, req: ExtensionUiRequest): void {
  switch (req.method) {
    case "select":
    case "confirm":
    case "input":
    case "editor":
      set((s) => {
        const prompts = [...(s.extensionPromptsByProject[projectDir] ?? []), req];
        return {
          extensionPromptsByProject: { ...s.extensionPromptsByProject, [projectDir]: prompts },
          ...(projectDir === s.activeProjectPath ? { extPrompts: prompts } : {}),
        };
      });
      return;
    case "notify":
      // Straight to the toast layer: a notification is not state anything reads
      // back, so holding it in the store only duplicated sonner's own queue.
      showExtensionNotification(req.message, req.notifyType ?? "info");
      return;
    case "setStatus":
      set((s) => {
        const next = { ...s.extStatuses };
        if (req.statusText === undefined) delete next[req.statusKey];
        else next[req.statusKey] = stripAnsi(req.statusText);
        return { extStatuses: next };
      });
      return;
    case "setWidget":
      set((s) => {
        const next = { ...s.extWidgets };
        if (req.widgetLines === undefined) delete next[req.widgetKey];
        else next[req.widgetKey] = { lines: req.widgetLines, placement: req.widgetPlacement ?? "aboveEditor" };
        return { extWidgets: next };
      });
      return;
    case "set_editor_text": {
      const s = get();
      const key = draftKeyFor(s.activeProjectPath, s.activeSessionFile);
      set({ drafts: { ...s.drafts, [key]: req.text } });
      return;
    }
    default:
      return;
  }
}
