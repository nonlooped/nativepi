import { expect, test } from "bun:test";
import type { AppState, GetState, SetState } from "./types.ts";
import { emptyConversation } from "./conversation.ts";
import { stubInvoke } from "./testBridge.ts";

const { warmProject } = await import("./internals.ts");

test("does not apply a former chat's warm state after selecting another chat", async () => {
  let resolveState = (_value: unknown): void => {};
  const pendingState = new Promise<unknown>((resolve) => { resolveState = resolve; });
  stubInvoke(async (channel, params) => {
    if (channel === "getState" && (params as { sessionFile?: string | null }).sessionFile === "A") return pendingState;
    if (channel === "getModels") return { models: [] };
    if (channel === "getSessionProviders") return { providers: [] };
    if (channel === "getThinkingLevels") return { levels: ["off"] };
    if (channel === "loadGraphicalExtensions") return { extensions: [] };
    return {};
  });

  const state = {
    activeProjectPath: "C:\\project",
    activeSessionFile: "A",
    model: undefined,
    models: [],
    thinkingLevel: "off",
    thinkingLevels: ["off"],
    conversations: { A: { ...emptyConversation(), projectDir: "C:\\project", sessionFile: "A" } },
    refreshGit: async () => {},
  } as unknown as AppState;
  const get = (() => state) as GetState;
  const set = ((update: Partial<AppState> | ((current: AppState) => Partial<AppState>)) => {
    Object.assign(state, typeof update === "function" ? update(state) : update);
  }) as SetState;

  warmProject(set, get, "C:\\project");
  state.activeSessionFile = "B";
  resolveState({ state: { model: { provider: "openai", id: "from-a" }, thinkingLevel: "high", isStreaming: false, isCompacting: false } });
  await Promise.resolve();
  await Promise.resolve();

  expect(state.model).toBeUndefined();
  expect(state.thinkingLevel).toBe("off");
});
