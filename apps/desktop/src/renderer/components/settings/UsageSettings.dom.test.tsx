import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import UsageSettings from "./UsageSettings.tsx";

test("usage controls retain the date range across views and load subscription limits on selection", async () => {
  useAppStore.setState({ projects: [{ path: "/p", name: "Project" }], activeProjectPath: "/p", activeSessionFile: null });
  let subscriptionReads = 0;
  stubInvoke(async channel => {
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
    await act(async () => choice("90 days").click());
    await act(async () => choice("Subscription limits").click());
    expect(subscriptionReads).toBe(1);
    expect(container.textContent).toContain("No subscription limits to show");
    await act(async () => choice("Local usage").click());
    expect(choice("90 days").getAttribute("aria-pressed")).toBe("true");
    await act(async () => choice("90 days").click());
    expect(choice("90 days").getAttribute("aria-pressed")).toBe("true");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
