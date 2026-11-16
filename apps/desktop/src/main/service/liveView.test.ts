import { expect, test } from "bun:test";
import { LiveView } from "./liveView.ts";
test("current output replaces deltas and disappears when Pi persists the message", () => {
  const view = new LiveView();
  view.accept({ type: "agent_start" });
  view.accept({ type: "message_start", message: { role: "assistant", content: [] } });
  view.accept({ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "Current output" }] } });
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
