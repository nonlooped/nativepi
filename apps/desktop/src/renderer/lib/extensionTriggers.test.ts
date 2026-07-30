import { expect, test } from "bun:test";
import { findTrigger, linesAt, offsetAt } from "./autocomplete.ts";

/**
 * Extension trigger characters, against the three the composer already owns.
 *
 * An extension declares these through `ctx.ui.addAutocompleteProvider()`, and the
 * composer documents `/`, `$` and `@` as meaning particular things — so an
 * extension can add a character but never take one of those over.
 */

test("a declared character opens an extension trigger", () => {
  const trigger = findTrigger("fix #12", 7, ["#"]);

  expect(trigger).toEqual({ kind: "extension", query: "12", start: 4, end: 7 });
});

test("the built-in triggers win over an extension asking for them", () => {
  expect(findTrigger("@src", 4, ["@"])?.kind).toBe("file");
  expect(findTrigger("$review", 7, ["$"])?.kind).toBe("skill");
  expect(findTrigger("/commit", 7, ["/"])?.kind).toBe("command");
});

test("a character no extension declared is just text", () => {
  expect(findTrigger("fix #12", 7, [])).toBeNull();
  expect(findTrigger("fix #12", 7, ["!"])).toBeNull();
});

test("an extension trigger opens at a word boundary like the others do", () => {
  // Mid-word is not a trigger: `C#` is a language, not a request for a list.
  expect(findTrigger("in C#", 5, ["#"])).toBeNull();
});

test("a multi-character trigger is not mistaken for a one-character one", () => {
  // `triggerCharacters` is a list of strings, not of characters, so the query
  // starts where the declared trigger ends rather than one character in.
  expect(findTrigger("see ##12", 8, ["##"])).toEqual({ kind: "extension", query: "12", start: 4, end: 8 });
});

test("the longer of two overlapping triggers claims the token", () => {
  expect(findTrigger("see ##12", 8, ["#", "##"])?.query).toBe("12");
  expect(findTrigger("see #12", 7, ["#", "##"])?.query).toBe("12");
});

test("the draft reaches a provider as lines and a caret, and comes back", () => {
  // Providers are written against pi-tui's multi-line editor, so a draft with a
  // paragraph in it has to arrive the way it would from the terminal.
  const text = "first line\nsecond #12";
  const at = linesAt(text, text.length);

  expect(at).toEqual({ lines: ["first line", "second #12"], cursorLine: 1, cursorCol: 10 });
  expect(offsetAt(at.lines, at.cursorLine, at.cursorCol)).toBe(text.length);
});

test("a caret at the very start of a wrapped draft round trips", () => {
  const at = linesAt("a\nb", 2);

  expect(at).toEqual({ lines: ["a", "b"], cursorLine: 1, cursorCol: 0 });
  expect(offsetAt(at.lines, at.cursorLine, at.cursorCol)).toBe(2);
});
