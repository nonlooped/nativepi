import { expect, test } from "bun:test";
import { createElement, type MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "@/lib/store/testBridge.ts";

const { default: Markdown, handleMarkdownLink, markdownUrlTransform } = await import("./Markdown.tsx");

test("preserves local image paths while keeping unsafe protocols out of images and links", () => {
  for (const src of ["C:/project/中文 image.png", "C:\\project\\image.png", "file:///C:/project/image.png", "./image.png", "/tmp/image.png", "https://example.com/image.png", "//example.com/image.png"]) {
    expect(markdownUrlTransform(src, "src")).toBe(src);
  }
  for (const src of ["javascript:alert(1)", "vbscript:msgbox(1)", "data:image/svg+xml,<svg/>", "mailto:private@example.com", "irc://example.com"]) {
    expect(markdownUrlTransform(src, "src")).toBe("");
  }
  for (const href of ["javascript:alert(1)", "data:text/html,<script/>", "file://server/share/private.txt"]) {
    expect(markdownUrlTransform(href, "href")).toBe("");
  }
  for (const href of ["https://example.com", "./file.ts", "file:///C:/project/file.ts", "C:/project/file.ts", "#section", "mailto:person@example.com"]) {
    expect(markdownUrlTransform(href, "href")).toBe(href);
  }
});

test("prevents navigation for a sanitized empty markdown link", () => {
  let prevented = false;

  handleMarkdownLink({ preventDefault: () => { prevented = true; } } as MouseEvent<HTMLAnchorElement>, "");

  expect(prevented).toBe(true);
});


test("remote Markdown media renders an inline chip without a browser media request", () => {
  for (const source of ["https://example.com/image.png", "http://localhost/image.png", "//example.com/image.png"]) {
    const markup = renderToStaticMarkup(createElement(Markdown, { children: `![Diagram](${source})` }));
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain('rel="preload"');
    expect(markup).toContain("Diagram");
    expect(markup).toContain('class="transcript-reference"');
  }
});

test("local Markdown images do not expose filesystem paths as browser image sources", () => {
  const markup = renderToStaticMarkup(createElement(Markdown, { children: "![Local](./image.png)" }));
  expect(markup).not.toContain("<img");
  expect(markup).toContain('class="transcript-reference"');
  expect(markup).not.toContain('<img src="./image.png"');
});


test("prose references become chips while fenced commands remain literal", () => {
  const markup = renderToStaticMarkup(createElement(Markdown, { children: "See @src/app.ts:12 and `src/other.ts`.\n\n```sh\ncat src/app.ts\n```\n\n`bun test src/app.ts`" }));
  expect(markup).toContain('data-reference-source="@src/app.ts:12"');
  expect(markup).toContain('data-reference-source="`src/other.ts`"');
  expect(markup).not.toContain('data-reference-source="cat');
  expect(markup).not.toContain('data-reference-source="`bun test');
});

test("links retain authored labels, recognize PRs and preserve punctuation", () => {
  const markup = renderToStaticMarkup(createElement(Markdown, { children: "[Read the guide](./docs/guide.md), https://github.com/org/repo/pull/12." }));
  expect(markup).toContain("Read the guide");
  expect(markup).toContain("org/repo#12");
  expect(markup).toContain('data-reference-source="[Read the guide](./docs/guide.md)"');
  expect(markup).toContain(".</p>");
});
