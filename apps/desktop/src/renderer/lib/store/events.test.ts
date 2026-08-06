import { expect, test } from "bun:test";
import type { AssistantMessage, PiEvent } from "../../../shared/pi-types.ts";
import { emptyConversation } from "./conversation.ts";
import { reduce } from "./events.ts";

function assistant(): AssistantMessage {
  return { role: "assistant", content: [], timestamp: 0 };
}

function apply(message: AssistantMessage, event: PiEvent): AssistantMessage {
  const streaming = reduce({ ...emptyConversation(), streaming: message }, event).streaming;
  if (!streaming) throw new Error("Expected a streaming assistant message.");
  return streaming;
}

test("assembles Pi's non-cumulative assistant deltas", () => {
  let message = assistant();
  message = apply(message, { type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  message = apply(message, { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello" } });
  message = apply(message, { type: "message_update", assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "Hello!" } });
  message = apply(message, { type: "message_update", assistantMessageEvent: { type: "thinking_start", contentIndex: 1 } });
  message = apply(message, { type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 1, delta: "Checking" } });
  message = apply(message, { type: "message_update", assistantMessageEvent: { type: "thinking_end", contentIndex: 1, content: "Checking the repository" } });
  message = apply(message, { type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 2 } });
  message = apply(message, { type: "message_update", assistantMessageEvent: { type: "toolcall_delta", contentIndex: 2, delta: '{"path":"package.json"}' } });
  message = apply(message, {
    type: "message_update",
    assistantMessageEvent: {
      type: "toolcall_end",
      contentIndex: 2,
      toolCall: { type: "toolCall", id: "call-1", name: "read", arguments: { path: "package.json" } },
    },
  });

  expect(message.content).toEqual([
    { type: "text", text: "Hello!" },
    { type: "thinking", thinking: "Checking the repository" },
    { type: "toolCall", id: "call-1", name: "read", arguments: { path: "package.json" } },
  ]);
});

test("ignores a malformed stream delta", () => {
  const message = assistant();
  const patch = reduce(
    { ...emptyConversation(), streaming: message },
    { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: -1, delta: "Nope" } } as unknown as PiEvent,
  );

  expect(patch).toEqual({});
});

test("starts streaming from message_start and commits message_end", () => {
  const started = reduce(emptyConversation(), { type: "message_start", message: assistant() });
  const complete: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "Done" }], timestamp: 1 };
  const ended = reduce({ ...emptyConversation(), ...started }, { type: "message_end", message: complete });

  expect(started.streaming).toEqual(assistant());
  expect(ended.streaming).toBeNull();
  expect(ended.entries?.[0]?.type === "message" && ended.entries[0].message).toEqual(complete);
});
