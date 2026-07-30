import { expect, test } from "bun:test";
import type { SessionEntry, SessionSummary } from "../../shared/pi-types.ts";
import { textOf } from "../../shared/messages.ts";
import { chatTitle, toolArgSummary, toolResultsById } from "./transcript.ts";

function session(firstMessage: string, name?: string): SessionSummary {
  return {
    path: "s.jsonl",
    id: "s",
    name,
    firstMessage,
    lastPrompt: firstMessage,
    messageCount: 1,
    created: "t",
    modified: "t",
  };
}

test("chatTitle hides leading composer metadata", () => {
  expect(chatTitle(session('/review check this diff'))).toBe("check this diff");
  expect(chatTitle(session('@src/renderer/App.tsx explain this'))).toBe("explain this");
  expect(chatTitle(session('<file name="C:\\project\\App.tsx">\nfile contents\n</file>\nexplain this'))).toBe("explain this");
  expect(chatTitle(session('/skill:releasing publish the app'))).toBe("publish the app");
  expect(
    chatTitle(
      session(
        '<skill name="releasing" location="C:\\skills\\releasing\\SKILL.md">\nReferences are relative to C:\\skills\\releasing.\n\nRelease instructions\n</skill>\n\npublish the app',
      ),
    ),
  ).toBe("publish the app");
});

test("chatTitle uses the leading item name when there is no request text", () => {
  expect(chatTitle(session('/review'))).toBe("review");
  expect(chatTitle(session('@src/renderer/App.tsx'))).toBe("App.tsx");
  expect(chatTitle(session('<file name="C:\\project\\App.tsx">\nfile contents\n</file>'))).toBe("App.tsx");
  expect(chatTitle(session('<skill name="releasing" location="C:\\skills\\releasing\\SKILL.md">\nRelease instructions\n</skill>'))).toBe("releasing");
});

test("chatTitle preserves an explicit session name", () => {
  expect(chatTitle(session('/review check this diff', "Release review"))).toBe("Release review");
});

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
