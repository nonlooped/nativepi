import { expect, test } from "bun:test";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createCapacityReader, parseCapacity } from "./subscriptionCapacity.ts";

test("Codex windows retain zero usage, plan, additional limits and reset seconds", () => {
  const result = parseCapacity("openai-codex", { plan_type: "plus", rate_limit: { primary_window: { used_percent: 0, limit_window_seconds: 18000, reset_at: 1800000000 } }, additional_rate_limits: [{ limit_name: "Review", rate_limit: { secondary_window: { used_percent: 72 } } }] });
  expect(result.plan).toBe("plus");
  expect(result.windows).toEqual([{ label: "Usage · 5 hours", usedPercent: 0, resetAt: "2027-01-15T08:00:00.000Z" }, { label: "Review · long window", usedPercent: 72 }]);
  expect(() => parseCapacity("openai-codex", { rate_limit: { primary_window: { used_percent: 101 } } })).toThrow();
});
test("Codex keeps primary usage when additional limits are null", () => {
  const result = parseCapacity("openai-codex", {
    rate_limit: { primary_window: { used_percent: 24, limit_window_seconds: 18000 }, secondary_window: null },
    additional_rate_limits: null,
  });
  expect(result.windows).toEqual([{ label: "Usage · 5 hours", usedPercent: 24 }]);
});
test("Claude ignores absent windows and rejects malformed supplied windows", () => {
  expect(parseCapacity("anthropic", { five_hour: { utilization: 35.5, resets_at: "2026-11-16T12:00:00Z" }, seven_day: null }).windows).toEqual([{ label: "5 hours", usedPercent: 35.5, resetAt: "2026-11-16T12:00:00.000Z" }]);
  expect(() => parseCapacity("anthropic", { five_hour: { utilization: "unknown" } })).toThrow();
});
test("reader coalesces requests, throttles refresh and never exposes credentials or response errors", async () => {
  let oauth = true;
  const runtime = { getAvailable: async () => [], getProviders: () => [{ id: "anthropic", name: "Anthropic" }], hasConfiguredAuth: () => true, isUsingOAuth: () => oauth, getAuth: async () => ({ auth: { apiKey: "secret-token" } }) } as unknown as ModelRuntime;
  let calls = 0;
  const request = (async (_url: string, options: RequestInit) => { calls++; expect(options.redirect).toBe("error"); expect(new Headers(options.headers).get("authorization")).toBe("Bearer secret-token"); throw new Error("secret-token"); });
  const reader = createCapacityReader(async () => runtime, request);
  const [first, second] = await Promise.all([reader(), reader()]);
  expect(first).toEqual(second);
  expect(first[0]?.status).toBe("error");
  expect(JSON.stringify(first)).not.toContain("secret-token");
  await reader(); expect(calls).toBe(1);
  oauth = false;
  expect((await reader())[0]?.status).toBe("unsupported");
  expect(calls).toBe(1);
});

test("switching Pi credentials invalidates the previous account quota cache", async () => {
  let token = "account-one";
  const runtime = { getAvailable: async () => [], getProviders: () => [{ id: "anthropic", name: "Anthropic" }], hasConfiguredAuth: () => true, isUsingOAuth: () => true, getAuth: async () => ({ auth: { apiKey: token } }) } as unknown as ModelRuntime;
  const request = (async (_url: string, options: RequestInit) => new Response(JSON.stringify({ five_hour: { utilization: new Headers(options.headers).get("authorization")?.includes("one") ? 12 : 81 } })));
  const reader = createCapacityReader(async () => runtime, request);
  expect((await reader())[0]?.windows[0]?.usedPercent).toBe(12);
  token = "account-two";
  expect((await reader())[0]?.windows[0]?.usedPercent).toBe(81);
});

test("failed refresh retains prior windows as stale and honors provider retry timing", async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const runtime = { getAvailable: async () => [], getProviders: () => [{ id: "anthropic", name: "Anthropic" }], hasConfiguredAuth: () => true, isUsingOAuth: () => true, getAuth: async () => ({ auth: { apiKey: "token" } }) } as unknown as ModelRuntime;
    let calls = 0;
    const reader = createCapacityReader(async () => runtime, async () => {
      calls++;
      return calls === 1 ? new Response(JSON.stringify({ seven_day: { utilization: 44 } })) : new Response("private error body", { status: 429, headers: { "retry-after": "600" } });
    });
    expect((await reader())[0]?.windows[0]?.usedPercent).toBe(44);
    now += 61_000;
    const failed = (await reader())[0]!;
    expect(failed.stale).toBe(true);
    expect(failed.windows[0]?.usedPercent).toBe(44);
    expect(failed.message).toContain("HTTP 429");
    expect(JSON.stringify(failed)).not.toContain("private error body");
    now += 61_000;
    await reader(); expect(calls).toBe(2);
  } finally { Date.now = originalNow; }
});
