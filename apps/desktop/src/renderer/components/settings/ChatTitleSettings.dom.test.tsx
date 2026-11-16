import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import { useAppStore } from "../../lib/store.ts";
import { DEFAULT_PREFERENCES } from "../../../shared/rpc-schema.ts";
import ChatTitleSettings from "./ChatTitleSettings.tsx";

globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => { root!.unmount(); }); root = undefined; container?.remove(); });
const models = [
  { provider: "openai", id: "gpt-6-luna", name: "GPT-6 Luna", thinkingLevels: ["low", "high"], tiers: ["default", "priority"] },
  { provider: "anthropic", id: "claude-haiku-5-5", name: "Claude Haiku 5.5", thinkingLevels: ["off", "low"], tiers: ["default", "priority"] },
];
async function render() {
  useAppStore.setState({ ready: false, activeProjectPath: null, activeSessionFile: null, providers: [], preferences: DEFAULT_PREFERENCES });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(<ChatTitleSettings />); });
}
test("automatic resolution is visible, and selecting a model updates its automatic effort and tier", async () => {
  stubInvoke(async () => ({ models }));
  await render();
  expect(container.textContent).toContain("Uses GPT-6 Luna · Low · Priority");
  const conversationModel = useAppStore.getState().model;
  const conversationReasoning = useAppStore.getState().thinkingLevel;
  await act(async () => { container.querySelector<HTMLButtonElement>('[data-model-picker-trigger]')!.click(); });
  await act(() => document.querySelector<HTMLButtonElement>('[aria-label="anthropic"]')!.click());
  const option = [...document.querySelectorAll<HTMLButtonElement>('[data-model-choice]')].find(element => element.textContent?.includes("Claude Haiku 5.5"))!;
  expect(option).toBeDefined();
  await act(async () => { option.click(); });
  expect(useAppStore.getState().preferences.chatTitle).toEqual({ model: "anthropic/claude-haiku-5-5", reasoning: "auto", serviceTier: "auto" });
    expect(container.textContent).toContain("Uses Claude Haiku 5.5 · Low · Standard");
  expect(useAppStore.getState().model).toEqual(conversationModel);
  expect(useAppStore.getState().thinkingLevel).toBe(conversationReasoning);
});
test("no connected models keeps Automatic available and disables model-specific settings", async () => {
  stubInvoke(async () => ({ models: [] }));
  await render();
  expect(container.textContent).toContain("Connect a provider");
  const trigger = container.querySelector<HTMLButtonElement>('[data-model-picker-trigger]')!;
  expect(trigger.disabled).toBe(false);
  await act(() => trigger.click());
  const automatic = [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(button => button.textContent?.includes("Automatic"))!;
  await act(() => automatic.click());
  expect(document.body.textContent).toContain("No reasoning levels available");
  expect(document.querySelector('[aria-label="Service tier"]')).toBeNull();
  expect(useAppStore.getState().preferences.chatTitle.model).toBe("auto");

});
test("a late model catalog cannot replace a newer project catalog", async () => {
  const late = Promise.withResolvers<{ models: typeof models }>();
  stubInvoke(async (_channel, params: any) => params.projectDir ? { models: [models[1]] } : late.promise);
  await render();
  await act(async () => { useAppStore.setState({ activeProjectPath: "/project" }); });
  expect(container.textContent).toContain("Uses Claude Haiku 5.5");
  await act(async () => { late.resolve({ models: [models[0]!] }); await late.promise; });
  expect(container.textContent).toContain("Uses Claude Haiku 5.5");
});

test("manual effort and standard tier survive model changes and Auto labels retain their own defaults", async () => {
  stubInvoke(async () => ({ models }));
  await render();
  await act(async () => { useAppStore.setState({ preferences: { ...DEFAULT_PREFERENCES, chatTitle: { model: "auto", reasoning: "high", serviceTier: "default" } } }); });
  await act(() => container.querySelector<HTMLButtonElement>('[data-model-picker-trigger]')!.click());
  await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="Service tier"]')!.click(); });
  expect(document.body.textContent).toContain("Auto (Priority)");
  const standard = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.getAttribute("data-value") === "default" || element.textContent?.startsWith("Standard"))!;
  await act(async () => { standard.click(); });
  await act(() => document.querySelector<HTMLButtonElement>('[aria-label="anthropic"]')!.click());
  const haiku = [...document.querySelectorAll<HTMLElement>('[data-model-choice]')].find(element => element.textContent?.includes("Claude Haiku 5.5"))!;
  await act(async () => { haiku.click(); });
  expect(useAppStore.getState().preferences.chatTitle).toEqual({ model: "anthropic/claude-haiku-5-5", reasoning: "high", serviceTier: "default" });
  expect(container.textContent).toContain("Saved reasoning High is unavailable; uses Off.");
});

test("automatic effort and tier can be restored independently, and an unavailable explicit model stays selected", async () => {
  stubInvoke(async () => ({ models }));
  await render();
  await act(() => useAppStore.setState({ preferences: { ...DEFAULT_PREFERENCES, chatTitle: { model: "openai/gpt-6-luna", reasoning: "high", serviceTier: "default" } } }));
  await act(() => container.querySelector<HTMLButtonElement>('[data-model-picker-trigger]')!.click());
  await act(() => document.querySelector<HTMLButtonElement>('[aria-label="Reasoning effort"]')!.click());
  await act(() => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === "Auto (Low)")!.click());
  expect(useAppStore.getState().preferences.chatTitle).toEqual({ model: "openai/gpt-6-luna", reasoning: "auto", serviceTier: "default" });
  await act(() => document.querySelector<HTMLButtonElement>('[aria-label="Service tier"]')!.click());
  await act(() => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.startsWith("Auto (Priority)"))!.click());
  expect(useAppStore.getState().preferences.chatTitle).toEqual({ model: "openai/gpt-6-luna", reasoning: "auto", serviceTier: "auto" });
  await act(() => container.querySelector<HTMLButtonElement>('[data-model-picker-trigger]')!.click());
  await act(() => useAppStore.setState({ preferences: { ...DEFAULT_PREFERENCES, chatTitle: { model: "missing/custom", reasoning: "high", serviceTier: "priority" } } }));
  expect(container.textContent).toContain("missing/custom is unavailable");
  expect(useAppStore.getState().preferences.chatTitle.model).toBe("missing/custom");
});
