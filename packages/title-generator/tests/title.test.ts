import { expect, test } from "bun:test";
import titleGeneratorExtension, { normalizeGeneratedTitle, titlePrompt } from "../extensions/title.ts";

type Handler = (...args: unknown[]) => void;
type FakePi = {
  on: (event: string, handler: Handler) => void;
  registerCommand: (name: string, command: { handler: (args: string, context: unknown) => Promise<void> }) => void;
  appendEntry: () => undefined;
  setSessionName: (name: string) => void;
  getSessionName: () => string | undefined;
};

type FakeModel = { provider: string; id: string; name: string; reasoning?: boolean };

type HarnessState = {
  streamModel?: FakeModel;
  streamOptions?: Record<string, unknown>;
  streamCalls: number;
};

type HarnessOptions = {
  reasoning?: boolean;
  requiredRetries?: number;
  requiredTitleTokens?: number;
};

function createHarness(sessionFile: string, entries: unknown[] = [], harnessOptions: HarnessOptions = {}) {
  const handlers = new Map<string, Handler>();
  const names: string[] = [];
  const state: HarnessState = { streamCalls: 0 };
  const { promise: named, resolve: resolveNamed } = Promise.withResolvers<string>();
  const model: FakeModel = {
    provider: "openai",
    id: "gpt-5-mini",
    name: "GPT-5 mini",
    ...(harnessOptions.reasoning ? { reasoning: true } : {}),
  };
  const provider = {
    streamSimple(selectedModel: FakeModel, _context: unknown, streamOptions: Record<string, unknown>) {
      state.streamModel = selectedModel;
      state.streamOptions = streamOptions;
      state.streamCalls += 1;
      const result =
        selectedModel.reasoning && Number(streamOptions.maxTokens) < (harnessOptions.requiredTitleTokens ?? 256)
          ? { stopReason: "length", content: [{ type: "thinking", thinking: "I need to choose a title." }] }
          : { content: [{ type: "text", text: 'Title: "Review title flow"' }] };
      return {
        result: async () => {
          if (Number(streamOptions.maxRetries) < (harnessOptions.requiredRetries ?? 0)) throw new Error("Transient provider failure");
          return result;
        },
      };
    },
  };
  const context = {
    sessionManager: {
      getSessionFile: () => sessionFile,
      getEntries: () => entries,
      getSessionName: () => names.at(-1),
    },
    model: { provider: "openai", id: "gpt-5" },
    ui: {
      notify: () => {},
      select: async () => undefined,
    },
    modelRegistry: {
      find: (providerId: string, modelId: string) => (providerId === model.provider && modelId === model.id ? model : undefined),
      getProvider: () => provider,
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-key", headers: {}, env: {} }),
      getAvailable: () => [model],
      getProviderDisplayName: () => "OpenAI",
    },
  };
  let setTitleModel: ((args: string, context: unknown) => Promise<void>) | undefined;
  const pi: FakePi = {
    on: (event, handler) => handlers.set(event, handler),
    registerCommand: (name, command) => {
      if (name === "title-model") setTitleModel = command.handler;
    },
    appendEntry: () => undefined,
    setSessionName: (name) => {
      names.push(name);
      resolveNamed(name);
    },
    getSessionName: () => names.at(-1),
  };

  // The fake only implements the extension methods exercised by these tests.
  titleGeneratorExtension(pi as never);
  handlers.get("session_start")?.({}, context);

  return { context, handlers, names, named, state, setTitleModel };
}

test("the first settled turn uses the selected catalog model without reasoning", async () => {
  const harness = createHarness("C:\\title-selection.jsonl");
  await harness.setTitleModel?.("openai/gpt-5-mini", harness.context);
  harness.handlers.get("before_agent_start")?.({ prompt: "review the title flow" }, harness.context);
  harness.handlers.get("agent_settled")?.({}, harness.context);
  await harness.named;

  expect(harness.names).toEqual(["Review title flow"]);
  expect(harness.state.streamCalls).toBe(1);
  expect(harness.state.streamModel).toEqual({ provider: "openai", id: "gpt-5-mini", name: "GPT-5 mini" });
  expect(harness.state.streamOptions?.reasoning).toBeUndefined();
  expect(harness.state.streamOptions?.maxTokens).toBe(64);
});
test("a transient provider failure does not leave the prompt fallback as the title", async () => {
  const harness = createHarness("C:\\title-retry.jsonl", [], { requiredRetries: 1 });
  await harness.setTitleModel?.("openai/gpt-5-mini", harness.context);
  harness.handlers.get("before_agent_start")?.({ prompt: "review the title flow" }, harness.context);
  harness.handlers.get("agent_settled")?.({}, harness.context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(harness.names).toEqual(["Review title flow"]);
});

test("reasoning models receive enough budget to emit title text", async () => {
  const harness = createHarness("C:\\title-reasoning.jsonl", [], { reasoning: true, requiredTitleTokens: 512 });
  await harness.setTitleModel?.("openai/gpt-5-mini", harness.context);
  harness.handlers.get("before_agent_start")?.({ prompt: "review the title flow" }, harness.context);
  harness.handlers.get("agent_settled")?.({}, harness.context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(harness.names).toEqual(["Review title flow"]);
  expect(harness.state.streamOptions?.maxTokens).toBe(1024);
});

test("a later user turn cannot schedule another title", () => {
  const harness = createHarness("C:\\title-existing.jsonl", [{ type: "message", message: { role: "user" } }]);
  harness.handlers.get("before_agent_start")?.({ prompt: "another request" }, harness.context);
  harness.handlers.get("agent_settled")?.({}, harness.context);

  expect(harness.state.streamCalls).toBe(0);
  expect(harness.names).toEqual([]);
});

test("uses the title model recorded by the legacy built-in extension", async () => {
  const harness = createHarness("C:\\legacy-title-model.jsonl", [
    { type: "custom", customType: "nativepi-title-generator", data: { modelSetting: "openai/gpt-5-mini" } },
  ]);
  harness.handlers.get("before_agent_start")?.({ prompt: "review the title flow" }, harness.context);
  harness.handlers.get("agent_settled")?.({}, harness.context);
  await harness.named;

  expect(harness.state.streamModel).toEqual({ provider: "openai", id: "gpt-5-mini", name: "GPT-5 mini" });
});

test("title prompt uses the readable request without skill markup", () => {
  const prompt = titlePrompt('<skill name="releasing">instructions</skill>\n\npublish the app');
  expect(prompt).toContain("Request: publish the app");
  expect(prompt).not.toContain("releasing");
});

test("title output removes prefixes, quotes, and extra lines", () => {
  expect(normalizeGeneratedTitle('Title: "Review the release flow"\nHere is why')).toBe("Review the release flow");
});

test("title output is bounded by the sidebar title limit", () => {
  const title = normalizeGeneratedTitle("x".repeat(100));
  expect(title).toHaveLength(80);
  expect(title?.endsWith("…")).toBe(true);
});

test("blank title output falls back to the existing prompt title", () => {
  expect(normalizeGeneratedTitle("\n  \n")).toBeNull();
  expect(titlePrompt("<skill name=\"releasing\">instructions</skill>")).toContain("Request: releasing");
});
