import { expect, test } from "bun:test";
import throughputExtension, {
  sessionBatchingStats,
  THROUGHPUT_INSTRUCTIONS,
  withThroughputInstructions,
} from "../extensions/throughput.ts";

test("adds throughput instructions once", () => {
  const prompt = withThroughputInstructions("base prompt");
  expect(prompt).toContain(THROUGHPUT_INSTRUCTIONS);
  expect(withThroughputInstructions(prompt)).toBe(prompt);
});

test("measures calls per assistant tool response", () => {
  const toolCall = (name: string) => ({ type: "toolCall", name });
  expect(sessionBatchingStats([
    { type: "message", message: { role: "assistant", content: [toolCall("read")] } },
    { type: "message", message: { role: "toolResult", content: [] } },
    { type: "message", message: { role: "assistant", content: [toolCall("read"), toolCall("rg"), toolCall("bash")] } },
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "done" }] } },
  ])).toEqual({
    calls: 4,
    batches: 2,
    callsPerBatch: 2,
    singletonRate: 0.5,
  });
});

test("registers the prompt hook and report command", () => {
  let hook: ((event: { systemPrompt: string }) => { systemPrompt: string }) | undefined;
  let command: { handler: (args: string, context: unknown) => Promise<void> } | undefined;
  const pi = {
    on: (_event: string, handler: typeof hook) => {
      hook = handler;
    },
    registerCommand: (_name: string, definition: typeof command) => {
      command = definition;
    },
  } as unknown as Parameters<typeof throughputExtension>[0];

  throughputExtension(pi);

  expect(hook?.({ systemPrompt: "base" }).systemPrompt).toContain("Tool throughput");
  expect(command).toBeDefined();
});
