import { expect, test } from "bun:test";
import type { UsageDashboard } from "../../../shared/pi-types.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import { createUsageDashboardReader } from "./usageReads.ts";

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
