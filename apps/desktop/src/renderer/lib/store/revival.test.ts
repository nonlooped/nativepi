import { expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import { emptyConversation } from "./conversation.ts";
import { warmProject } from "./internals.ts";
import type { AppState } from "./types.ts";

function deferred<T = any>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const store = createStore<AppState>()(createAppState);
  store.setState({ activeProjectPath: "/a", activeSessionFile: "a", trust: { required: true, trusted: false } });
  return store;
}
const user = (text: string, timestamp = 1) => ({ type: "message_end" as const, message: { role: "user" as const, content: text, timestamp } });
const entry = (id: string, text: string) => ({ type: "message", id, parentId: null, timestamp: "2026-01-01", message: { role: "user", content: text, timestamp: 1 } });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("stable snapshot fences already persisted echoes and replays only later events, including identical prompts", async () => {
  const store = fixture();
  const read = deferred();
  stubInvoke(async c => c === "readSessionSnapshot" ? read.promise : {});
  const selecting = store.getState().selectChat("a");
  store.getState().onEvent({ projectDir: "/a", sessionFile: "a", runtimeId: "runtime", sequence: 1, event: user("repeat") });
  store.getState().onEvent({ projectDir: "/a", sessionFile: "a", runtimeId: "runtime", sequence: 2, event: user("repeat") });
  read.resolve({ consistency: "stable", entries: [entry("persisted", "repeat")], runtimeId: "runtime", eventWatermark: 1 });
  await selecting;
  expect(store.getState().conversations.a.entries).toHaveLength(2);
  expect(store.getState().conversations.a.entries[0].id).toBe("persisted");
});

test("retry snapshots keep live history until a settled read provides an authoritative baseline", async () => {
  const store = fixture();
  let reads = 0;
  stubInvoke(async c => c === "readSessionSnapshot" ? ++reads === 1
    ? { consistency: "retry", entries: [entry("unsafe", "repeat")], eventWatermark: 1 }
    : { consistency: "stable", entries: [entry("one", "repeat"), entry("two", "repeat")], runtimeId: "runtime", eventWatermark: 3 } : {});
  store.setState({ conversations: { a: { ...emptyConversation(), running: true, projectDir: "/a", sessionFile: "a", entries: [entry("old", "old") as any] } } });
  await store.getState().selectChat("a");
  expect(store.getState().conversations.a.entries.map(e => e.id)).toEqual(["old"]);
  store.getState().onEvent({ projectDir: "/a", sessionFile: "a", runtimeId: "runtime", sequence: 3, event: { type: "agent_settled" } });
  await tick();
  expect(reads).toBe(2);
  expect(store.getState().conversations.a.entries.map(e => e.id)).toEqual(["one", "two"]);
});

test("an early cold user echo consumes the optimistic pending message without text matching", async () => {
  const store = fixture();
  const submit = deferred();
  stubInvoke(async c => c === "submit" ? submit.promise : {});
  store.getState().newChat();
  store.getState().setDraft("hello");
  const send = store.getState().send();
  store.getState().onEvent({ projectDir: "/a", sessionFile: "bound", event: user("hello") });
  store.getState().onEvent({ projectDir: "/a", sessionFile: "bound", event: { type: "agent_settled" } });
  submit.resolve({ ok: true, sessionFile: "bound" });
  await send;
  expect(store.getState().conversations.bound.pending).toEqual([]);
  expect(store.getState().conversations.bound.running).toBe(false);
  expect(store.getState().conversations.bound.entries).toHaveLength(1);
});

test("selection A list finishing after B cannot open A's session in B", async () => {
  const store = fixture();
  const list = deferred();
  stubInvoke(async (c, p: any) => c === "listSessions" ? p.projectDir === "/slow" ? list.promise : { sessions: [] }
    : c === "checkTrust" ? { required: true, trusted: false } : {});
  const slow = store.getState().selectProject("/slow");
  await store.getState().selectProject("/fast");
  list.resolve({ sessions: [{ path: "slow-chat" }] });
  await slow;
  expect(store.getState().activeProjectPath).toBe("/fast");
  expect(store.getState().activeSessionFile).toBeNull();
});

