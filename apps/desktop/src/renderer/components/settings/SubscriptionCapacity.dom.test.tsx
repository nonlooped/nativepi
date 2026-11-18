import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import SubscriptionCapacity from "./SubscriptionCapacity.tsx";

test("refresh removes a failed provider even when cached limits exist", async () => {
  let failed = false;
  stubInvoke(async channel => {
    if (channel !== "subscriptionCapacity") throw new Error(channel);
    return { providers: [{ provider: "anthropic", name: "Anthropic", status: failed ? "error" : "ready", stale: failed, fetchedAt: new Date().toISOString(), windows: [{ label: "5 hours", usedPercent: 27 }], ...(failed ? { message: "Quota refresh failed" } : {}) }] };
  });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SubscriptionCapacity />));
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuetext")).toBe("27% used · 73% remaining");
    failed = true;
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Refresh capacity"]')!.click());
    expect(container.textContent).not.toContain("Anthropic");
    expect(container.textContent).not.toContain("Quota refresh failed");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent).toContain("No usage limits to show");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
