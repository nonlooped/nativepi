import { expect, test } from "bun:test";
import type { MouseEvent } from "react";

import "@/lib/store/testBridge.ts";

const { handleMarkdownLink, markdownUrlTransform } = await import("./Markdown.tsx");

test("preserves local image paths without allowing unsafe link protocols", () => {
  for (const src of ["C:/project/image.png", "C:\\project\\image.png", "file:///C:/project/image.png", "./image.png", "/tmp/image.png", "https://example.com/image.png"]) {
    expect(markdownUrlTransform(src, "src")).toBe(src);
  }
  expect(markdownUrlTransform("javascript:alert(1)", "src")).toBe("");
  expect(markdownUrlTransform("file:///C:/secret.txt", "href")).toBe("");
});

test("prevents navigation for a sanitized empty markdown link", () => {
  let prevented = false;

  handleMarkdownLink({ preventDefault: () => { prevented = true; } } as MouseEvent<HTMLAnchorElement>, "");

  expect(prevented).toBe(true);
});
