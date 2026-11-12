import type { AssistantMessage, SessionEntry, ToolResultMessage } from "../../shared/pi-types.ts";
import { isUser, isToolResult, isAssistant } from "../../shared/messages.ts";
import { turnChanges } from "./changes.ts";

export function lastTurnFileCount(items: TranscriptItem[], results: Map<string, ToolResultMessage>): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== "response") continue;
    return turnChanges(item.messages, results).files.filter((file) => !file.failed).length;
  }
  return 0;
}

export function activeToolName(items: TranscriptItem[], results: Map<string, ToolResultMessage>): string | undefined {
  const last = items.at(-1);
  if (last?.type !== "response") return undefined;
  for (let i = last.messages.length - 1; i >= 0; i--) {
    for (const block of last.messages[i]!.content) {
      if (block.type === "toolCall" && !results.has(block.id)) return block.name;
    }
  }
  return undefined;
}

export type TranscriptItem =
  | { type: "entry"; entry: SessionEntry }
  | {
      type: "response";
      id: string;
      messages: AssistantMessage[];
      startedAt?: string;
      finishedAt?: string;
    };

export function transcriptItems(entries: SessionEntry[]): { items: TranscriptItem[]; responseStartedAt?: string } {
  const items: TranscriptItem[] = [];
  let responseStartedAt: string | undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "message") {
      items.push({ type: "entry", entry });
      continue;
    }
    if (isUser(entry.message)) {
      responseStartedAt = entry.timestamp;
      items.push({ type: "entry", entry });
      continue;
    }
    if (isToolResult(entry.message)) continue;
    if (!isAssistant(entry.message)) {
      items.push({ type: "entry", entry });
      continue;
    }

    const messages = [entry.message];
    let finishedAt = entry.timestamp;
    while (i + 1 < entries.length) {
      const next = entries[i + 1];
      if (next.type !== "message" || (!isAssistant(next.message) && !isToolResult(next.message))) break;
      i++;
      finishedAt = next.timestamp;
      if (isAssistant(next.message)) messages.push(next.message);
    }
    items.push({
      type: "response",
      id: entry.id,
      messages,
      startedAt: responseStartedAt,
      finishedAt,
    });
  }

  return { items, responseStartedAt };
}

export function appendStreaming(
  items: TranscriptItem[],
  streaming: AssistantMessage | null,
  responseStartedAt?: string,
): TranscriptItem[] {
  if (!streaming) return items;
  const next = items.slice();
  const last = next.at(-1);
  if (last?.type === "response") {
    next[next.length - 1] = {
      ...last,
      messages: [...last.messages, streaming],
      finishedAt: undefined,
    };
  } else {
    next.push({
      type: "response",
      id: "streaming-response",
      messages: [streaming],
      startedAt: responseStartedAt,
    });
  }
  return next;
}
