import { describe, expect, test } from "bun:test";
import { cn } from "./utils.ts";

describe("semantic typography class merging", () => {
  test("keeps sizes alongside foreground colors", () => {
    for (const size of ["reading", "composer", "title", "heading", "headline"]) {
      expect(cn(`text-${size}`, "text-muted-foreground")).toBe(`text-${size} text-muted-foreground`);
      expect(cn("text-foreground", `text-${size}`)).toBe(`text-foreground text-${size}`);
    }
  });

  test("lets component callers override size and leading", () => {
    expect(cn("text-title", "text-sm")).toBe("text-sm");
    expect(cn("text-sm leading-6", "text-reading")).toBe("text-reading");
    expect(cn("text-reading", "leading-normal")).toBe("text-reading leading-normal");
  });
});