test("warm state cannot stop a turn that started after the state request", async () => {
  const store = fixture();
  const state = deferred();
  stubInvoke(async c => c === "getState" ? state.promise : c === "getModels" ? { models: [] }
    : c === "getSessionProviders" ? { providers: [] } : c === "loadGraphicalExtensions" ? { extensions: [] }
    : c === "getThinkingLevels" ? { levels: ["off"] } : {});
  const warming = warmProject(store.setState, store.getState, "/a");
  store.getState().onEvent({ projectDir: "/a", sessionFile: "a", event: { type: "agent_start" } });
  state.resolve({ state: { isStreaming: false, isCompacting: false, thinkingLevel: "off" } });
  await warming;
  expect(store.getState().conversations.a.running).toBe(true);
});

for (const rejected of [false, true]) test(`failed model/thinking controls retain accepted values (transport ${rejected})`, async () => {
  const store = fixture();
  const model = { provider: "p", id: "accepted" };
  store.setState({ model, thinkingLevels: ["off"], thinkingLevel: "off" });
  stubInvoke(async () => { if (rejected) throw new Error("offline"); return { ok: false, error: "refused" }; });
  await store.getState().setModel({ provider: "p", id: "refused" });
  await store.getState().setThinkingLevel("high");
  expect(store.getState().model).toEqual(model);
  expect(store.getState().thinkingLevel).toBe("off");
  expect(store.getState().conversations.a.error).toBe(rejected ? "offline" : "refused");
});

test("old control response cannot write into the same model on another session", async () => {
  const store = fixture();
  const levels = deferred();
  const model = { provider: "p", id: "same" };
  stubInvoke(async c => c === "setModel" ? { ok: true } : c === "getThinkingLevels" ? levels.promise : {});
  const choosing = store.getState().setModel(model);
  await Promise.resolve();
  store.setState({ activeSessionFile: "b", model, thinkingLevels: ["off"] });
  levels.resolve({ levels: ["high"] });
  await choosing;
  expect(store.getState().thinkingLevels).toEqual(["off"]);
});

test("explicit session operations never navigate and rollback both typed and thrown failures", async () => {
  const store = fixture();
  store.setState({ sessionsByProject: { "/b": [{ path: "b", name: "before" } as any] } });
  const calls: any[] = [];
  stubInvoke(async (c, p) => { calls.push([c, p]); if (c === "deleteChat") throw new Error("offline"); return { ok: false, error: "refused" }; });
  await store.getState().renameChat("b", "after", "/b");
  await store.getState().deleteChat("b", "/b");
  expect(store.getState().activeSessionFile).toBe("a");
  expect(store.getState().sessionsByProject["/b"][0].name).toBe("before");
  expect(calls.map(([c]) => c)).toEqual(["renameChat", "deleteChat"]);
  expect(calls.every(([, p]) => p.projectDir === "/b" && p.sessionFile === "b")).toBe(true);
});

test("ordinary selection preserves an external warning; only successful host reload clears it", async () => {
  const store = fixture();
  store.setState({ conversations: { a: { ...emptyConversation(), projectDir: "/a", sessionFile: "a", externalChange: { sessionFile: "a" } } } });
  let ok = false;
  const calls: string[] = [];
  stubInvoke(async c => { calls.push(c); return c === "reloadSession" ? { ok, error: "busy" } : { consistency: "stable", entries: [], eventWatermark: 0 }; });
  await store.getState().selectChat("a");
  expect(store.getState().conversations.a.externalChange).toBeTruthy();
  await store.getState().reloadActiveSession();
  expect(store.getState().conversations.a.externalChange).toBeTruthy();
  ok = true;
  await store.getState().reloadActiveSession();
  expect(store.getState().conversations.a.externalChange).toBeNull();
  expect(calls.indexOf("reloadSession")).toBeGreaterThan(calls.indexOf("readSessionSnapshot"));
});

