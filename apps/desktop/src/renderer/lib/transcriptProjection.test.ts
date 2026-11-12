import { expect, test } from "bun:test";
import type { AssistantMessage, SessionEntry } from "../../shared/pi-types.ts";
import { activeToolName, appendStreaming, transcriptItems } from "./transcriptProjection.ts";
const entry = (id: string, role: string, content: unknown): SessionEntry => ({ type: "message", id, parentId: null, timestamp: id, message: { role, content } }) as SessionEntry;
test("groups assistant/tool chains without consuming repeated prompts or custom entries", () => {
  const entries = [entry("one", "user", "repeat"), entry("a", "assistant", [{ type: "toolCall", id: "call", name: "read", arguments: {} }]), entry("t", "toolResult", "result"), entry("b", "assistant", [{ type: "text", text: "done" }]), entry("two", "user", "repeat"), { type: "custom", id: "custom" } as SessionEntry];
  const { items, responseStartedAt } = transcriptItems(entries);
  expect(items.map(item => item.type)).toEqual(["entry", "response", "entry", "entry"]);
  expect(items[1]).toMatchObject({ id: "a", startedAt: "one", finishedAt: "b" });
  expect(items[1].type === "response" && items[1].messages).toHaveLength(2);
  expect(responseStartedAt).toBe("two");
});
test("streaming extends the existing response without mutating its positional identity or finalized messages", () => {
  const projected = transcriptItems([entry("u", "user", "prompt"), entry("a", "assistant", [{ type: "toolCall", id: "call", name: "read", arguments: {} }])]);
  const streaming = { role: "assistant", content: [{ type: "text", text: "live" }] } as AssistantMessage;
  const next = appendStreaming(projected.items, streaming, projected.responseStartedAt);
  expect(next[1]).toMatchObject({ type: "response", id: "a", finishedAt: undefined });
  expect(next[1].type === "response" && next[1].messages).toHaveLength(2);
  expect(projected.items[1].type === "response" && projected.items[1].messages).toHaveLength(1);
  expect(activeToolName(next, new Map())).toBe("read");
  expect(activeToolName(next, new Map([["call", {} as any]]))).toBeUndefined();
});
