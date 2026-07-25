import { expect, test } from "bun:test";

const responses: Record<string, unknown> = {
  setModel: { ok: true },
  getThinkingLevels: { levels: ["low", "medium", "high"] },
};

// Mirrors the real bridge: a single `invoke` that the renderer's Proxy fans out
// into per-channel calls.
Object.assign(globalThis, {
  window: {
    nativepi: {
      invoke: async (channel: string) => responses[channel] ?? {},
      events: { on: () => () => {} },
    },
  },
});

test("selecting a model loads only its supported reasoning levels", async () => {
  const { useAppStore } = await import("./store.ts");
  useAppStore.setState({ activeProjectPath: "C:\\project" });

  await useAppStore.getState().setModel({ provider: "xai", id: "grok-4.5", name: "Grok 4.5", reasoning: true });

  expect(useAppStore.getState().thinkingLevels).toEqual(["low", "medium", "high"]);

  useAppStore.setState({ thinkingLevel: "high" });
  await useAppStore.getState().cycleThinkingLevel();
  expect(useAppStore.getState().thinkingLevel).toBe("low");
});
