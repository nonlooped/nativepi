import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PiSettings } from "../../../shared/pi-settings.ts";
import { stubInvoke } from "../../lib/store/testBridge.ts";

const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const settings: PiSettings = {
  defaultThinkingLevel: "", steeringMode: "all", followUpMode: "all",
  autoCompaction: true, autoRetry: true, hideThinkingBlock: false,
  showCacheMissNotices: false, enableSkillCommands: true, transport: "auto",
  httpIdleTimeoutMs: 0, shellPath: "", shellCommandPrefix: "", npmCommand: "",
  enabledModels: "", defaultProjectTrust: "ask", blockImages: false,
  autoResizeImages: true, warnAnthropicExtraUsage: true,
  enableInstallTelemetry: true, enableAnalytics: true,
};

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = undefined;
});

domTest("PiPanel displays rejected reads and restart failures from its real settings actions", async () => {
  const { useAppStore } = await import("../../lib/store.ts");
  const { default: PiPanel } = await import("./PiPanel.tsx");
  const original = useAppStore.getState();
  useAppStore.setState({ piSettings: null, piSettingsError: undefined, piRestartPending: false, activeProjectPath: "/project", conversations: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  try {
    await act(async () => { root!.render(<PiPanel>{() => <p>Editable settings</p>}</PiPanel>); });
    expect(container.textContent).toContain("Loading Pi's settings");
    stubInvoke(async () => { throw new Error("read connection lost"); });
    await act(async () => { await useAppStore.getState().loadPiSettings(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("read connection lost");
    await act(async () => { useAppStore.setState({ piSettings: settings, piSettingsError: undefined, piRestartPending: true }); });
    expect(container.textContent).toContain("Saved.");
    expect(container.textContent).toContain("Editable settings");
    const calls: string[] = [];
    stubInvoke(async (channel) => { calls.push(channel); return { ok: false }; });
    const restart = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Restart Pi now"));
    expect(restart).toBeDefined();
    await act(async () => { restart!.click(); });
    expect(calls).toEqual(["restartAllPi"]);
    expect(useAppStore.getState().piRestartPending).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Pi could not restart");
    expect(container.textContent).toContain("Editable settings");
    expect(container.textContent).toContain("Saved.");
    expect([...container.querySelectorAll("button")].some(button => button.textContent?.includes("Restart Pi now"))).toBe(true);
  } finally {
    await act(async () => { root!.unmount(); });
    root = undefined;
    useAppStore.setState(original);
  }
});
