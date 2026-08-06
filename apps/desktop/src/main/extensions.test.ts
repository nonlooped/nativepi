import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const rendererHtml = new URL("../renderer/index.html", import.meta.url);

test("renderer CSP allows compiled graphical extension modules", async () => {
  const html = await readFile(rendererHtml, "utf8");
  const policy = html.match(/Content-Security-Policy[\s\S]*?content="([^"]+)"/)?.[1];
  const scriptSources = policy?.match(/script-src ([^;]+)/)?.[1].split(/\s+/);

  expect(scriptSources).toContain("blob:");
});
