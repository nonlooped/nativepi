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
  expect(container.textContent).toContain("Uses GPT-6 Luna · openai");
  expect(container.textContent).toContain("Auto (Low)");
  expect(container.textContent).toContain("Auto (Priority)");
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Title model"]')!.click(); });
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent?.includes("Claude Haiku 5.5"))!;
  expect(option).toBeDefined();
  await act(async () => { option.click(); });
  expect(useAppStore.getState().preferences.chatTitle).toEqual({ model: "anthropic/claude-haiku-5-5", reasoning: "auto", serviceTier: "auto" });
  expect(container.textContent).toContain("Auto (Standard)");
});
test("no connected models keeps Automatic available and disables model-specific settings", async () => {
  stubInvoke(async () => ({ models: [] }));
  await render();
  expect(container.textContent).toContain("Connect a provider");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Title model"]')!.disabled).toBe(false);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Title reasoning"]')!.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Title service tier"]')!.disabled).toBe(true);
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
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Title service tier"]')!.click(); });
  expect(document.body.textContent).toContain("Auto (Priority)");
  const standard = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent === "Standard")!;
  await act(async () => { standard.click(); });
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Title model"]')!.click(); });
  const haiku = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent?.includes("Claude Haiku 5.5"))!;
  await act(async () => { haiku.click(); });
  expect(useAppStore.getState().preferences.chatTitle).toEqual({ model: "anthropic/claude-haiku-5-5", reasoning: "high", serviceTier: "default" });
  expect(container.textContent).toContain("This effort is unavailable; uses Off.");
});
