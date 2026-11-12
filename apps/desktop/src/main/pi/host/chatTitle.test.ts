import { expect, test } from "bun:test";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { observeChatTitle, parseChatTitle } from "./chatTitle.ts";

function fixture(resumed = false) {
  let listener!: Parameters<AgentSession["subscribe"]>[0];
  let name: string | undefined;
  const pending = Promise.withResolvers<{ content: { type: "text"; text: string }[]; stopReason: string }>();
  const proposals: string[] = [];
  let calls = 0;
  const session = {
    messages: resumed ? [{ role: "user", content: "old request" }] : [],
    sessionFile: "/chat.jsonl",
    model: { id: "model", provider: "provider" },
    sessionManager: { getSessionName: () => name },
    subscribe: (fn: typeof listener) => { listener = fn; return () => {}; },
    modelRuntime: { completeSimple: () => { calls++; return pending.promise; } },
  };
  const stop = observeChatTitle(session as unknown as AgentSession, (_file, title) => proposals.push(title));
  const end = (stopReason = "stop") => {
    session.messages = [{ role: "user", content: "Repair login" }, { role: "assistant", content: "Fixed" , stopReason } as never];
    listener({ type: "agent_end", messages: [], willRetry: false });
  };
  return { end, stop, proposals, calls: () => calls, rename: () => { name = "My name"; }, resolve: async () => {
    pending.resolve({ content: [{ type: "text", text: "Repair login flow" }], stopReason: "stop" });
    await Promise.resolve(); await Promise.resolve();
  } };
}
test("names once using a successful first answer", async () => {
  const f = fixture(); f.end(); f.end(); await f.resolve();
  expect(f.calls()).toBe(1); expect(f.proposals).toEqual(["Repair login flow"]); f.stop();
});
test("preserves resumed chats, manual names, disposed sessions, and failed turns", async () => {
  for (const action of ["resume", "rename", "dispose", "error", "aborted"]) {
    const f = fixture(action === "resume");
    f.end(action === "error" || action === "aborted" ? action : "stop");
    if (action === "rename") f.rename();
    if (action === "dispose") f.stop();
    await f.resolve(); expect(f.proposals).toEqual([]); f.stop();
  }
});
test("rejects empty, multiline, and oversized output", () => {
  for (const raw of ["", "title\ncommentary", "x".repeat(81), "bad\u0000title"]) expect(parseChatTitle(raw)).toBeUndefined();
  expect(parseChatTitle('"Repair login flow"')).toBe("Repair login flow");
});
