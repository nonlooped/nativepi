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
