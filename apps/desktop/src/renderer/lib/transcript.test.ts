import { expect, test } from "bun:test";
import type { SessionEntry } from "../../shared/pi-types.ts";
import { textOf } from "../../shared/messages.ts";
import { toolArgSummary, toolResultsById } from "./transcript.ts";

test("textOf flattens string and block content, ignoring non-text blocks", () => {
  expect(textOf("plain")).toBe("plain");
  expect(
    textOf([
      { type: "text", text: "a" },
      { type: "image", data: "x", mimeType: "image/png" },
      { type: "text", text: "b" },
    ]),
  ).toBe("ab");
  expect(textOf(undefined)).toBe("");
});

test("toolResultsById maps each toolResult message by its toolCallId", () => {
  const entries: SessionEntry[] = [
    {
      type: "message",
      id: "1",
      parentId: null,
      timestamp: "t",
      message: { role: "assistant", content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: {} }], timestamp: 1 },
    },
    {
      type: "message",
      id: "2",
      parentId: "1",
      timestamp: "t",
      message: { role: "toolResult", toolCallId: "tc1", toolName: "bash", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 2 },
    },
  ];
  const map = toolResultsById(entries);
  expect(map.get("tc1")?.isError).toBe(false);
  expect(textOf(map.get("tc1")!.content)).toBe("ok");
});

test("toolArgSummary surfaces the primary argument by common key names", () => {
  expect(toolArgSummary("bash", { command: "ls -a" })).toBe("ls -a");
  expect(toolArgSummary("edit", { file_path: "/a/b.ts" })).toBe("/a/b.ts");
  expect(toolArgSummary("grep", { pattern: "foo" })).toBe("foo");
  expect(toolArgSummary("unknown", { other: 1 })).toBe("");
});
