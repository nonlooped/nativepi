import { expect, test } from "bun:test";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CHAT_TITLE_SETTINGS, type ChatTitleSettings } from "../../../shared/chat-title.ts";
import { observeChatTitle, parseChatTitle } from "./chatTitle.ts";

function fixture(resumed = false, settings: () => ChatTitleSettings = () => DEFAULT_CHAT_TITLE_SETTINGS) {
  let listener!: Parameters<AgentSession["subscribe"]>[0];
  let name: string | undefined;
  const pending = Promise.withResolvers<{ content: { type: "text"; text: string }[]; stopReason: string }>();
  const proposals: string[] = [];
  const calls: Parameters<AgentSession["modelRuntime"]["completeSimple"]>[] = [];
  const titleModel = { id: "gpt-6-luna", name: "GPT-6 Luna", provider: "openai", api: "openai-responses", reasoning: true, thinkingLevels: ["low", "high"], cost: { input: 1, output: 2 } };
  const session = {
    messages: resumed ? [{ role: "user", content: "old request" }] : [],
    sessionFile: "/chat.jsonl",
    model: { id: "model", provider: "provider" },
    sessionManager: { getSessionName: () => name },
    settingsManager: { getDefaultProvider: () => undefined, getDefaultModel: () => undefined },
    subscribe: (fn: typeof listener) => { listener = fn; return () => {}; },
    modelRuntime: { getAvailableSnapshot: () => [titleModel], getModel: () => titleModel, completeSimple: (...args: typeof calls[number]) => { calls.push(args); return pending.promise; } },
  };
  const stop = observeChatTitle(session as unknown as AgentSession, (_file, title) => proposals.push(title), settings);
  const user = (content: unknown = "Repair login") => {
    // Pi emits message_end before persistence; use its payload, not session history.
    listener({ type: "message_end", message: { role: "user", content, timestamp: 1 } } as never);
  };
  return { user, session, stop, proposals, calls, rename: () => {
    name = "My name";
    listener({ type: "session_info_changed", name });
  }, end: () => listener({ type: "agent_end", messages: [], willRetry: false }), resolve: async () => {
    pending.resolve({ content: [{ type: "text", text: "Repair login flow" }], stopReason: "stop" });
    await Promise.resolve(); await Promise.resolve();
  }, reject: async () => {
    pending.reject(new Error("Provider unavailable"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  } };
}
test("starts naming from the first user message before an assistant answer, only once", async () => {
  const f = fixture();
  expect(f.calls).toHaveLength(0);
  f.user(); f.user("Another request");
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]![1].messages).toEqual([{ role: "user", content: JSON.stringify({ request: "Repair login" }), timestamp: expect.any(Number) }]);
  expect(f.calls[0]![2]).toMatchObject({ reasoning: "low", serviceTier: "priority", toolChoice: "none", disableContinuation: true });
  expect(f.calls[0]![0]).toMatchObject({ provider: "openai", id: "gpt-6-luna" });
  await f.resolve();
  expect(f.proposals).toEqual(["Repair login flow"]);
  f.end();
  expect(f.calls).toHaveLength(1);
  f.stop();
});
test("preserves resumed chats, manual names, disposed sessions, and switched sessions", async () => {
  for (const action of ["resume", "named", "rename", "dispose", "switch"]) {
    const f = fixture(action === "resume");
    if (action === "named") f.rename();
    f.user();
    if (action === "rename") f.rename();
    if (action === "dispose") f.stop();
    if (action === "switch") f.session.sessionFile = "/other.jsonl";
    await f.resolve();
    expect(f.proposals).toEqual([]);
    if (action === "named" || action === "resume") expect(f.calls).toHaveLength(0);
    if (action === "rename" || action === "dispose") expect(f.calls[0]![2]?.signal?.aborted).toBe(true);
    f.stop();
  }
});
test("uses text from multipart prompts and ignores prompts without text", async () => {
  for (const content of ["  ", [{ type: "image", data: "image" }]]) {
    const f = fixture(); f.user(content);
    expect(f.calls).toHaveLength(0); f.stop();
  }
  const f = fixture();
  f.user([{ type: "image", data: "image" }, { type: "text", text: "Repair login" }]);
  expect(f.calls).toHaveLength(1);
  await f.resolve(); expect(f.proposals).toEqual(["Repair login flow"]); f.stop();
});
test("a provider failure leaves the title alone without retrying on turn end", async () => {
  const f = fixture(); f.user(); await f.reject(); f.end();
  expect(f.calls).toHaveLength(1); expect(f.proposals).toEqual([]); f.stop();
});
test("rejects empty, multiline, and oversized output", () => {
  for (const raw of ["", "title\ncommentary", "x".repeat(81), "bad\u0000title"]) expect(parseChatTitle(raw)).toBeUndefined();
  expect(parseChatTitle('"Repair login flow"')).toBe("Repair login flow");
});

test("reads updated title preferences at send time and preserves explicit choices", async () => {
  let settings = DEFAULT_CHAT_TITLE_SETTINGS;
  const f = fixture(false, () => settings);
  settings = { model: "openai/gpt-6-luna", reasoning: "high", serviceTier: "default" };
  f.user();
  expect(f.calls[0]![2]).toMatchObject({ reasoning: "high", serviceTier: "default" });
  await f.resolve(); f.stop();
});
test("does not use the conversation model when a chosen title model is unavailable", () => {
  const f = fixture(false, () => ({ ...DEFAULT_CHAT_TITLE_SETTINGS, model: "missing/model" }));
  f.user(); expect(f.calls).toHaveLength(0); f.stop();
});

test("turning title reasoning off omits the simple runtime reasoning option", async () => {
  const f = fixture(false, () => ({ ...DEFAULT_CHAT_TITLE_SETTINGS, reasoning: "off" }));
  f.user(); expect(f.calls[0]![2]?.reasoning).toBeUndefined();
  await f.resolve(); expect(f.proposals).toEqual(["Repair login flow"]); f.stop();
});
