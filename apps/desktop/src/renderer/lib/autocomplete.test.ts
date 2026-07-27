import { expect, test } from "bun:test";
import { completionText, findTrigger, fuzzyMatch, rankFiles, rankSkills } from "./autocomplete.ts";

test("@ opens wherever a word can start, and closes on a space", () => {
  expect(findTrigger("@src", 4)).toEqual({ kind: "file", query: "src", start: 0, end: 4 });
  expect(findTrigger("look at @lib/st", 15)).toEqual({ kind: "file", query: "lib/st", start: 8, end: 15 });
  expect(findTrigger("@src/a.ts done", 14)).toBeNull();
  // Mid-word, so not a mention: this is an email address, not a file.
  expect(findTrigger("me@example.com", 14)).toBeNull();
});

test("$ opens at any word boundary, since a chip reads mid-sentence", () => {
  expect(findTrigger("$rev", 4)).toEqual({ kind: "skill", query: "rev", start: 0, end: 4 });
  expect(findTrigger("run $rev", 8)).toEqual({ kind: "skill", query: "rev", start: 4, end: 8 });
  // Mid-word, so not a trigger: this is a price.
  expect(findTrigger("costs$5", 7)).toBeNull();
});

test("a query long enough to be a sentence is a sentence", () => {
  expect(findTrigger(`@${"x".repeat(65)}`, 66)).toBeNull();
});

test("an accepted option becomes the text its chip stands for", () => {
  expect(completionText(findTrigger("@sto", 4)!, "src/store.ts")).toBe("@src/store.ts");
  expect(completionText(findTrigger("$rev", 4)!, "review")).toBe("/skill:review");
});

test("a non-subsequence does not match, an empty query matches everything", () => {
  expect(fuzzyMatch("store.ts", "zzz")).toBeNull();
  expect(fuzzyMatch("store.ts", "")).toEqual({ score: 0, positions: [] });
  expect(fuzzyMatch("store.ts", "sts")?.positions).toEqual([0, 1, 7]);
});

test("the file named for the query outranks the one that merely contains it", () => {
  const ranked = rankFiles(["src/lib/restore-tsconfig.ts", "src/store.ts", "a/b/c/d/store.ts"], "store");
  expect(ranked[0]?.value).toBe("src/store.ts");
});

test("a file row splits into the name and the directory holding it", () => {
  const [row] = rankFiles(["src/renderer/Composer.tsx"], "comp");
  expect(row).toMatchObject({ label: "Composer.tsx", detail: "src/renderer" });
  expect(rankFiles(["README.md"], "read")[0]).toMatchObject({ label: "README.md", detail: "" });
});

test("skills rank by name and carry their description for the row", () => {
  const skills = [
    { name: "review", description: "Review a diff", scope: "user" as const },
    { name: "release", description: "Cut a release", scope: "project" as const },
  ];
  expect(rankSkills(skills, "rev").map((s) => s.value)).toEqual(["review"]);
  expect(rankSkills(skills, "").map((s) => s.value)).toEqual(["release", "review"]);
  expect(rankSkills(skills, "rev")[0]).toMatchObject({ detail: "Review a diff", scope: "user" });
});
