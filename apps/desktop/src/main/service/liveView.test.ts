import { expect, test } from "bun:test";
import { LiveView } from "./liveView.ts";
test("current output folds Pi deltas and disappears when Pi persists the message", () => {
  const view = new LiveView();
  view.accept({ type: "agent_start" });
  view.accept({ type: "message_start", message: { role: "assistant", content: [] } });
  view.accept({ type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  view.accept({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Current " } });
  view.accept({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "output" } });
  view.accept({ type: "queue_update", steering: ["change"], followUp: [] });
  expect(view.snapshot()).toEqual([{ type: "agent_start" }, { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "Current output" }] } }, { type: "queue_update", steering: ["change"], followUp: [] }]);
  view.accept({ type: "message_end", message: { role: "assistant" } });
  expect(view.snapshot().some(event => event.type === "message_start")).toBe(false);
  view.accept({ type: "agent_settled" });
  expect(view.snapshot().some(event => event.type === "agent_start")).toBe(false);
});
test("answers and settlement remove prompts; retry and compaction do not stay stuck", () => {
  const view = new LiveView();
  for (const id of ["a", "b"]) view.accept({ type: "extension_ui_request", method: "confirm", id });
  view.answered("a");
  expect(view.snapshot()).toEqual([{ type: "extension_ui_request", method: "confirm", id: "b" }]);
  view.accept({ type: "auto_retry_start" }); view.accept({ type: "auto_retry_end" });
  view.accept({ type: "compaction_start" }); view.accept({ type: "compaction_end" });
  view.accept({ type: "agent_settled" }); expect(view.snapshot()).toEqual([]);
});

test("reconnect retains thinking, finalized tool calls and live tool progress", () => {
  const view = new LiveView();
  view.accept({ type: "message_start", message: { role: "assistant", content: [] } });
  for (const assistantMessageEvent of [
    { type: "thinking_start", contentIndex: 0 },
    { type: "thinking_delta", contentIndex: 0, delta: "Inspect callers" },
    { type: "toolcall_start", contentIndex: 1 },
    { type: "toolcall_end", contentIndex: 1, toolCall: { type: "toolCall", id: "call", name: "read", arguments: { path: "a.ts" } } },
  ]) view.accept({ type: "message_update", assistantMessageEvent });
  expect(view.snapshot()[0]!.message).toMatchObject({ content: [{ type: "thinking", thinking: "Inspect callers" }, { type: "toolCall", id: "call", name: "read", arguments: { path: "a.ts" } }] });
  const start = { type: "tool_execution_start", toolCallId: "call", toolName: "read", args: { path: "a.ts" } };
  const update = { type: "tool_execution_update", toolCallId: "call", partialResult: { content: [{ type: "text", text: "Loading file" }] } };
  view.accept(start); view.accept(update);
  expect(view.snapshot().slice(-2)).toEqual([start, update]);
  view.accept({ type: "tool_execution_end", toolCallId: "call" });
  expect(view.snapshot()).toHaveLength(1);
});
