import type { AssistantMessage, SessionEntry, ToolResultMessage } from "../../shared/pi-types.ts";

function messages(entries: SessionEntry[]): (AssistantMessage | ToolResultMessage)[] {
  return entries.flatMap((entry) => {
    if (entry.type !== "message") return [];
    const message = (entry as { message?: unknown }).message;
    if (!message || typeof message !== "object") return [];
    const role = (message as { role?: unknown }).role;
    return role === "assistant" || role === "toolResult" ? [message as AssistantMessage | ToolResultMessage] : [];
  });
}

export function runTokens(entries: SessionEntry[]): number {
  return messages(entries).reduce((total, message) => total + (message.role === "assistant" ? message.usage?.totalTokens ?? 0 : 0), 0);
}

export function runModel(entries: SessionEntry[]): string | undefined {
  const assistant = messages(entries).findLast((message): message is AssistantMessage => message.role === "assistant");
  if (!assistant?.model) return undefined;
  return assistant.provider ? `${assistant.provider}/${assistant.model}` : assistant.model;
}

/** The last tool call without a matching result is the tool Pi is currently waiting on. */
export function currentTool(entries: SessionEntry[], streaming: AssistantMessage | null): string | undefined {
  const completed = new Set(
    messages(entries)
      .filter((message): message is ToolResultMessage => message.role === "toolResult")
      .map((message) => message.toolCallId),
  );
  const assistant = streaming ?? messages(entries).findLast((message): message is AssistantMessage => message.role === "assistant");
  const tool = assistant?.content.findLast((block) => block.type === "toolCall" && !completed.has(block.id));
  return tool?.type === "toolCall" ? tool.name : undefined;
}
