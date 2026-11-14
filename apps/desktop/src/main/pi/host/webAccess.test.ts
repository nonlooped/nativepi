import { afterEach, expect, spyOn, test } from "bun:test";
import { exaCall, retryDelay } from "./webAccess.ts";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test("retry timing accepts seconds and dates and recovers malformed values", () => {
  expect(retryDelay("12")).toBe(12000);
  expect(retryDelay("Thu, 01 Jan 1970 00:00:20 GMT", 10000)).toBe(10000);
  expect(retryDelay("nonsense")).toBe(60000);
  expect(retryDelay("-3")).toBe(1000);
});
test("reads JSON and event-stream results, preserving source text", async () => {
  for (const stream of [false, true]) {
    const reply = JSON.stringify({ id: 1, result: { content: [{ type: "text", text: "https://example.com — source" }] } });
    globalThis.fetch = (async () => new Response(stream ? `event: message\ndata: ${reply}\n\n` : reply, { headers: { "content-type": stream ? "text/event-stream" : "application/json" } })) as unknown as typeof fetch;
    expect(await exaCall("web_search_exa", { query: "test" })).toContain("https://example.com");
  }
});
test("rejects malformed results and oversized responses", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: 1, result: { content: "bad" } }))) as unknown as typeof fetch;
  await expect(exaCall("web_search_exa", {})).rejects.toThrow();
  globalThis.fetch = (async () => new Response("x".repeat(2_000_001))) as unknown as typeof fetch;
  await expect(exaCall("web_search_exa", {})).rejects.toThrow("too large");
});
test("HTTP throttling honors cooldown without issuing repeat requests", async () => {
  const now = spyOn(Date, "now").mockReturnValue(1000000);
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response("", { status: 429, headers: { "retry-after": "30" } }); }) as unknown as typeof fetch;
  try {
    await expect(exaCall("web_search_exa", {})).rejects.toThrow("30 seconds");
    await expect(exaCall("web_search_exa", {})).rejects.toThrow("rate-limited");
    expect(requests).toBe(1);
    now.mockReturnValue(1030001);
    globalThis.fetch = (async () => new Response(JSON.stringify({ id: 1, result: { isError: true, content: [{ type: "text", text: "free MCP rate limit" }] } }))) as unknown as typeof fetch;
    await expect(exaCall("web_search_exa", {})).rejects.toThrow("rate-limited");
  } finally { now.mockRestore(); }
});
