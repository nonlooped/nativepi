import { afterEach, expect, test } from "bun:test";
import { createStore, type StoreApi } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import { runtime } from "./internals.ts";
import { emptyConversation } from "./conversation.ts";
import type { AppState } from "./types.ts";

const stores: StoreApi<AppState>[] = [];
function fixture() {
  const store = createStore<AppState>()(createAppState);
  store.setState({ ready: true, activeProjectPath: "/p", activeSessionFile: "a", trust: { required: true, trusted: false } });
  stores.push(store);
  return store;
}
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const image = (id: string) => ({ id, name: `${id}.png`, mimeType: "image/png" as const, data: "AAAA" });
const entry = (id: string) => ({ type: "message", id, parentId: null, timestamp: "2026-11-12", message: { role: "user", content: "repeat", timestamp: 1 } });
const echo = { type: "message_end" as const, message: { role: "user" as const, content: "repeat", timestamp: 1 } };
afterEach(() => {
  for (const store of stores.splice(0)) {
    clearTimeout(runtime(store.getState).saveTimer);
    for (const timer of runtime(store.getState).draftReports.values()) clearTimeout(timer);
  }
});

// Control the two debounce clocks without delaying requests or touching disk.
function draftClock() {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const timers = new Map<ReturnType<typeof setTimeout>, { ms: number; run: () => void }>();
  globalThis.setTimeout = ((fn: () => void, ms: number) => {
    if (ms !== 150 && ms !== 250) return originalSet(fn, ms);
    const token = {} as ReturnType<typeof setTimeout>;
    timers.set(token, { ms, run: fn });
    return token;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((token: ReturnType<typeof setTimeout>) => {
    if (!timers.delete(token)) originalClear(token);
  }) as typeof clearTimeout;
  return {
    async flush(ms: number) {
      for (const [token, timer] of [...timers]) if (timer.ms === ms) { timers.delete(token); timer.run(); }
      await Promise.resolve();
    },
    restore() { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; },
  };
}

for (const kind of ["send", "enqueue"] as const) for (const thrown of [false, true]) {
  test(`${kind} failure persists and reports restored text to its session after navigation (thrown ${thrown})`, async () => {
    const store = fixture(), reply = deferred(), clock = draftClock();
    const saved: any[] = [], reports: any[] = [];
    stubInvoke(async (channel, params: any) => {
      if (channel === (kind === "send" ? "submit" : "enqueue")) return reply.promise;
      if (channel === "saveState") saved.push(structuredClone(params.state));
      if (channel === "tuiSend" && params.frame.type === "nativepi_tui_editor") reports.push(params);
      return { ok: true };
    });
    try {
      store.setState({ attachments: { a: [image("sent")] } });
      store.getState().setDraft("preserve me");
      const sending = kind === "send" ? store.getState().send() : store.getState().enqueue("followUp");
      await clock.flush(250);
      expect(saved.at(-1).drafts.a).toBe("");
      store.getState().setDraft("newer text");
      store.setState({ activeProjectPath: "/other", activeSessionFile: "b", attachments: { b: [image("other")] } });
      store.getState().setDraft("other draft");
      if (thrown) reply.reject(new Error("offline")); else reply.resolve({ ok: false, error: "offline" });
      await sending;
      await clock.flush(250); await clock.flush(150);
      expect(saved.at(-1).drafts).toEqual({ a: "preserve me\n\nnewer text", b: "other draft" });
      expect(saved.at(-1).attachments).toBeUndefined();
      expect(reports).toContainEqual({ projectDir: "/p", sessionFile: "a", frame: { type: "nativepi_tui_editor", text: "preserve me\n\nnewer text" } });
      expect(reports).toContainEqual({ projectDir: "/other", sessionFile: "b", frame: { type: "nativepi_tui_editor", text: "other draft" } });
      expect(store.getState().activeSessionFile).toBe("b");
      expect(store.getState().attachments.a).toEqual([image("sent")]);
      expect(store.getState().attachments.b).toEqual([image("other")]);
    } finally { clock.restore(); }
  });
}

test("extension editor replacement persists and reports its exact target", async () => {
  const store = fixture(), clock = draftClock(), saved: any[] = [], reports: any[] = [];
  stubInvoke(async (channel, params: any) => {
    if (channel === "saveState") saved.push(params.state);
    if (channel === "tuiSend") reports.push(params);
    return { ok: true };
  });
  try {
    store.getState().onEvent({ projectDir: "/p", sessionFile: "a", event: { type: "extension_ui_request", id: "editor", method: "set_editor_text", text: "extension draft" } });
    store.setState({ activeSessionFile: "b" }); store.getState().setDraft("b draft");
    await clock.flush(250); await clock.flush(150);
    expect(saved.at(-1).drafts).toEqual({ a: "extension draft", b: "b draft" });
    expect(reports).toContainEqual({ projectDir: "/p", sessionFile: "a", frame: { type: "nativepi_tui_editor", text: "extension draft" } });
  } finally { clock.restore(); }
});

for (const rejected of ["none", "old", "new"] as const) test(`cold binding transfers only its own preparation across New Chat (${rejected} rejected)`, async () => {
  const store = fixture(), submit = deferred(), preparations = [deferred(), deferred()]; let calls = 0;
  const originalReader = globalThis.FileReader;
  globalThis.FileReader = class {
    result = "data:image/png;base64,AAAA"; onload?: () => void;
    readAsDataURL() { queueMicrotask(() => this.onload?.()); }
  } as unknown as typeof FileReader;
  stubInvoke(async channel => channel === "submit" ? submit.promise : channel === "prepareImages" ? preparations[calls++].promise : {});
  try {
    store.getState().newChat(); store.getState().setDraft("first"); const sending = store.getState().send();
    const old = store.getState().attach([new File(["x"], "old.png", { type: "image/png" })]); await tick();
    store.getState().newChat(); store.getState().setDraft("second");
    const fresh = store.getState().attach([new File(["x"], "new.png", { type: "image/png" })]); await tick();
    submit.resolve({ ok: true, sessionFile: "bound" }); await sending;
    expect(store.getState().preparing).toEqual({ bound: 1, "new:/p": 1 });
    preparations[0].resolve({ images: rejected === "old" ? [] : [image("old")], rejected: rejected === "old" ? ["old.png"] : [] }); await old;
    expect(store.getState().preparing).toEqual({ "new:/p": 1 });
    preparations[1].resolve({ images: rejected === "new" ? [] : [image("new")], rejected: rejected === "new" ? ["new.png"] : [] }); await fresh;
    expect(store.getState().preparing).toEqual({});
    expect(store.getState().attachments.bound ?? []).toEqual(rejected === "old" ? [] : [image("old")]);
    expect(store.getState().attachments["new:/p"] ?? []).toEqual(rejected === "new" ? [] : [image("new")]);
    expect(store.getState().drafts["new:/p"]).toBe("second"); expect(store.getState().activeSessionFile).toBeNull();
  } finally { globalThis.FileReader = originalReader; }
});

for (const kind of ["send", "enqueue"] as const) test(`${kind} protects Retry while preparing, then sends prepared images`, async () => {
  const store = fixture(), calls: any[] = [];
  stubInvoke(async (channel, params) => { if (channel === "submit" || channel === "enqueue") calls.push(params); return { ok: true, sessionFile: "a" }; });
  store.setState({ preparing: { a: 1 }, drafts: { a: "see screenshot" }, conversations: { a: { ...emptyConversation(), error: "offline", errorRecovery: "retrySend" } } });
  const send = () => kind === "send" ? store.getState().send() : store.getState().enqueue("followUp");
  await send(); expect(calls).toEqual([]); expect(store.getState().drafts.a).toBe("see screenshot");
  store.setState({ preparing: {}, attachments: { a: [image("screenshot")] } });
  await send(); expect(calls).toHaveLength(1); expect(calls[0].images).toHaveLength(1);
});

for (const offscreen of [false, true]) test(`identified unbound error preserves every unrelated running chat (offscreen ${offscreen})`, () => {
  const store = fixture();
  for (const sessionFile of ["a", "b"]) {
    store.getState().onEvent({ projectDir: "/p", sessionFile, runtimeId: `runtime-${sessionFile}`, sequence: 1, event: { type: "agent_start" } });
    store.setState(state => ({ conversations: { ...state.conversations, [sessionFile]: { ...state.conversations[sessionFile], streaming: { role: "assistant", content: [] } as any, pending: [{ id: 55, text: "keep", images: [] }] } } }));
  }
  const a = store.getState().conversations.a, b = store.getState().conversations.b;
  if (offscreen) store.setState({ activeProjectPath: "/other", activeSessionFile: "c" });
  store.getState().onPiError("/p", "draft failed", undefined, "draft-runtime");
  expect(store.getState().conversations.a).toBe(a); expect(store.getState().conversations.b).toBe(b);
  expect(store.getState().conversations["/p"].error).toBe("draft failed");
});

test("promoted draft errors resolve through runtime binding", async () => {
  const store = fixture(), submit = deferred();
  stubInvoke(async channel => channel === "submit" ? submit.promise : {});
  store.getState().newChat(); store.getState().setDraft("first"); const sending = store.getState().send();
  store.getState().onEvent({ projectDir: "/p", runtimeId: "draft", sequence: 1, event: echo });
  submit.resolve({ ok: true, sessionFile: "bound" }); await sending;
  store.getState().onPiError("/p", "bound failed", undefined, "draft");
  expect(store.getState().conversations.bound.error).toBe("bound failed");
  expect(store.getState().conversations["/p"]).toBeUndefined();
});

for (const oldSuccess of [false, true]) for (const oldFirst of [false, true]) test(`canceled auth completion cannot restart or alter replacement (success ${oldSuccess}, old first ${oldFirst})`, async () => {
  const store = fixture(), replies = [deferred(), deferred()], calls: [string, any][] = []; let logins = 0;
  stubInvoke(async (channel, params) => { calls.push([channel, params]); return channel === "login" ? replies[logins++].promise : { ok: true }; });
  const one = store.getState().startLogin("p", "oauth"); const oldFlow = store.getState().authFlow!.flowId;
  store.getState().cancelLogin(); const two = store.getState().startLogin("p", "oauth"); const newFlow = store.getState().authFlow!.flowId;
  store.getState().onAuthPrompt({ projectDir: "/p", sessionFile: "a", flowId: newFlow, id: "current", prompt: { type: "input", message: "code" } as any });
  const finishOld = async () => { replies[0].resolve({ ok: oldSuccess, error: "old" }); await one; };
  const finishNew = async () => { replies[1].resolve({ ok: false, error: "current error" }); await two; };
  if (oldFirst) { await finishOld(); expect(store.getState().authFlow!.prompt?.id).toBe("current"); await finishNew(); }
  else { await finishNew(); await finishOld(); }
  expect(store.getState().authFlow?.flowId).toBe(newFlow); expect(newFlow).not.toBe(oldFlow);
  expect(store.getState().authFlow?.error).toBe("current error");
  expect(calls.filter(([channel]) => channel === "restartPi")).toEqual([]);
  expect(calls.filter(([channel]) => channel === "login").map(([, params]) => params.flowId)).toEqual([oldFlow, newFlow]);
});

test("owned login success after navigation restarts only its captured project", async () => {
  const store = fixture(), reply = deferred(), calls: any[] = [];
  stubInvoke(async (channel, params) => { if (channel === "restartPi") calls.push(params); return channel === "login" ? reply.promise : { ok: true }; });
  const login = store.getState().startLogin("p", "oauth");
  store.setState({ activeProjectPath: "/other", activeSessionFile: "b", authFlow: null });
  reply.resolve({ ok: true }); await login;
  expect(calls).toEqual([{ projectDir: "/p" }]);
});

for (const accepted of [false, true]) test(`overlapping model choice is excluded until accepted state/levels settle (accepted ${accepted})`, async () => {
  const store = fixture(), reply = deferred(), levels = deferred(), writes: any[] = [], submits: any[] = [];
  store.setState({ model: { provider: "p", id: "initial" }, thinkingLevels: ["off", "high"] });
  stubInvoke(async (channel, params) => {
    if (channel === "setModel") { writes.push(params); return reply.promise; }
    if (channel === "getThinkingLevels") return levels.promise;
    if (channel === "submit") submits.push(params);
    return { ok: true, sessionFile: "a" };
  });
  const first = store.getState().setModel({ provider: "p", id: "A" });
  await store.getState().setModel({ provider: "p", id: "B" }); expect(writes).toHaveLength(1);
  reply.resolve({ ok: accepted, error: "refused" }); await tick();
  if (accepted) {
    await store.getState().setModel({ provider: "p", id: "C" }); expect(writes).toHaveLength(1);
    levels.resolve({ levels: ["off", "high"] });
  }
  await first;
  expect(store.getState().model?.id).toBe(accepted ? "A" : "initial"); expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  store.getState().setDraft("next"); await store.getState().send();
  expect(submits[0].model.id).toBe(accepted ? "A" : "initial");
  await store.getState().setModel({ provider: "p", id: "B" }); expect(writes).toHaveLength(2);
});

for (const snapshotFirst of [false, true]) test(`snapshot and echo settle only their owned pending send once (snapshot first ${snapshotFirst})`, async () => {
  const store = fixture(), read = deferred();
  stubInvoke(async channel => channel === "readSessionSnapshot" ? read.promise : { ok: true, sessionFile: "a" });
  const selecting = store.getState().selectChat("a");
  store.getState().setDraft("repeat"); await store.getState().send();
  const payload = { projectDir: "/p", sessionFile: "a", runtimeId: "r", sequence: 5, event: echo };
  if (!snapshotFirst) store.getState().onEvent(payload);
  read.resolve({ consistency: "stable", entries: [entry("one")], runtimeId: "r", eventWatermark: 5 }); await selecting;
  if (snapshotFirst) store.getState().onEvent(payload);
  store.getState().setDraft("repeat"); await store.getState().send();
  store.getState().onEvent(payload);
  expect(store.getState().conversations.a.pending.map(item => item.text)).toEqual(["repeat"]);
  expect(store.getState().conversations.a.entries).toHaveLength(1);
  store.getState().onEvent({ ...payload, sequence: 6 });
  expect(store.getState().conversations.a.pending).toEqual([]); expect(store.getState().conversations.a.entries).toHaveLength(2);
});

test("snapshot replay cannot consume a new pending send created during its read", async () => {
  const store = fixture(), read = deferred();
  stubInvoke(async channel => channel === "readSessionSnapshot" ? read.promise : { ok: true, sessionFile: "a" });
  const selecting = store.getState().selectChat("a");
  store.getState().setDraft("repeat"); await store.getState().send();
  const payload = { projectDir: "/p", sessionFile: "a", runtimeId: "r", sequence: 2, event: echo };
  store.getState().onEvent(payload);
  store.getState().setDraft("repeat"); await store.getState().send();
  read.resolve({ consistency: "stable", entries: [], runtimeId: "r", eventWatermark: 1 }); await selecting;
  expect(store.getState().conversations.a.pending.map(item => item.text)).toEqual(["repeat"]);
  expect(store.getState().conversations.a.entries).toHaveLength(1);
});

for (const global of [false, true]) test(`restart retires snapshot-only runtimes for offscreen sessions (global ${global})`, async () => {
  const store = fixture(); let restarting = false;
  stubInvoke(async (channel, params: any) => {
    if (channel === "restartPi" || channel === "restartAllPi") { restarting = true; return { ok: true }; }
    return channel === "readSessionSnapshot" ? { consistency: "stable", entries: [], runtimeId: restarting ? undefined : `old-${params.sessionFile}`, eventWatermark: 8 } : {};
  });
  await store.getState().selectChat("a"); await store.getState().selectChat("b");
  if (global) await store.getState().restartAllPi(); else await store.getState().restartPi("/p");
  for (const sessionFile of ["a", "b"]) {
    store.getState().onTuiFrame({ projectDir: "/p", sessionFile, runtimeId: `old-${sessionFile}`, frame: { type: "nativepi_tui_state", state: { workingMessage: "retired state" } } });
    store.getState().onEvent({ projectDir: "/p", sessionFile, runtimeId: `old-${sessionFile}`, sequence: 9, event: { type: "agent_start" } });
    store.getState().onPiError("/p", "old error", sessionFile, `old-${sessionFile}`);
  }
  expect(store.getState().extUiState.workingMessage).not.toBe("retired state");
  expect(Object.values(store.getState().conversations).some(conversation => conversation.running || conversation.error === "old error")).toBe(false);
  store.getState().onTuiFrame({ projectDir: "/p", sessionFile: "b", runtimeId: "new", frame: { type: "nativepi_tui_state", state: { workingMessage: "current" } } });
  store.getState().onTuiFrame({ projectDir: "/p", sessionFile: "b", runtimeId: "old-b", frame: { type: "nativepi_tui_reset" } });
  expect(store.getState().extUiState.workingMessage).toBe("current");
});

test("cancel without a prompt or replacement prevents success restart", async () => {
  const store = fixture(), reply = deferred(), restarts: any[] = [];
  stubInvoke(async (channel, params) => { if (channel === "restartPi") restarts.push(params); return channel === "login" ? reply.promise : { ok: true }; });
  const login = store.getState().startLogin("p", "oauth"); store.getState().cancelLogin();
  reply.resolve({ ok: true }); await login;
  expect(store.getState().authFlow).toBeNull(); expect(restarts).toEqual([]);
});

test("model mutation gates are target-local and stale A to B to A completion cannot overwrite current reads", async () => {
  const store = fixture(), a = deferred(), b = deferred();
  stubInvoke(async (channel, params: any) => channel === "setModel" ? params.sessionFile === "a" ? a.promise : b.promise
    : channel === "readSessionSnapshot" ? { consistency: "stable", entries: [], eventWatermark: 0 } : { levels: ["off", "high"] });
  const one = store.getState().setModel({ provider: "p", id: "old-a" });
  await store.getState().selectChat("b");
  const two = store.getState().setModel({ provider: "p", id: "new-b" });
  b.resolve({ ok: true }); await two; expect(store.getState().model?.id).toBe("new-b");
  await store.getState().selectChat("a");
  store.setState({ model: { provider: "p", id: "authoritative-a" }, thinkingLevels: ["off"] });
  a.resolve({ ok: true }); await one;
  expect(store.getState().model?.id).toBe("authoritative-a"); expect(store.getState().thinkingLevels).toEqual(["off"]);
});

test("a fenced echo cannot consume an identical send created after snapshot acceptance", async () => {
  const store = fixture();
  stubInvoke(async channel => channel === "readSessionSnapshot" ? { consistency: "stable", entries: [entry("old")], runtimeId: "r", eventWatermark: 5 }
    : { ok: true, sessionFile: "a" });
  await store.getState().selectChat("a");
  store.getState().setDraft("repeat"); await store.getState().send();
  store.getState().onEvent({ projectDir: "/p", sessionFile: "a", runtimeId: "r", sequence: 5, event: echo });
  expect(store.getState().conversations.a.pending.map(item => item.text)).toEqual(["repeat"]);
  expect(store.getState().conversations.a.entries).toHaveLength(1);
});

test("detached preparation finishing before binding stays out of the fresh draft", async () => {
  const store = fixture(), submit = deferred(), prepared = deferred();
  const originalReader = globalThis.FileReader;
  globalThis.FileReader = class { result = "data:image/png;base64,AAAA"; onload?: () => void; readAsDataURL() { queueMicrotask(() => this.onload?.()); } } as unknown as typeof FileReader;
  stubInvoke(async channel => channel === "submit" ? submit.promise : channel === "prepareImages" ? prepared.promise : {});
  try {
    store.getState().newChat(); store.getState().setDraft("first"); const sending = store.getState().send();
    const attaching = store.getState().attach([new File(["x"], "old.png", { type: "image/png" })]); await tick();
    store.getState().newChat(); store.getState().setDraft("second");
    prepared.resolve({ images: [image("old")], rejected: [] }); await attaching;
    expect(store.getState().attachments["new:/p"]).toBeUndefined(); expect(store.getState().preparing).toEqual({});
    submit.resolve({ ok: true, sessionFile: "bound" }); await sending;
    expect(store.getState().attachments.bound).toEqual([image("old")]); expect(store.getState().drafts["new:/p"]).toBe("second");
  } finally { globalThis.FileReader = originalReader; }
});

for (const failSubmit of [false, true]) test(`failed image processing releases only its detached generation (submit fails ${failSubmit})`, async () => {
  const store = fixture(), submit = deferred(), prepared = deferred();
  const originalReader = globalThis.FileReader;
  globalThis.FileReader = class { result = "data:image/png;base64,AAAA"; onload?: () => void; readAsDataURL() { queueMicrotask(() => this.onload?.()); } } as unknown as typeof FileReader;
  stubInvoke(async channel => channel === "submit" ? submit.promise : channel === "prepareImages" ? prepared.promise : {});
  try {
    store.getState().newChat(); store.getState().setDraft("first"); const sending = store.getState().send();
    const attaching = store.getState().attach([new File(["x"], "old.png", { type: "image/png" })]); await tick();
    store.getState().newChat(); store.getState().setDraft("second");
    submit.resolve(failSubmit ? { ok: false, error: "offline" } : { ok: true, sessionFile: "bound" }); await sending;
    prepared.reject(new Error("image failed")); await expect(attaching).rejects.toThrow("image failed");
    expect(store.getState().preparing).toEqual({});
    expect(store.getState().drafts["new:/p"]).toBe(failSubmit ? "first\n\nsecond" : "second");
  } finally { globalThis.FileReader = originalReader; }
});

test("selecting another session detaches cold preparation before a fresh New Chat", async () => {
  const store = fixture(), submit = deferred(), oldImage = deferred(), newImage = deferred(); let calls = 0;
  const originalReader = globalThis.FileReader;
  globalThis.FileReader = class { result = "data:image/png;base64,AAAA"; onload?: () => void; readAsDataURL() { queueMicrotask(() => this.onload?.()); } } as unknown as typeof FileReader;
  stubInvoke(async channel => channel === "submit" ? submit.promise : channel === "prepareImages" ? (calls++ === 0 ? oldImage.promise : newImage.promise)
    : channel === "readSessionSnapshot" ? { consistency: "stable", entries: [], eventWatermark: 0 } : {});
  try {
    store.getState().newChat(); store.getState().setDraft("first"); const sending = store.getState().send();
    const old = store.getState().attach([new File(["x"], "old.png", { type: "image/png" })]); await tick();
    await store.getState().selectChat("a"); store.getState().newChat(); store.getState().setDraft("second");
    const fresh = store.getState().attach([new File(["x"], "new.png", { type: "image/png" })]); await tick();
    submit.resolve({ ok: true, sessionFile: "bound" }); await sending;
    expect(store.getState().preparing).toEqual({ bound: 1, "new:/p": 1 });
    oldImage.resolve({ images: [image("old")], rejected: [] }); newImage.resolve({ images: [image("new")], rejected: [] }); await Promise.all([old, fresh]);
    expect(store.getState().attachments.bound).toEqual([image("old")]);
    expect(store.getState().attachments["new:/p"]).toEqual([image("new")]); expect(store.getState().preparing).toEqual({});
  } finally { globalThis.FileReader = originalReader; }
});

test("a bound send completion cannot release a different cold send's exclusion", async () => {
  const store = fixture(), cold = deferred(), calls: any[] = [];
  stubInvoke(async (channel, params: any) => {
    if (channel === "submit") { calls.push(params); return params.sessionFile ? { ok: true, sessionFile: params.sessionFile } : cold.promise; }
    return channel === "readSessionSnapshot" ? { consistency: "stable", entries: [], eventWatermark: 0 } : {};
  });
  store.getState().newChat(); store.getState().setDraft("cold"); const sending = store.getState().send();
  await store.getState().selectChat("a"); store.getState().setDraft("bound"); await store.getState().send();
  store.getState().newChat(); store.getState().setDraft("fresh"); await store.getState().send();
  expect(calls).toHaveLength(2);
  cold.resolve({ ok: true, sessionFile: "cold-bound" }); await sending;
  expect(store.getState().drafts["new:/p"]).toBe("fresh"); expect(store.getState().activeSessionFile).toBeNull();
});

test("cold binding never treats preexisting transcript history as its submission acknowledgment", async () => {
  const store = fixture();
  stubInvoke(async () => ({ ok: true, sessionFile: "bound" }));
  store.setState({ conversations: { bound: { ...emptyConversation(), projectDir: "/p", sessionFile: "bound", entries: [entry("earlier") as any] } } });
  store.getState().newChat(); store.getState().setDraft("repeat"); await store.getState().send();
  expect(store.getState().conversations.bound.pending.map(item => item.text)).toEqual(["repeat"]);
  expect(store.getState().conversations.bound.entries.map(item => item.id)).toEqual(["earlier"]);
  store.getState().onEvent({ projectDir: "/p", sessionFile: "bound", runtimeId: "r", sequence: 1, event: echo });
  expect(store.getState().conversations.bound.pending).toEqual([]);
});
