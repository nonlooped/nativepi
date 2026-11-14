import { expect, test } from "bun:test";
import { convertToLlm, type AgentSession } from "@earendil-works/pi-coding-agent";
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
    agent: { transformContext: async (messages: AgentSession["messages"]) => messages, convertToLlm, sessionId: "fixture" },
    modelRuntime: { completeSimple: (...args: unknown[]) => { calls.push(args); signal = (args[2] as { signal: AbortSignal }).signal; return pending.promise; } },
  };
  const observer = observePromptSuggestion(session as unknown as AgentSession, suggestion => proposals.push(suggestion));
  const end = async (aborted = false) => {
    listener({ type: "agent_settled", aborted });
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { session, observer, end, calls, proposals, signal: () => signal, unsubscribed: () => unsubscribed,
    event: (type: "agent_start" | "compaction_start") => listener({ type, reason: "manual" } as never),
    resolve: async (text = "Add regression coverage", stopReason = "stop") => {
      pending.resolve({ content: [{ type: "text", text }], stopReason });
      await pending.promise; await Promise.resolve();
    } };
}

test("opt-in generation uses the current Pi model without adding a conversation turn", async () => {
  const f = fixture(); await f.end(); expect(f.calls).toHaveLength(0);
  f.observer.setEnabled(true); await f.end(); await f.end();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0][0]).toBe(f.session.model);
  expect(f.calls[0][1]).not.toHaveProperty("tools");
  await f.resolve();
  expect(f.proposals.at(-1)).toEqual({ text: "Add regression coverage", timestamp: 2 });
  expect(f.session.messages).toHaveLength(2);
  f.observer.dispose(); expect(f.unsubscribed()).toBe(true);
});

for (const change of ["start", "compact", "disable", "dispose", "session", "branch", "model", "error", "empty"]) test(`late suggestions are discarded after ${change}`, async () => {
  const f = fixture(); f.observer.setEnabled(true); await f.end();
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

test("aborted and failed turns never request predictions", async () => {
  const f = fixture(); f.observer.setEnabled(true); await f.end(true);
  f.session.messages[1]!.stopReason = "error"; await f.end();
  expect(f.calls).toHaveLength(0); f.observer.dispose();
});

test("preserves the request, full answer, project instructions, and tool outcomes across long runs", async () => {
  const f = fixture();
  const request = "IMPORTANT REQUEST: preserve the offline workflow. " + "request detail ".repeat(500);
  const answer = "IMPORTANT ANSWER: offline support is complete. " + "answer detail ".repeat(500);
  f.session.messages[0]!.content = request;
  f.session.messages.at(-1)!.content = [{ type: "text", text: answer }];
  f.session.messages.unshift({ role: "system", content: "PROJECT INSTRUCTIONS: prioritize offline support", timestamp: 0, toolsAdded: [{ name: "bash", description: "Shell", parameters: { type: "object" } }] } as never);
  f.session.messages.splice(-1, 0, ...Array.from({ length: 25 }, (_, i) => [
    { role: "assistant", content: [{ type: "toolCall", id: `call-${i}`, name: "bash", arguments: { command: "test" } }], stopReason: "toolUse", timestamp: 1 },
    { role: "toolResult", toolCallId: `call-${i}`, toolName: "bash", content: [{ type: "text", text: `Test ${i} passed` }], isError: false, timestamp: 1 },
  ]).flat() as never[]);
  const before = structuredClone(f.session.messages);
  f.observer.setEnabled(true); await f.end();
  const context = f.calls[0][1] as { messages: typeof before };
  expect(context.messages).toEqual(expect.arrayContaining(before));
  const options = f.calls[0][2];
  expect(options).toMatchObject({ toolChoice: "none", disableContinuation: true, sessionId: "fixture" });
  await f.resolve("Thanks, that fixed it.");
  expect(f.proposals.at(-1)?.text).toBe("Thanks, that fixed it.");
  expect(f.session.messages).toEqual(before);
  f.observer.dispose();
});

test("uses Pi context transforms and conversion for compaction, extensions, and excluded shell output", async () => {
  const f = fixture();
  f.session.messages.unshift({ role: "compactionSummary", summary: "EARLIER USER PREFERENCE", tokensBefore: 10000, timestamp: 0 } as never);
  f.session.messages.splice(-1, 0, { role: "bashExecution", command: "private", output: "EXCLUDED OUTPUT", excludeFromContext: true, timestamp: 1 } as never);
  f.session.agent.transformContext = async messages => {
    const user = messages[1];
    if (user?.role === "user") user.content = "Modified only in prediction context";
    return [...messages, { role: "custom", customType: "context", content: "EXTENSION CONTEXT", display: false, timestamp: 2 }];
  };
  f.observer.setEnabled(true); await f.end();
  const context = JSON.stringify(f.calls[0][1]);
  expect(context).toContain("EARLIER USER PREFERENCE");
  expect(context).toContain("EXTENSION CONTEXT");
  expect(context).not.toContain("EXCLUDED OUTPUT");
  expect(f.session.messages[1]!.content).toBe("Please fix login");
  await f.resolve(); f.observer.dispose();
});

for (const change of ["start", "disable", "session"]) test(`does not send a prediction when context preparation outlives ${change}`, async () => {
  const f = fixture();
  const preparing = Promise.withResolvers<AgentSession["messages"]>();
  f.session.agent.transformContext = () => preparing.promise;
  f.observer.setEnabled(true); await f.end();
  expect(f.calls).toHaveLength(0);
  if (change === "start") f.event("agent_start");
  if (change === "disable") f.observer.setEnabled(false);
  if (change === "session") f.session.sessionFile = "/other.jsonl";
  preparing.resolve(f.session.messages as AgentSession["messages"]);
  await preparing.promise; await Promise.resolve();
  expect(f.calls).toHaveLength(0);
  expect(f.proposals.filter(Boolean)).toEqual([]);
  f.observer.dispose();
});

test("a failing extension context hook leaves the conversation and turn alone", async () => {
  const f = fixture();
  const before = structuredClone(f.session.messages);
  f.session.agent.transformContext = async () => { throw new Error("Extension context failed"); };
  f.observer.setEnabled(true); await f.end();
  expect(f.calls).toHaveLength(0);
  expect(f.proposals.filter(Boolean)).toEqual([]);
  expect(f.session.messages).toEqual(before);
  f.observer.dispose();
});

test("rejects malformed predictions but accepts multilingual text", () => {
  for (const value of ["", "x".repeat(241), "two\nlines", "bad\0text", "word ".repeat(31)]) expect(parsePromptSuggestion(value)).toBeUndefined();
  expect(parsePromptSuggestion('"Add regression coverage"')).toBe("Add regression coverage");
  expect(parsePromptSuggestion("أضف اختبارًا لهذا التغيير")).toBe("أضف اختبارًا لهذا التغيير");
});
