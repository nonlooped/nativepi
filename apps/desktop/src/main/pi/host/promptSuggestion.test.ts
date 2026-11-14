import { expect, test } from "bun:test";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { observePromptSuggestion, parsePromptSuggestion } from "./promptSuggestion.ts";

function fixture() {
  let listener!: Parameters<AgentSession["subscribe"]>[0];
  const pending = Promise.withResolvers<{ content: { type: "text"; text: string }[]; stopReason: string }>();
  const proposals: ({ text: string; timestamp: number } | null)[] = [];
  const calls: unknown[][] = [];
  let signal!: AbortSignal;
  let unsubscribed = false;
  const session = {
    messages: [{ role: "user", content: "Please fix login", timestamp: 1 }, { role: "assistant", content: [{ type: "text", text: "Fixed login. Would you like regression coverage?" }], stopReason: "stop", timestamp: 2 }],
    sessionFile: "/chat.jsonl", model: { id: "model", provider: "provider" }, isStreaming: false, isCompacting: false,
    subscribe: (fn: typeof listener) => { listener = fn; return () => { unsubscribed = true; }; },
    modelRuntime: { completeSimple: (...args: unknown[]) => { calls.push(args); signal = (args[2] as { signal: AbortSignal }).signal; return pending.promise; } },
  };
  const observer = observePromptSuggestion(session as unknown as AgentSession, suggestion => proposals.push(suggestion));
  const end = (aborted = false) => listener({ type: "agent_settled", aborted });
  return { session, observer, end, calls, proposals, signal: () => signal, unsubscribed: () => unsubscribed,
    event: (type: "agent_start" | "compaction_start") => listener({ type, reason: "manual" } as never),
    resolve: async (text = "Add regression coverage", stopReason = "stop") => {
      pending.resolve({ content: [{ type: "text", text }], stopReason });
      await pending.promise; await Promise.resolve();
    } };
}

test("opt-in generation uses the current Pi model without adding a conversation turn", async () => {
  const f = fixture(); f.end(); expect(f.calls).toHaveLength(0);
  f.observer.setEnabled(true); f.end(); f.end();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0][0]).toBe(f.session.model);
  expect(f.calls[0][1]).not.toHaveProperty("tools");
  await f.resolve();
  expect(f.proposals.at(-1)).toEqual({ text: "Add regression coverage", timestamp: 2 });
  expect(f.session.messages).toHaveLength(2);
  f.observer.dispose(); expect(f.unsubscribed()).toBe(true);
});

for (const change of ["start", "compact", "disable", "dispose", "session", "branch", "model", "error", "empty"]) test(`late suggestions are discarded after ${change}`, async () => {
  const f = fixture(); f.observer.setEnabled(true); f.end();
  if (change === "start") f.event("agent_start");
  if (change === "compact") f.event("compaction_start");
  if (change === "disable") f.observer.setEnabled(false);
  if (change === "dispose") f.observer.dispose();
  if (change === "session") f.session.sessionFile = "/other.jsonl";
  if (change === "model") f.session.model = { id: "other", provider: "provider" };
  if (change === "branch") f.session.messages = f.session.messages.map(message => ({ ...message }));
  if (["start", "compact", "disable", "dispose"].includes(change)) expect(f.signal().aborted).toBe(true);
  await f.resolve(change === "empty" ? "" : undefined, change === "error" ? "error" : undefined);
  expect(f.proposals.filter(Boolean)).toEqual([]); f.observer.dispose();
});

test("aborted and failed turns never request predictions", () => {
  const f = fixture(); f.observer.setEnabled(true); f.end(true);
  f.session.messages[1]!.stopReason = "error"; f.end();
  expect(f.calls).toHaveLength(0); f.observer.dispose();
});

test("prediction input is bounded and excludes tool results and thinking", async () => {
  const f = fixture();
  f.session.messages.unshift(...Array.from({ length: 100 }, () => ({ role: "user", content: "x".repeat(5000), timestamp: 1 })));
  f.session.messages.splice(-1, 0, { role: "toolResult", content: [{ type: "text", text: "TOOL_SECRET" }], timestamp: 1 } as never);
  f.session.messages.at(-1)!.content = [{ type: "thinking", thinking: "THINKING_SECRET" }, { type: "text", text: "Fixed" }] as never;
  f.observer.setEnabled(true); f.end();
  const context = f.calls[0][1] as { messages: { content: string }[] };
  expect(context.messages[0].content).not.toContain("TOOL_SECRET");
  expect(context.messages[0].content).not.toContain("THINKING_SECRET");
  const data = JSON.parse(context.messages[0].content);
  expect(data).toHaveLength(6);
  expect(data.every((message: { text: string }) => message.text.length <= 2000)).toBe(true);
  await f.resolve(); f.observer.dispose();
});

test("rejects malformed predictions but accepts multilingual text", () => {
  for (const value of ["", "x".repeat(241), "two\nlines", "bad\0text", "word ".repeat(31)]) expect(parsePromptSuggestion(value)).toBeUndefined();
  expect(parsePromptSuggestion('"Add regression coverage"')).toBe("Add regression coverage");
  expect(parsePromptSuggestion("أضف اختبارًا لهذا التغيير")).toBe("أضف اختبارًا لهذا التغيير");
});
