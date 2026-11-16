import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PiSettings } from "../../../shared/pi-settings.ts";
import { useAppStore } from "../../lib/store.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";
import AgentSettings from "./AgentSettings.tsx";
import { DEFAULT_PREFERENCES } from "../../../shared/rpc-schema.ts";
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let root: Root; let host: HTMLDivElement;
afterEach(async () => { await act(() => root?.unmount()); host?.remove(); });
const base: PiSettings = {
  defaultThinkingLevel: "", steeringMode: "all", followUpMode: "all", autoCompaction: true, autoRetry: true, hideThinkingBlock: false,
  showCacheMissNotices: false, enableSkillCommands: true, transport: "auto", httpIdleTimeoutMs: 0, shellPath: "", shellCommandPrefix: "", npmCommand: "",
  enabledModels: "", defaultProjectTrust: "ask", blockImages: false, autoResizeImages: false, warnAnthropicExtraUsage: true, enableInstallTelemetry: true, enableAnalytics: true,
};
async function mount(failResize = false) {
  useAppStore.setState({ ready: false, preferences: DEFAULT_PREFERENCES, piSettings: { ...base }, piSettingsError: undefined, piRestartPending: false });
  stubInvoke(async (channel, params: any) => {
    if (channel === "setPiSettings") {
      if (failResize && params.patch.autoResizeImages !== undefined) return { ok: false, error: "Could not save image sizing" };
      return { ok: true, settings: { ...useAppStore.getState().piSettings!, ...params.patch } };
    }
    throw new Error(channel);
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(<AgentSettings />));
}
async function choose(label: string) {
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Image input"]')!.click());
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === label)!.click());
}
test("image modes retain the dormant resize preference and apply both fields when enabled", async () => {
  await mount(); await choose("Disabled");
  expect(useAppStore.getState().piSettings).toMatchObject({ blockImages: true, autoResizeImages: false });
  await choose("Optimize large images");
  expect(useAppStore.getState().piSettings).toMatchObject({ blockImages: false, autoResizeImages: true });
  await choose("Original size");
  expect(useAppStore.getState().piSettings).toMatchObject({ blockImages: false, autoResizeImages: false });
});
test("a rejected resize change does not enable images or discard the current settings", async () => {
  await mount(true);
  await act(() => useAppStore.setState({ piSettings: { ...base, blockImages: true } }));
  await choose("Optimize large images");
  expect(useAppStore.getState().piSettings).toMatchObject({ blockImages: true, autoResizeImages: false });
  expect(host.textContent).toContain("Could not save image sizing");
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Image input"]')!.disabled).toBe(false);
});
