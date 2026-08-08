import { expect, test } from "bun:test";
import type { JsonValue } from "@nativepi/extension-api";
import subscriptionUsageExtension, {
  anthropicLimits,
  getSubscriptionUsage,
  githubCopilotLimits,
  kimiLimits,
  openAiLimits,
} from "../extensions/usage.ts";

test("unsupported providers do not invoke the auth resolver", async () => {
  let called = false;
  const usage = await getSubscriptionUsage("custom-provider", {
    getProviderAuth: async () => {
      called = true;
      return undefined;
    },
  });

  expect(usage).toBeUndefined();
  expect(called).toBe(false);
});

test("API-key accounts are unsupported without resolving OAuth auth", async () => {
  let resolved = false;
  const usage = await getSubscriptionUsage(
    "openai-codex",
    {
      getProviderAuth: async () => {
        resolved = true;
        return undefined;
      },
    },
    () => ({ type: "api_key" }),
  );

  expect(usage).toBeUndefined();
  expect(resolved).toBe(false);
});

test("usage requested before session start recovers when the session begins", async () => {
  const previousHost = globalThis.__NATIVEPI_EXTENSION_HOST__;
  type ExtensionMethod = (params: JsonValue | undefined) => JsonValue | Promise<JsonValue>;
  const methods = new Map<string, ExtensionMethod>();
  const events: string[] = [];
  const handlers = new Map<string, (event: unknown, context: unknown) => void>();
  globalThis.__NATIVEPI_EXTENSION_HOST__ = {
    register: (_extension, registered) => {
      for (const [name, handler] of Object.entries(registered)) methods.set(name, handler);
    },
    emit: (_extension, event) => events.push(event),
  };

  try {
    subscriptionUsageExtension({
      on: (event: string, handler: (event: unknown, context: unknown) => void) => handlers.set(event, handler),
      registerCommand: () => {},
    } as never);

    const usage = methods.get("usage");
    if (!usage) throw new Error("Usage method was not registered.");
    await expect(usage(undefined)).resolves.toEqual({ supported: false });

    const sessionStart = handlers.get("session_start");
    if (!sessionStart) throw new Error("Session-start handler was not registered.");
    sessionStart({}, { model: { provider: "custom-provider" } });

    expect(events).toContain("changed");
  } finally {
    globalThis.__NATIVEPI_EXTENSION_HOST__ = previousHost;
  }
});

test("OpenAI usage parses short and long rate windows", () => {
  expect(
    openAiLimits({
      rate_limit: {
        primary_window: { used_percent: 25, limit_window_seconds: 18_000, reset_at: 1_800_000_000 },
        secondary_window: { used_percent: 40, limit_window_seconds: 604_800, reset_at: "tomorrow" },
      },
    }),
  ).toEqual([
    { label: "5-hour limit", usedPercent: 25, resetAt: "2027-01-15T08:00:00.000Z", windowSeconds: 18_000 },
    { label: "Weekly limit", usedPercent: 40, resetAt: "tomorrow", windowSeconds: 604_800 },
  ]);
});

test("OpenAI names a model-scoped weekly limit distinctly", () => {
  expect(openAiLimits({
    rate_limit: {
      secondary_window: { used_percent: 10, limit_window_seconds: 604_800 },
    },
    additional_rate_limits: [{
      limit_name: "gpt-5.3-codex-spark",
      rate_limit: { secondary_window: { used_percent: 20, limit_window_seconds: 604_800 } },
    }],
  })).toEqual([
    { label: "Weekly limit", usedPercent: 10, windowSeconds: 604_800 },
    { label: "GPT-5.3 Codex Spark weekly limit", usedPercent: 20, windowSeconds: 604_800 },
  ]);
});

test("Anthropic usage accepts both legacy fields and current limit entries", () => {
  expect(
    anthropicLimits({
      five_hour: { utilization: 12.5, resets_at: "soon" },
      limits: [{ kind: "weekly_scoped", detail: { percent: 33, reset_at: "later" } }],
    }),
  ).toEqual([
    { label: "5-hour limit", usedPercent: 12.5, resetAt: "soon", windowSeconds: 18_000 },
    { label: "Model weekly limit", usedPercent: 33, resetAt: "later", windowSeconds: 604_800 },
  ]);
});

test("Kimi usage converts totals and duration windows to percentages", () => {
  expect(
    kimiLimits({
      usage: { used: 2, limit: 8, name: "Weekly requests", resetTime: 1_800_000_000 },
      limits: [{ name: "Short", detail: { used: 1, limit: 4, resetTime: "soon" }, window: { duration: 120, timeUnit: "TIME_UNIT_MINUTE" } }],
    }),
  ).toEqual([
    { label: "Weekly requests", usedPercent: 25, resetAt: "2027-01-15T08:00:00.000Z" },
    { label: "2-hour limit", usedPercent: 25, resetAt: "soon", windowSeconds: 7200 },
  ]);
});

test("GitHub Copilot supports percentage and entitlement quota shapes", () => {
  expect(githubCopilotLimits({ quota_snapshots: { premium_interactions: { percent_remaining: 80 } } })).toEqual([
    { label: "Monthly premium requests", usedPercent: 20 },
  ]);
  expect(githubCopilotLimits({ quota_snapshots: { ai_credits: { remaining: 3, entitlement: 12 } } })).toEqual([
    { label: "Monthly premium requests", usedPercent: 75 },
  ]);
});
