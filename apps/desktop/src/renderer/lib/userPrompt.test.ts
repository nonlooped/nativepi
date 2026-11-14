import { expect, test } from "bun:test";
import { skillPrompt } from "./composerText.ts";
import { userPromptText } from "./userPrompt.ts";

const expansion = '<skill name="choreograph" location="/skills/choreograph/SKILL.md">\nPrivate instructions\n</skill>\n\n';

test("expanded skill keeps the original inline chip and line breaks after reopening", () => {
  for (const draft of [
    "Look into places where we can introduce /skill:choreograph",
    "/skill:choreograph review this",
    "Use /skill:choreograph here\n\nKeep **literal** text and @\"docs/design notes.md\".",
    "/skill:choreograph",
  ]) {
    const outgoing = skillPrompt(draft);
    expect(outgoing).toBe(`/skill:choreograph ${draft}`);
    // Pi replaces the leading invocation with its skill block, keeping its arguments.
    expect(userPromptText(expansion + outgoing.slice('/skill:choreograph '.length))).toBe(draft);
  }
});

test("an unavailable skill still displays the original draft", () => {
  const draft = "Use /skill:missing here";
  expect(userPromptText(skillPrompt(draft))).toBe(draft);
});

test("ordinary text and file chips are not stripped or interpreted as Markdown", () => {
  const draft = '@"docs/design notes.md"\n\n# Literal heading\n- list\n  indented';
  expect(userPromptText(draft)).toBe(draft);
});

test("older skill expansions keep their references inline without exposing instructions", () => {
  expect(userPromptText(expansion + "Review this")).toBe("/skill:choreograph Review this");
  expect(userPromptText(expansion)).toBe("/skill:choreograph");
});
