import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";
import Sidebar from "./Sidebar.tsx";
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let root: Root; let host: HTMLDivElement;
afterEach(async () => { await act(() => root?.unmount()); host?.remove(); });
test("sidebar footer opens settings, usage, automations, and sharing without a category detour", async () => {
  useAppStore.setState({ ready: false, destination: "chat", chatRoot: null, projects: [], conversations: {}, appPanel: null, settingsOpen: false });
  stubInvoke(async channel => channel === "subscriptionCapacity" ? { providers: [] } : {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<Sidebar presentation={{}} overlay onClose={() => {}} onOpenSearch={() => {}} onOpenNewChat={() => {}} />));
  await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Usage"]')!.click());
  expect(document.body.textContent).toContain("No subscription usage to show.");
  expect(useAppStore.getState().appPanel).toBeNull();
  await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Usage"]')!.click());
  for (const [label, panel] of [ ["Automations", "automations"], ["Open on another device", "access"]] as const) {
    await act(() => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
    expect(useAppStore.getState().appPanel).toBe(panel);
    expect(useAppStore.getState().settingsOpen).toBe(false);
  }
  await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!.click());
  expect(useAppStore.getState().settingsOpen).toBe(true);
  expect(useAppStore.getState().appPanel).toBeNull();
});
