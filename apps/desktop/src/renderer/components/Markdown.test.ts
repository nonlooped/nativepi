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
  for (const href of ["file:///C:/secret.txt", "C:/project/private.txt", "javascript:alert(1)", "data:text/html,<script/>"]) {
    expect(markdownUrlTransform(href, "href")).toBe("");
  }
  for (const href of ["https://example.com", "./file.ts", "#section", "mailto:person@example.com"]) {
    expect(markdownUrlTransform(href, "href")).toBe(href);
  }
});

test("prevents navigation for a sanitized empty markdown link", () => {
  let prevented = false;

  handleMarkdownLink({ preventDefault: () => { prevented = true; } } as MouseEvent<HTMLAnchorElement>, "");

  expect(prevented).toBe(true);
});


test("remote Markdown images render a readable fallback without a browser image request", () => {
  for (const source of ["https://example.com/image.png", "http://localhost/image.png", "//example.com/image.png"]) {
    const markup = renderToStaticMarkup(createElement(Markdown, { children: `![Diagram](${source})` }));
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain('rel="preload"');
    expect(markup).toContain("Diagram");
    expect(markup).toContain("Remote images are not loaded.");
  }
});

test("local Markdown images do not expose filesystem paths as browser image sources", () => {
  const markup = renderToStaticMarkup(createElement(Markdown, { children: "![Local](./image.png)" }));
  expect(markup).not.toContain("<img");
  expect(markup).toContain("Open a project to view this image.");
});
