import { subscriptionUsageProtocol, type SubscriptionUsages } from "../../../../../../packages/subscription-usage/types.ts";
import { expect, test } from "bun:test";
import type { UsageDashboard } from "../../../shared/pi-types.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import { createSubscriptionUsageReader, createUsageDashboardReader } from "./usageReads.ts";

const projects = [{ path: "/one", name: "One" }];
const dashboard: UsageDashboard = {
  totalCost: 0, sessions: 0, daily: [], projects: [], models: [],
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

test("typed usage failures are retried on the next visit, not cached as successes", async () => {
  const reader = createUsageDashboardReader();
  let calls = 0;
  stubInvoke(async (channel) => {
    expect(channel).toBe("getUsageDashboard");
    return ++calls === 1 ? { error: "unreadable sessions" } : { dashboard };
  });
  await expect(reader.load(projects)).rejects.toThrow("unreadable sessions");
  expect(await reader.load(projects)).toEqual(dashboard);
  expect(await reader.load(projects)).toEqual(dashboard);
  expect(calls).toBe(2);
});

test("dashboard scope includes project paths and names; manual refresh shares its new read", async () => {
  const reader = createUsageDashboardReader();
  const calls: unknown[] = [];
  stubInvoke(async (_, params) => { calls.push(params); return { dashboard }; });
  await reader.load(projects);
  await reader.load([{ path: "/two", name: "One" }]);
  await reader.load([{ path: "/one", name: "Renamed" }]);
  expect(calls).toHaveLength(3);
  expect(calls[0]).toEqual({ projects });
  reader.invalidate(projects);
  const first = reader.load(projects);
  expect(reader.load(projects)).toBe(first);
  await first;
  expect(calls).toHaveLength(4);
});

test("subscription snapshots deduplicate only within the panel visit and actual project/session", async () => {
  const reader = createSubscriptionUsageReader();
  const calls: unknown[] = [];
  stubInvoke(async (channel, params) => {
    expect(channel).toBe("callExtension");
    calls.push(params);
    return { result: { usages: [{ provider: "anthropic", limits: [{ label: "Week", usedPercent: 12 }] }] } };
  });
  const first = reader.load("/one", "session-a");
  expect(reader.load("/one", "session-a")).toBe(first);
  const snapshot = await first;
  expect(snapshot.observedAt).toBeGreaterThan(0);
  await reader.load("/one", "session-a");
  expect(calls).toHaveLength(1);
  await reader.load("/one", "session-b");
  await reader.load("/two", "session-a");
  reader.invalidate("/one", "session-a");
  await reader.load("/one", "session-a");
  // A return from auth/package settings creates a fresh mounted reader.
  await createSubscriptionUsageReader().load("/one", "session-a");
  expect(calls).toHaveLength(5);
  expect(calls[0]).toEqual({ projectDir: "/one", sessionFile: "session-a", extension: "@nativepi/subscription-usage", method: "usages" });
});

test("subscription errors and invalid extension results are retryable; valid limits sort once at the boundary", async () => {
  const reader = createSubscriptionUsageReader();
  const replies = [
    { error: "not logged in" },
    { result: { usages: [{ provider: "anthropic", limits: [{ usedPercent: "NaN" }] }] } },
    { result: { usages: [
      { provider: "anthropic", limits: [{ label: "Day", usedPercent: 20 }, { label: "Week", usedPercent: 80 }] },
      { provider: "openai-codex", limits: [{ label: "Week", usedPercent: 99 }] },
    ] } },
  ];
  stubInvoke(async () => replies.shift());
  await expect(reader.load("/one", null)).rejects.toThrow("not logged in");
  await expect(reader.load("/one", null)).rejects.toThrow("invalid usage data");
  const { usages } = await reader.load("/one", null);
  expect(usages.map((usage) => usage.provider)).toEqual(["openai-codex", "anthropic"]);
  expect(usages[1]!.limits.map((limit) => limit.usedPercent)).toEqual([80, 20]);
});

test("no project means no extension network work", async () => {
  stubInvoke(async () => { throw new Error("must not call"); });
  expect((await createSubscriptionUsageReader().load(null, null)).usages).toEqual([]);
});


test("subscription reader consumes the package's declared usages result without rejecting finite windows", async () => {
  const declared: SubscriptionUsages = {
    usages: [{ provider: "future-provider", limits: [
      { label: "Without window", usedPercent: 9 },
      { label: "Zero window", usedPercent: 21, windowSeconds: 0 },
      { label: "Negative window", usedPercent: 45, windowSeconds: -60, resetAt: "2026-11-12T00:00:00Z" },
      { label: "Positive window", usedPercent: 12, windowSeconds: 3600 },
    ] }],
  };
  const result = subscriptionUsageProtocol.methods.usages.result.parse(declared);
  stubInvoke(async () => ({ result }));
  const snapshot = await createSubscriptionUsageReader().load("/one", "session-a");
  expect(snapshot.usages[0]!.limits).toEqual([...declared.usages[0]!.limits].sort((a, b) => b.usedPercent - a.usedPercent));
  expect(result).toEqual(declared);
});

for (const [name, result] of [
  ["missing usages", {}],
  ["null usages", { usages: null }],
  ["nonfinite percent", { usages: [{ provider: "p", limits: [{ label: "Bad", usedPercent: Infinity }] }] }],
  ["nonfinite window", { usages: [{ provider: "p", limits: [{ label: "Bad", usedPercent: 5, windowSeconds: NaN }] }] }],
] as const) {
  test(`malformed subscription payload (${name}) is not cached as an empty success`, async () => {
    const reader = createSubscriptionUsageReader(); let calls = 0;
    stubInvoke(async () => ({ result: ++calls === 1 ? result : subscriptionUsageProtocol.methods.usages.result.parse({ usages: [] }) }));
    await expect(reader.load("/one", null)).rejects.toThrow("invalid usage data");
    expect((await reader.load("/one", null)).usages).toEqual([]); expect(calls).toBe(2);
  });
}
