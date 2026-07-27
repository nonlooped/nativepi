import { expect, test } from "bun:test";
import { chipText, hoistSkill, parseSegments } from "./composerText.ts";

test("a draft splits into prose and the tokens drawn as chips", () => {
  expect(parseSegments("look at @src/a.ts please")).toEqual([
    { kind: "text", value: "look at " },
    { kind: "file", value: "src/a.ts" },
    { kind: "text", value: " please" },
  ]);
  expect(parseSegments("/skill:review this")).toEqual([
    { kind: "skill", value: "review" },
    { kind: "text", value: " this" },
  ]);
});

test("mid-word sigils are prose, not chips", () => {
  expect(parseSegments("mail me@example.com")).toEqual([{ kind: "text", value: "mail me@example.com" }]);
  expect(parseSegments("costs $5")).toEqual([{ kind: "text", value: "costs $5" }]);
});

test("a bare sigil with nothing after it is still just typing", () => {
  expect(parseSegments("@")).toEqual([{ kind: "text", value: "@" }]);
  expect(parseSegments("/skill:")).toEqual([{ kind: "text", value: "/skill:" }]);
});

test("chips round-trip through the text they serialize to", () => {
  const text = "compare @a/b.ts with @c.ts under /skill:review";
  expect(parseSegments(text).map((s) => (s.kind === "text" ? s.value : chipText(s.kind, s.value))).join("")).toBe(text);
});

test("a skill placed mid-sentence reaches Pi at the head, where it expands", () => {
  expect(hoistSkill("please /skill:review this diff")).toBe("/skill:review please this diff");
  expect(hoistSkill("/skill:review this diff")).toBe("/skill:review this diff");
  expect(hoistSkill("no skill here")).toBe("no skill here");
});