test("global restart stops once, resets all runtimes, preserves drafts, and warms the selection after stop", async () => {
  const store = fixture();
  const stop = deferred();
  const calls: [string, any][] = [];
  stubInvoke(async (c, p) => { calls.push([c, p]); return c === "restartAllPi" ? stop.promise
    : c === "readSessionSnapshot" ? { consistency: "stable", entries: [], eventWatermark: 0 }
    : c === "getModels" ? { models: [] } : c === "getSessionProviders" ? { providers: [] }
    : c === "loadGraphicalExtensions" ? { extensions: [] } : {}; });
  store.setState({ drafts: { a: "keep", b: "also keep" }, conversations: {
    a: { ...emptyConversation(), projectDir: "/a", sessionFile: "a", streaming: {} as any, running: true, pending: [{ id: 1, text: "sent", images: [] }] },
    b: { ...emptyConversation(), projectDir: "/b", sessionFile: "b", running: true, compacting: true, queue: { steering: [], followUp: ["next"] } },
  } });
  store.getState().onEvent({ projectDir: "/a", sessionFile: "a", runtimeId: "old", event: { type: "agent_start" } });
  const restarting = store.getState().restartAllPi();
  store.setState({ activeProjectPath: "/b", activeSessionFile: "b" });
  stop.resolve({ ok: true });
  await restarting;
  store.getState().onEvent({ projectDir: "/a", sessionFile: "a", runtimeId: "old", event: { type: "agent_start" } });
  expect(calls.filter(([c]) => c === "restartAllPi")).toHaveLength(1);
  expect(calls.some(([c]) => c === "restartPi")).toBe(false);
  expect(calls.filter(([c]) => c === "readSessionSnapshot").map(([, p]) => p.sessionFile).sort()).toEqual(["a", "b"]);
  expect(store.getState().drafts).toEqual({ a: "keep", b: "also keep" });
  expect(store.getState().conversations.a?.streaming ?? null).toBeNull();
  expect(store.getState().conversations.a?.pending ?? []).toEqual([]);
  expect(store.getState().conversations.a?.running ?? false).toBe(false);
  expect(store.getState().conversations.b.queue.followUp).toEqual([]);
});

test("provider reads and logout retain their session target across navigation", async () => {
  const store = fixture();
  const logout = deferred();
  const calls: [string, any][] = [];
  stubInvoke(async (c, p) => { calls.push([c, p]); return c === "logout" ? logout.promise : c === "getSessionProviders" ? { providers: [] } : { ok: true }; });
  await store.getState().loadProviders();
  const loggingOut = store.getState().logoutProvider("provider");
  store.setState({ activeProjectPath: "/b", activeSessionFile: "b" });
  logout.resolve({ ok: true });
  await loggingOut;
  expect(calls.find(([c]) => c === "getSessionProviders")?.[1].sessionFile).toBe("a");
  expect(calls.find(([c]) => c === "logout")?.[1].sessionFile).toBe("a");
  expect(calls.find(([c]) => c === "restartPi")?.[1].projectDir).toBe("/a");
});

test("unbound events stay with their submitting generation after New Chat replaces the draft", async () => {
  const store = fixture(); const reply = deferred();
  stubInvoke(async c => c === "submit" ? reply.promise : {});
  store.getState().newChat(); store.getState().setDraft("first");
  const sending = store.getState().send();
  store.getState().onEvent({ projectDir: "/a", runtimeId: "draft-runtime", sequence: 1, event: user("first") });
  store.getState().newChat(); store.getState().setDraft("second");
  store.getState().onEvent({ projectDir: "/a", runtimeId: "draft-runtime", sequence: 2, event: { type: "agent_start" } });
  store.getState().onEvent({ projectDir: "/a", runtimeId: "draft-runtime", sequence: 3, event: { type: "agent_settled" } });
  reply.resolve({ ok: true, sessionFile: "first-bound" }); await sending;
  expect(store.getState().activeSessionFile).toBeNull();
  expect(store.getState().conversations["/a"].entries).toEqual([]);
  expect(store.getState().conversations["first-bound"].entries).toHaveLength(1);
  expect(store.getState().conversations["first-bound"].pending).toEqual([]);
  expect(store.getState().conversations["first-bound"].running).toBe(false);
});

