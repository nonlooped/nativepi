import { expect, test } from "bun:test";
import { diffHighlighterReady, primeDiffHighlighter } from "./diffHighlighter.ts";

test("primes the diff highlighter before the first patch mounts", async () => {
  expect(diffHighlighterReady()).toBe(false);

  await primeDiffHighlighter();

  expect(diffHighlighterReady()).toBe(true);
});
