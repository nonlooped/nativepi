import { expect, test } from "bun:test";
import { referenceFor, referenceMatches, quoteMarkdown, terminalSelectionMarkdown, threadHref } from "./markdownReferences.ts";

const skills = [{ name: "review", path: "/home/me/skills/review/SKILL.md", description: "Review changes", scope: "user" as const }];

test("recognizes file mentions, folder paths and source locations across platforms", () => {
  for (const path of ["@src/app.ts", "src/app.ts", "./src/app.ts", "/tmp/app.ts", "C:\\project\\app.ts", "file:///tmp/app.ts"]) {
    expect(referenceFor(path)).toMatchObject({ kind: "file" });
  }
  expect(referenceFor('@"src/my file.ts"')).toMatchObject({ kind: "file", path: "src/my file.ts" });
  expect(referenceFor("src/")).toMatchObject({ kind: "file", folder: true, label: "src/" });
  expect(referenceFor("src/app.ts:12:4")).toMatchObject({ path: "src/app.ts", line: 12, column: 4, label: "app.ts:12:4" });
  expect(referenceFor("src/app.ts#L12-L18")).toMatchObject({ path: "src/app.ts", line: 12, label: "app.ts#L12-L18" });
  expect(referenceFor("src/app.ts:12-18")).toMatchObject({ path: "src/app.ts", line: 12 });
});

test("skills resolve explicit tokens, known slash names and instruction paths", () => {
  for (const token of ["$review", "/skill:review", "/review", skills[0].path]) {
    expect(referenceFor(token, skills)).toMatchObject({ kind: "skill", name: "review", path: skills[0].path });
  }
  expect(referenceFor(".agents/skills/design/SKILL.md")).toMatchObject({ kind: "skill", name: "design" });
  expect(referenceFor("$100")).toBeNull();
});

test("recognizes web, PR, merge request and source-linked chat references", () => {
  expect(referenceFor("https://example.com/docs")).toMatchObject({ kind: "web", label: "example.com" });
  expect(referenceFor("https://github.com/org/repo/pull/123/files")).toMatchObject({ kind: "pull-request", label: "org/repo#123" });
  expect(referenceFor("https://gitlab.com/group/repo/-/merge_requests/42")).toMatchObject({ kind: "pull-request", label: "group/repo#42" });
  expect(referenceFor(threadHref("/path with space/chat.jsonl", "entry-1"))).toEqual({ kind: "thread", session: "/path with space/chat.jsonl", entry: "entry-1" });
});

test("prose recognition leaves punctuation, emails, versions, domains and unsafe protocols alone", () => {
  const text = 'See @src/app.ts:12, src/ and $review. Visit https://example.com/a_(b).';
  expect(referenceMatches(text, skills).map(match => match.raw)).toEqual(["@src/app.ts:12", "src/", "$review", "https://example.com/a_(b)"]);
  for (const text of ["me@example.com", "version 1.2.3", "example.com", "javascript:secret.txt", "data:text/html", "npm/@scope/package"]) {
    expect(referenceMatches(text)).toEqual([]);
  }
  for (const value of ["javascript:alert(1)", "data:text/html,hi", "file://server/share/private.txt", "\\\\server\\private.txt", "nativepi://settings", "$100"]) {
    expect(referenceFor(value)).toBeNull();
  }
});

test("quote and terminal context keep all content in portable Markdown", () => {
  expect(quoteMarkdown(" first\nsecond ")).toBe("> first\n> second\n\n");
  expect(quoteMarkdown("answer", { session: "chat.jsonl", entry: "a" })).toContain(`> [Reply to response](${threadHref("chat.jsonl", "a")})`);
  const terminal = terminalSelectionMarkdown("hello\n```\nworld", "Build", 8, 10);
  expect(terminal).toContain("> Terminal: Build · lines 8–10");
  expect(terminal).toContain("> ````text\n> hello\n> ```\n> world\n> ````");
  expect(quoteMarkdown("  ")).toBe("");
});