test("post-snapshot delivery of an already fenced event cannot duplicate a persisted entry", async () => {
  const store = fixture();
  stubInvoke(async () => ({ consistency: "stable", entries: [entry("persisted", "hello")], runtimeId: "runtime", eventWatermark: 7 }));
  await store.getState().selectChat("a");
  store.getState().onEvent({ projectDir: "/a", sessionFile: "a", runtimeId: "runtime", sequence: 7, event: user("hello") });
  expect(store.getState().conversations.a.entries).toHaveLength(1);
});

test("store instances do not share selected-folder, session-list single-flight, or last-chat ownership", async () => {
  const first = fixture(); const second = fixture(); const replies = [deferred(), deferred()]; let reads = 0;
  stubInvoke(async c => c === "listSessions" ? replies[reads++].promise : c === "checkTrust" ? { required: true, trusted: false } : {});
  const one = first.getState().selectProject("/shared"); const two = second.getState().selectProject("/shared");
  expect(reads).toBe(2);
  replies[1].resolve({ sessions: [] }); await two;
  replies[0].resolve({ sessions: [] }); await one;
  expect(first.getState().isNewChat).toBe(true);
  expect(second.getState().isNewChat).toBe(true);
});

test("same-target auth attempts reject the previous flow's prompt, notice, and completion", async () => {
  const store = fixture(); const replies = [deferred(), deferred()]; const requests: any[] = [];
  stubInvoke(async (c, p) => { if (c === "login") { requests.push(p); return replies[requests.length - 1].promise; } return { ok: true }; });
  const first = store.getState().startLogin("provider", "oauth");
  const firstFlow = store.getState().authFlow!.flowId;
  store.getState().cancelLogin();
  const second = store.getState().startLogin("provider", "oauth");
  const secondFlow = store.getState().authFlow!.flowId;
  store.getState().onAuthPrompt({ projectDir: "/a", sessionFile: "a", flowId: firstFlow, id: "old", prompt: { type: "input", message: "old" } as any });
  store.getState().onAuthNotice({ projectDir: "/a", sessionFile: "a", flowId: firstFlow, notice: {} as any });
  expect(store.getState().authFlow!.prompt).toBeUndefined();
  expect(store.getState().authFlow!.notices).toEqual([]);
  replies[0].resolve({ ok: false, error: "old failure" }); await first;
  expect(store.getState().authFlow!.error).toBeUndefined();
  store.getState().onAuthPrompt({ projectDir: "/a", sessionFile: "a", flowId: secondFlow, id: "new", prompt: { type: "input", message: "new" } as any });
  expect(store.getState().authFlow!.prompt!.id).toBe("new");
  expect(requests[0].flowId).not.toBe(requests[1].flowId);
  expect(requests[1].sessionFile).toBe("a");
  replies[1].resolve({ ok: true }); await second;
});

test("settings restart retains its obligation when the selected runtime cannot warm after a successful stop", async () => {
  const store = fixture();
  store.setState({ piRestartPending: true, trust: { required: false, trusted: true } });
  const calls: string[] = [];
  stubInvoke(async c => { calls.push(c); return c === "restartAllPi" ? { ok: true }
    : c === "ensurePi" ? { ok: false, error: "warm failed" }
    : c === "readSessionSnapshot" ? { consistency: "stable", entries: [], eventWatermark: 0 }
    : c === "getModels" ? { models: [] } : c === "getSessionProviders" ? { providers: [] }
    : c === "loadGraphicalExtensions" ? { extensions: [] } : {}; });
  await store.getState().applyPiSettingsRestart();
  expect(store.getState().piRestartPending).toBe(true);
  expect(store.getState().piSettingsError).toBe("warm failed");
  expect(calls.filter(c => c === "restartAllPi")).toHaveLength(1);
  expect(calls).not.toContain("restartPi");
});
