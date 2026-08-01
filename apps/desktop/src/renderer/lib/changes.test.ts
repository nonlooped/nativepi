import { describe, expect, test } from "bun:test";
import type { AssistantMessage, ToolResultMessage } from "../../shared/pi-types.ts";
import { countPatchLines, diffPatchFor, fileDir, fileName, turnChanges } from "./changes.ts";

function assistant(...content: AssistantMessage["content"]): AssistantMessage {
  return { role: "assistant", content } as AssistantMessage;
}

function toolCall(id: string, name: string, args: Record<string, unknown>) {
  return { type: "toolCall", id, name, arguments: args } as const;
}

function result(toolCallId: string, options: { patch?: string; isError?: boolean } = {}): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId,
    content: [{ type: "text", text: "ok" }],
    isError: options.isError,
    details: options.patch ? { patch: options.patch } : undefined,
  } as ToolResultMessage;
}

const PATCH = ["@@ -1,3 +1,4 @@", " context", "-gone", "+added", "+added too"].join("\n");

describe("countPatchLines", () => {
  test("counts additions and removals, ignoring headers and context", () => {
    expect(countPatchLines(PATCH)).toEqual({ added: 2, removed: 1 });
  });

  test("does not count file headers as changes", () => {
    const patch = ["--- a/x", "+++ b/x", "@@ -1 +1 @@", "+one"].join("\n");
    expect(countPatchLines(patch)).toEqual({ added: 1, removed: 0 });
  });
});

describe("diffPatchFor", () => {
  test("synthesizes an all-additions patch for a write", () => {
    const patch = diffPatchFor(toolCall("1", "write", { path: "x", content: "a\nb" }));
    expect(patch).toBe("--- /dev/null\n+++ x\n@@ -0,0 +1,2 @@\n+a\n+b");
  });

  test("has no patch for a write with no path", () => {
    expect(diffPatchFor(toolCall("1", "write", { content: "a\nb" }))).toBeUndefined();
  });

  test("reads an edit's patch from the result details", () => {
    expect(diffPatchFor(toolCall("1", "edit", { path: "x" }), result("1", { patch: PATCH }))).toBe(PATCH);
  });

  test("has no patch for a tool that does not write files", () => {
    expect(diffPatchFor(toolCall("1", "grep", { pattern: "x" }))).toBeUndefined();
  });
});

describe("turnChanges", () => {
  test("collapses repeated edits of one file into a single summed row", () => {
    const messages = [
      assistant(toolCall("1", "edit", { path: "src/a.ts" })),
      assistant(toolCall("2", "edit", { path: "src/a.ts" })),
    ];
    const results = new Map([
      ["1", result("1", { patch: PATCH })],
      ["2", result("2", { patch: PATCH })],
    ]);

    const changes = turnChanges(messages, results);
    expect(changes.files).toHaveLength(1);
    expect(changes.files[0]).toMatchObject({ path: "src/a.ts", added: 4, removed: 2 });
    expect(changes).toMatchObject({ added: 4, removed: 2 });
  });

  test("ignores reads and calls still in flight", () => {
    const messages = [
      assistant(toolCall("1", "read", { path: "src/a.ts" }), toolCall("2", "write", { path: "b.ts", content: "x" })),
    ];
    expect(turnChanges(messages, new Map()).files).toEqual([]);
    expect(turnChanges(messages, new Map([["2", result("2")]])).files).toHaveLength(1);
  });

  test("marks a failed write as failed", () => {
    const messages = [assistant(toolCall("1", "write", { path: "b.ts", content: "x" }))];
    const changes = turnChanges(messages, new Map([["1", result("1", { isError: true })]]));
    expect(changes.files[0]?.failed).toBe(true);
  });
});

describe("path helpers", () => {
  test("split a path into its name and directory on either separator", () => {
    expect(fileName("src/app/main.ts")).toBe("main.ts");
    expect(fileDir("src\\app\\main.ts")).toBe("src/app");
    expect(fileDir("main.ts")).toBe("");
  });
});
