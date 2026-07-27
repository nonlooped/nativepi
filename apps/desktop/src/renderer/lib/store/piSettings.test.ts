import { expect, test } from "bun:test";
import type { PiSettings } from "../../../shared/pi-settings.ts";

import { stubInvoke } from "./testBridge.ts";

const { useAppStore } = await import("../store.ts");

const base: PiSettings = {
  defaultThinkingLevel: "",
  steeringMode: "all",
  followUpMode: "all",
  autoCompaction: true,
  autoRetry: true,
  hideThinkingBlock: false,
  showCacheMissNotices: false,
  enableSkillCommands: true,
  transport: "auto",
  httpIdleTimeoutMs: 0,
  shellPath: "",
  shellCommandPrefix: "",
  npmCommand: "",
  enabledModels: "",
  defaultProjectTrust: "ask",
  blockImages: false,
  autoResizeImages: true,
  warnAnthropicExtraUsage: true,
  enableInstallTelemetry: true,
  enableAnalytics: true,
};

test("a settings reply that arrives after a newer one does not undo it", async () => {
  const replies: Array<(response: unknown) => void> = [];
  stubInvoke(async (channel) => {
    if (channel !== "setPiSettings") return {};
    return new Promise((resolve) => replies.push(resolve));
  });
  useAppStore.setState({ piSettings: base });

  const first = useAppStore.getState().updatePiSetting("blockImages", true);
  const second = useAppStore.getState().updatePiSetting("autoResizeImages", false);

  // The second write lands first, then the first one's reply arrives carrying
  // the older snapshot — the file it read predates the second write.
  replies[1]!({ ok: true, settings: { ...base, blockImages: true, autoResizeImages: false } });
  await second;
  replies[0]!({ ok: true, settings: { ...base, blockImages: true } });
  await first;

  expect(useAppStore.getState().piSettings?.autoResizeImages).toBe(false);
  expect(useAppStore.getState().piSettings?.blockImages).toBe(true);
});

test("a failed write reverts only its own control", async () => {
  const replies: Array<(response: unknown) => void> = [];
  stubInvoke(async (channel) => {
    if (channel !== "setPiSettings") return {};
    return new Promise((resolve) => replies.push(resolve));
  });
  useAppStore.setState({ piSettings: base, piSettingsError: undefined });

  const failing = useAppStore.getState().updatePiSetting("blockImages", true);
  useAppStore.setState((s) => ({ piSettings: { ...s.piSettings!, hideThinkingBlock: true } }));
  replies[0]!({ ok: false, error: "disk full" });
  await failing;

  const settings = useAppStore.getState().piSettings;
  expect(settings?.blockImages).toBe(false);
  expect(settings?.hideThinkingBlock).toBe(true);
  expect(useAppStore.getState().piSettingsError).toBe("disk full");
});
