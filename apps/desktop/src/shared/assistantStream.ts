import type { AssistantMessage, AssistantMessageDelta } from "./pi-types.ts";

/** Assemble Pi's compact stream protocol; message_end remains the final source of truth. */
export function isAssistantMessageDelta(value: unknown): value is AssistantMessageDelta {
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

export function applyAssistantDelta(message: AssistantMessage, delta: AssistantMessageDelta) {
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

