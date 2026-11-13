import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ServiceTierState } from "../../shared/service-tier.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";
const domTest = test.skipIf(typeof document === "undefined");
if (typeof document !== "undefined") {
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
}
domTest("shows saved tiers beside reasoning with matching icon controls and no field titles", async () => {
  const { emptyConversation } = await import("../lib/store/conversation.ts");
  const { useAppStore } = await import("../lib/store.ts");
  const { default: ModelSelector } = await import("./ModelSelector.tsx");
  const original = useAppStore.getState();
  const tiers = ["default", "priority"];
  const writes: unknown[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "getServiceTier") return { state: { tier: "default", tiers } };
    if (channel === "setServiceTier") { writes.push(params); return { ok: true, state: { tier: "priority", tiers } }; }
    throw new Error(`Unexpected request: ${channel}`);
  });
  const model = { provider: "openai", id: "model", name: "Test model" };
  useAppStore.setState({ activeProjectPath: "/p", activeSessionFile: "a", model, models: [model], providersLoaded: true,
    thinkingLevels: ["off", "high"], thinkingLevel: "high", thinkingLevelsError: undefined, thinkingLevelsLoading: false, conversations: {} });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<ModelSelector />); });
    const trigger = () => document.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="Service tier"]')!;
    expect(trigger()).toBeNull();
    await act(async () => { container.querySelector<HTMLButtonElement>("button")!.click(); });
    expect(trigger().textContent).toContain("Standard");
    await act(async () => { useAppStore.setState({ serviceTier: { tier: "auto", tiers: ["auto", "default", "priority", "flex"] } as unknown as ServiceTierState }); });
    expect(trigger().textContent).toContain("Standard");
    expect(trigger().textContent).not.toContain("auto");
    const reasoning = document.querySelector('[aria-label="Reasoning effort"]')!;
    expect(reasoning).not.toBeNull();
    expect(reasoning.closest("section")?.parentElement).toBe(trigger().closest("section")?.parentElement);
    expect(reasoning.closest("section")?.querySelector("p")).toBeNull();
    expect(reasoning.querySelector("svg")).not.toBeNull();
    expect(trigger().closest("section")?.querySelector("p")).toBeNull();
    expect(trigger().querySelector("svg")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Reasoning effort");
    expect(document.querySelector('[data-slot="kbd"]')).toBeNull();
    await act(async () => { trigger().click(); });
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options).toHaveLength(2);
    expect(options.every(option => Boolean(option.textContent?.trim()))).toBe(true);
    expect(options.map(option => option.textContent)).not.toContain("Automatic");
    expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain("Standard");
    expect(options.find(option => option.textContent?.includes("Priority"))?.textContent).toContain("higher cost");
    await act(async () => { options.find(option => option.textContent?.startsWith("Priority"))!.click(); });
    expect(writes).toHaveLength(1);
    expect(trigger().textContent).toContain("Priority");
    expect(document.querySelector('[aria-label="Reasoning effort"]')).not.toBeNull();
    await act(async () => { useAppStore.setState({ conversations: { a: { ...emptyConversation(), projectDir: "/p", sessionFile: "a", running: true } } }); });
    expect(trigger().disabled).toBe(true);
    await act(async () => { useAppStore.setState({ conversations: {} }); });
    expect(trigger().disabled).toBe(false);
    stubInvoke(async () => ({ state: { tier: "default", tiers: [] } }));
    await act(async () => { useAppStore.setState({ model: { provider: "meta", id: "muse" } }); });
    expect(trigger()).toBeNull();
  } finally {
    await act(async () => { root.unmount(); }); container.remove(); useAppStore.setState(original);
  }
});
