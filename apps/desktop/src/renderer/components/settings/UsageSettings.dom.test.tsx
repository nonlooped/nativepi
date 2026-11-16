import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import UsageSettings from "./UsageSettings.tsx";

test("usage controls retain the selected date range without extension requests", async () => {
  useAppStore.setState({ projects: [{ path: "/p", name: "Project" }], activeProjectPath: "/p", activeSessionFile: null });
  let subscriptionReads = 0;
  stubInvoke(async channel => {
    if (channel === "subscriptionCapacity") return { providers: [] };
    if (channel === "getUsageDashboard") return { dashboard: {
      totalCost: 0, sessions: 0, daily: [], projects: [], models: [],
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    } };
    if (channel === "callExtension") { subscriptionReads++; return { result: { usages: [] } }; }
    throw new Error(`Unexpected request ${channel}`);
  });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const choice = (name: string) => [...container.querySelectorAll("button")].find(button => button.textContent === name)!;
  try {
    await act(async () => root.render(<UsageSettings />));
    expect(subscriptionReads).toBe(0);
    expect(container.textContent).not.toContain("Subscription limits");
    await act(async () => choice("90 days").click());
    expect(choice("90 days").getAttribute("aria-pressed")).toBe("true");
    await act(async () => choice("90 days").click());
    expect(choice("90 days").getAttribute("aria-pressed")).toBe("true");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

test("filtered zero-cost usage keeps recorded token totals and does not invent input/cache breakdowns", async () => {
  useAppStore.setState({ projects: [{ path: "/zero-cost", name: "Zero cost" }], activeProjectPath: "/zero-cost" });
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  stubInvoke(async channel => {
    if (channel === "subscriptionCapacity") return { providers: [] };
    if (channel === "getUsageDashboard") return { dashboard: {
      totalCost: 0, sessions: 2, projects: [], models: [],
      tokens: { total: 900, input: 500, output: 100, cacheRead: 300, cacheWrite: 0 },
      daily: [{ date: "2020-01-01", cost: 0, tokens: 387, sessions: 1, models: [] }, { date: today, cost: 0, tokens: 513, sessions: 1, models: [] }],
    } };
    throw new Error(channel);
  });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const metric = (label: string) => [...container.querySelectorAll("dt")].find(item => item.textContent === label)?.nextElementSibling?.textContent;
  try {
    await act(async () => root.render(<UsageSettings />));
    expect(metric("Processed tokens")).toBe("513");
    expect(metric("Sessions")).toBe("1");
    expect(container.textContent).not.toContain("Uncached input");
    await act(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "All")!.click());
    expect(metric("Processed tokens")).toBe("900");
    expect(metric("Uncached input")).toBe("500");
    expect(metric("Cached input")).toBe("300");
  } finally { await act(() => root.unmount()); container.remove(); }
});
