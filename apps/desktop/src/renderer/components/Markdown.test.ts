import { expect, test } from "bun:test";
import type { MouseEvent } from "react";

import "@/lib/store/testBridge.ts";

const { handleMarkdownLink } = await import("./Markdown.tsx");

test("prevents navigation for a sanitized empty markdown link", () => {
  let prevented = false;

  handleMarkdownLink({ preventDefault: () => { prevented = true; } } as MouseEvent<HTMLAnchorElement>, "");

  expect(prevented).toBe(true);
});
