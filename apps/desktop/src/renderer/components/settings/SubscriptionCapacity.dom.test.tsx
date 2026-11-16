import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import SubscriptionCapacity from "./SubscriptionCapacity.tsx";

test("refresh shows provider errors while retaining clearly stale quota", async () => {
  let failed = false;
  stubInvoke(async channel => {
    if (channel !== "subscriptionCapacity") throw new Error(channel);
    return { providers: [{ provider: "anthropic", name: "Anthropic", status: failed ? "error" : "ready", stale: failed, fetchedAt: new Date().toISOString(), windows: [{ label: "5 hours", usedPercent: 27 }], ...(failed ? { message: "Quota refresh failed" } : {}) }] };
  });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SubscriptionCapacity />));
    expect(container.textContent).toContain("27% used · 73% remaining");
    failed = true;
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Stale");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Quota refresh failed");
    expect(container.textContent).toContain("73% remaining");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
