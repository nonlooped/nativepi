import { expect, test } from "bun:test";
import { stubInvoke } from "./store/testBridge.ts";

const responses: Record<string, unknown> = {
  setModel: { ok: true },
  getThinkingLevels: { levels: ["low", "medium", "high"] },
};

test("selecting a model loads only its supported reasoning levels", async () => {
  stubInvoke(async (channel) => responses[channel] ?? {});
  const { useAppStore } = await import("./store.ts");
  useAppStore.setState({ activeProjectPath: "C:\\project" });

  await useAppStore.getState().setModel({ provider: "xai", id: "grok-4.5", name: "Grok 4.5", reasoning: true });

  expect(useAppStore.getState().thinkingLevels).toEqual(["low", "medium", "high"]);

  useAppStore.setState({ thinkingLevel: "high" });
  await useAppStore.getState().cycleThinkingLevel();
  expect(useAppStore.getState().thinkingLevel).toBe("low");
});

test("chat history exposes a retryable failure before an empty successful load", async () => {
  let fail = true;
  stubInvoke(async (channel) => {
    if (channel !== "listSessions") return {};
    if (fail) throw new Error("session list unavailable");
    return { sessions: [] };
  });

  const { useAppStore } = await import("./store.ts");
  const projectPath = "C:\\project-without-chats";
  useAppStore.setState({ sessionLoadStates: {}, sessionsByProject: {} });

  await useAppStore.getState().refreshSessions(projectPath);
  expect(useAppStore.getState().sessionLoadStates[projectPath]).toBe("failed");

  fail = false;
  await useAppStore.getState().refreshSessions(projectPath);
  expect(useAppStore.getState().sessionLoadStates[projectPath]).toBe("loaded");
  expect(useAppStore.getState().sessionsByProject[projectPath]).toEqual([]);
});

test("service-tier selection is persisted per session and sent to the Pi host", async () => {
  let sent: { channel: string; params: unknown } | undefined;
  stubInvoke(async (channel, params) => {
    sent = { channel, params };
    return {};
  });

  const { useAppStore } = await import("./store.ts");
  useAppStore.setState({
    activeProjectPath: "C:\\project",
    activeSessionFile: "C:\\project\\chat.jsonl",
    serviceTiers: {},
  });

  await useAppStore.getState().setServiceTier("fast");

  expect(useAppStore.getState().serviceTier).toBe("fast");
  expect(useAppStore.getState().serviceTiers["C:\\project\\chat.jsonl"]).toBe("fast");
  expect(sent).toEqual({
    channel: "tuiSend",
    params: {
      projectDir: "C:\\project",
      sessionFile: "C:\\project\\chat.jsonl",
      frame: {
        type: "nativepi_tui_set_service_tier",
        sessionFile: "C:\\project\\chat.jsonl",
        tier: "fast",
      },
    },
  });
});
