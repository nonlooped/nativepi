import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";

// Exercise Next's emitted HTML and redirect matching against a running local server.
const origin = new URL(process.env.NATIVEPI_SEO_ORIGIN ?? "http://localhost:3000");
assert.equal(origin.protocol, "http:", "Use the local HTTP development or production server.");

function get(path, host = origin.host) {
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, origin), { headers: { Host: host } }, response => {
      let html = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { html += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, html }));
      response.on("error", reject);
    });
    req.setTimeout(15_000, () => req.destroy(new Error(`SEO check timed out: ${path}`)));
    req.on("error", reject);
    req.end();
  });
}

function meta(html) {
  return new Map([...html.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    return [attributes.name ?? attributes.property, attributes.content];
  }));
}

test("download sharing metadata describes the download page and retains the shared image", async () => {
  const { status, html } = await get("/download");
  assert.equal(status, 200);
  const tags = meta(html);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.match(title, /Download NativePi.*Windows.*macOS.*Linux/);
  assert.equal(tags.get("og:title"), title);
  assert.equal(tags.get("twitter:title"), title);
  assert.equal(tags.get("og:description"), tags.get("description"));
  assert.equal(tags.get("twitter:description"), tags.get("description"));
  assert.equal(tags.get("og:type"), "website");
  assert.equal(tags.get("og:site_name"), "NativePi");
  assert.equal(tags.get("og:image"), "https://nativepi.nonlooped.xyz/share.png");
  assert.equal(tags.get("twitter:image"), tags.get("og:image"));
  assert.match(html, /<link rel="canonical" href="https:\/\/nativepi\.nonlooped\.xyz\/download"/);
});

test("the legacy host redirects permanently while preserving root, paths, and query values", async () => {
  for (const path of ["/", "/download?source=search&arch=arm64", "/docs/extension-api?ref=old%20link"]) {
    const response = await get(path, "nativepi.vercel.app");
    assert.equal(response.status, 308);
    // Next omits the optional trailing slash when redirecting the origin itself.
    assert.equal(new URL(response.headers.location).href, new URL(path, "https://nativepi.nonlooped.xyz").href);
  }
});

test("canonical, preview, local, and similar-looking hosts do not enter the legacy redirect", async () => {
  for (const host of ["nativepi.nonlooped.xyz", "nativepi-preview.vercel.app", origin.host, "nativepiXvercelXapp"]) {
    assert.equal((await get("/", host)).status, 200, host);
  }
});
