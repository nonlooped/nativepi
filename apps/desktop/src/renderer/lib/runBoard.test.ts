import { expect, test } from "bun:test";
import { currentTool, runModel, runTokens } from "./runBoard.ts";
import type { AssistantContent, SessionEntry } from "../../shared/pi-types.ts";

const assistant = (content: AssistantContent[]): SessionEntry => ({
  type: "message",
  id: crypto.randomUUID(),
  parentId: null,
  timestamp: new Date().toISOString(),
  message: { role: "assistant", content, provider: "openai", model: "gpt-5", usage: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 5 }, timestamp: 1 },
});

test("summarizes a run's model, token burn, and active tool", () => {
  const entries = [assistant([{ type: "toolCall", id: "call-1", name: "bash", arguments: {} }])];
  expect(runModel(entries)).toBe("openai/gpt-5");
  expect(runTokens(entries)).toBe(5);
  expect(currentTool(entries, null)).toBe("bash");
});

test("does not report a tool once Pi returned its result", () => {
  const entries = [
    assistant([{ type: "toolCall", id: "call-1", name: "bash", arguments: {} }]),
    { type: "message", id: "result", parentId: null, timestamp: new Date().toISOString(), message: { role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [], isError: false, timestamp: 2 } },
  ] as SessionEntry[];
  expect(currentTool(entries, null)).toBeUndefined();
});
