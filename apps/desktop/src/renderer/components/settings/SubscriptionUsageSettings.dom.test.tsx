import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import { useAppStore } from "../../lib/store.ts";
import { subscriptionUsageProtocol } from "../../../../../../packages/subscription-usage/types.ts";
const domTest = test.skipIf(typeof document === "undefined");

domTest("valid nonpositive windows retain usage but omit pacing rather than reject the provider", async () => {
  const { default: SubscriptionUsageSettings } = await import("./SubscriptionUsageSettings.tsx");
  useAppStore.setState({ activeProjectPath: "/p", activeSessionFile: "a" });
  const result = subscriptionUsageProtocol.methods.usages.result.parse({ usages: [
    { provider: "positive", limits: [{ label: "Positive window", usedPercent: 90, windowSeconds: 3600, resetAt: new Date(Date.now() + 1800000).toISOString() }] },
    { provider: "negative", limits: [{ label: "Negative window", usedPercent: 90, windowSeconds: -3600, resetAt: new Date(Date.now() - 1800000).toISOString() }] },
    { provider: "zero", limits: [{ label: "Zero window", usedPercent: 90, windowSeconds: 0 }] },
  ] });
  stubInvoke(async channel => {
    if (channel !== "callExtension") throw new Error(`Unexpected request ${channel}`);
    return { result };
  });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SubscriptionUsageSettings />));
    const cards = [...container.querySelectorAll("section")];
    expect(cards).toHaveLength(3);
    expect(cards[0]!.textContent).toContain("At risk");
    for (const card of cards.slice(1)) {
      expect(card.textContent).toContain("10% left");
      expect(card.textContent).not.toContain("At risk");
      expect(card.textContent).not.toContain("window elapsed");
    }
    expect(container.textContent).not.toContain("Unable to load");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
