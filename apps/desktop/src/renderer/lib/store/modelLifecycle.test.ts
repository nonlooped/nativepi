import { afterEach, expect, test } from "bun:test";
import { createStore, type StoreApi } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import { readModelState, runtime, warmProject } from "./internals.ts";
import type { AppState } from "./types.ts";

const initial = { provider: "p", id: "initial" };
const newer = { provider: "p", id: "newer" };
const stores: StoreApi<AppState>[] = [];
function fixture(cold = false) {
  const store = createStore<AppState>()(createAppState);
  store.setState({ activeProjectPath: "/p", activeSessionFile: cold ? null : "a", model: initial,
    thinkingLevels: ["off", "high"], trust: { required: true, trusted: true } });
  stores.push(store);
  return store;
}
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(done => { resolve = done; });
  return { resolve, promise };
}
function base(channel: string, model = initial): any {
  if (channel === "getState") return { state: { model, thinkingLevel: "off", isStreaming: false, isCompacting: false } };
  if (channel === "getThinkingLevels") return { levels: ["off", "high"] };
  if (channel === "getModels") return { models: [initial, newer] };
  if (channel === "readSessionSnapshot") return { consistency: "stable", entries: [], eventWatermark: 0 };
  if (channel === "getSessionProviders") return { providers: [] };
  if (channel === "loadGraphicalExtensions") return { extensions: [] };
  return { ok: true, sessionFile: "bound" };
}
async function nextSubmit(store: StoreApi<AppState>, submits: any[], model = newer) {
  store.getState().setDraft("next");
  await store.getState().send();
  expect(submits.at(-1).model).toEqual(model);
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    const owner = runtime(store.getState);
    clearTimeout(owner.saveTimer);
    for (const timer of owner.draftReports.values()) clearTimeout(timer);
  }
});

for (const pending of ["failed state", "state retry", "state read", "levels"] as const) {
  for (const staleFailure of [false, true]) test(`cold promotion retires ${pending} and its late ${staleFailure ? "failure" : "success"}; bound retry reads Pi for next submit`, async () => {
    const store = fixture(true), old = deferred(), bound = deferred(), submits: any[] = [], targets: any[] = [];
    let states = 0;
    stubInvoke(async (channel, params: any) => {
      if (channel === "getState") {
        targets.push(params.sessionFile);
        if (params.sessionFile === "bound") return bound.promise;
        if (++states === 1 && (pending === "failed state" || pending === "state retry")) return { error: "state unavailable" };
        return old.promise;
      }
      if (channel === "getThinkingLevels" && params.sessionFile === null) return old.promise;
      if (channel === "submit") submits.push(params);
      return base(channel);
    });
    let reading = Promise.resolve();
    if (pending === "failed state" || pending === "state retry") await readModelState(store.setState, store.getState, "/p").catch(() => {});
    if (pending === "state retry" || pending === "levels") reading = store.getState().refreshThinkingLevels();
    if (pending === "state read") reading = readModelState(store.setState, store.getState, "/p");
    store.getState().setDraft("first");
    await store.getState().send();
    expect(store.getState().activeSessionFile).toBe("bound");
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    expect(store.getState().thinkingLevelsError).toBeTruthy();
    expect(store.getState().model).toEqual(initial);
    const recovering = store.getState().refreshThinkingLevels();
    expect(targets.at(-1)).toBe("bound");
    expect(store.getState().thinkingLevelsLoading).toBe(true);
    old.resolve(staleFailure ? { error: "obsolete cold error" } : pending === "levels" ? { levels: ["max"] } : base("getState"));
    await reading;
    expect(store.getState().thinkingLevelsLoading).toBe(true);
    expect(store.getState().thinkingLevelsError).toBeUndefined();
    bound.resolve(base("getState", newer)); await recovering;
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
    expect(store.getState().conversations.bound.error).toBeUndefined();
    await nextSubmit(store, submits);
  });
}

for (const failRecovery of [false, true]) test(`failed first submit preserves the cold recovery owner through its ${failRecovery ? "failure" : "success"}`, async () => {
  const store = fixture(true), state = deferred(), submit = deferred(), submits: any[] = [];
  let reads = 0, failSend = true;
  stubInvoke(async (channel, params) => {
    if (channel === "getState") return ++reads === 1 ? { error: "state unavailable" } : reads === 2 ? state.promise : base(channel, newer);
    if (channel === "submit") { submits.push(params); return failSend ? submit.promise : base(channel); }
    return base(channel);
  });
  await readModelState(store.setState, store.getState, "/p").catch(() => {});
  const recovering = store.getState().refreshThinkingLevels();
  store.getState().setDraft("first"); const sending = store.getState().send();
  store.getState().setDraft("new draft");
  submit.resolve({ ok: false, error: "send unavailable" }); await sending;
  expect(store.getState().activeSessionFile).toBeNull();
  expect(store.getState().thinkingLevelsLoading).toBe(true);
  expect(store.getState().drafts["new:/p"]).toBe("first\n\nnew draft");
  state.resolve(failRecovery ? { error: "recovery unavailable" } : base("getState", newer)); await recovering;
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().conversations["/p"].error).toBe("send unavailable");
  expect(store.getState().conversations["/p"].errorRecovery).toBe("retrySend");
  expect(store.getState().conversations["/p"].pending).toEqual([]);
  if (failRecovery) await store.getState().refreshThinkingLevels();
  failSend = false; await nextSubmit(store, submits);
});

for (const { sameText, piFailure } of [
  { sameText: false, piFailure: false },
  { sameText: false, piFailure: true },
  { sameText: true, piFailure: true },
]) test(`detached publication ${piFailure ? "replaces" : "transfers"} ${sameText ? "same-text" : "distinct"} reader error ownership through warming`, async () => {
  const store = fixture(true), submit = deferred(); let failed = true;
  const error = sameText ? "levels unavailable" : "Pi process stopped";
  stubInvoke(async channel => channel === "submit" ? submit.promise
    : channel === "getThinkingLevels" && failed ? { levels: [], error: "levels unavailable" } : base(channel));
  store.getState().setDraft("first"); const sending = store.getState().send();
  store.getState().onEvent({ projectDir: "/p", runtimeId: "cold-runtime", sequence: 1, event: { type: "session_info_changed", name: "First" } });
  await store.getState().refreshThinkingLevels();
  expect(store.getState().conversations["/p"].modelControlError).toBe(true);
  store.getState().newChat();
  store.getState().setDraft("separate draft");
  if (piFailure) store.getState().onPiError("/p", error, undefined, "cold-runtime");
  submit.resolve(base("submit")); await sending;
  expect(store.getState().activeSessionFile).toBeNull();
  expect(store.getState().drafts["new:/p"]).toBe("separate draft");
  expect(store.getState().conversations.bound.modelControlError).toBe(piFailure ? undefined : true);
  expect(store.getState().conversations.bound.error).toBe(piFailure ? error : "levels unavailable");
  failed = false; await store.getState().selectChat("bound");
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.bound.error).toBe(piFailure ? error : undefined);
  expect(store.getState().conversations.bound.errorRecovery).toBe(piFailure ? "restartPi" : undefined);
});

for (const global of [false, true]) for (const stateRecovery of [false, true]) for (const thrown of [false, true]) for (const oldFirst of [false, true]) {
  test(`failed ${global ? "global" : "project"} restart (${thrown ? "throw" : "typed"}) owns settlement of pending ${stateRecovery ? "state" : "levels"} (retired response ${oldFirst ? "before" : "after"} failure) and explicit recovery`, async () => {
    const store = fixture(), old = deferred(), stop = deferred(), recovery = deferred(), submits: any[] = [];
    let states = 0, levels = 0;
    stubInvoke(async (channel, params) => {
      if (channel === "getState") {
        states++;
        if (stateRecovery && states === 1) return { error: "state unavailable" };
        if (stateRecovery && states === 2) return old.promise;
        return recovery.promise;
      }
      if (channel === "getThinkingLevels" && ++levels === 1 && !stateRecovery) return old.promise;
      if (channel === "restartPi" || channel === "restartAllPi") { await stop.promise; if (thrown) throw new Error("restart offline"); return { ok: false }; }
      if (channel === "submit") submits.push(params);
      return base(channel);
    });
    if (stateRecovery) await readModelState(store.setState, store.getState, "/p").catch(() => {});
    const reading = store.getState().refreshThinkingLevels();
    const restarting = (global ? store.getState().restartAllPi() : store.getState().restartPi("/p")).catch(() => {});
    if (oldFirst) { old.resolve(stateRecovery ? base("getState") : { levels: ["max"] }); await reading; }
    stop.resolve({}); await restarting;
    const failure = thrown ? "restart offline" : "Pi could not restart. Try again.";
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    expect(store.getState().thinkingLevelsError).toBe(failure);
    expect(store.getState().conversations.a.error).toBe(failure);
    expect(store.getState().conversations.a.modelControlError).toBeUndefined();
    const recovering = store.getState().refreshThinkingLevels();
    expect(states).toBe(stateRecovery ? 3 : 1);
    old.resolve(stateRecovery ? base("getState") : { levels: ["max"] }); await reading;
    expect(store.getState().thinkingLevelsLoading).toBe(true);
    expect(store.getState().thinkingLevels).toEqual([]);
    expect(store.getState().conversations.a.error).toBe(failure);
    recovery.resolve(base("getState", newer)); await recovering;
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    expect(store.getState().thinkingLevelsError).toBeUndefined();
    expect(store.getState().conversations.a.error).toBe(failure);
    await nextSubmit(store, submits);
  });
}

for (const departure of ["navigation", "project restart", "global restart"] as const) test(`bound recovery and retired cold result cannot overwrite newer ${departure}`, async () => {
  const store = fixture(true), cold = deferred(), bound = deferred(), submits: any[] = [];
  let states = 0;
  stubInvoke(async (channel, params) => {
    if (channel === "getState") {
      if (++states === 1) return { error: "state unavailable" };
      if (states === 2) return cold.promise;
      if (states === 3) return bound.promise;
      return base(channel, newer);
    }
    if (channel === "submit") submits.push(params);
    return base(channel);
  });
  await readModelState(store.setState, store.getState, "/p").catch(() => {});
  const old = store.getState().refreshThinkingLevels();
  store.getState().setDraft("first"); await store.getState().send();
  const recovering = store.getState().refreshThinkingLevels();
  if (departure === "navigation") await store.getState().selectChat("other");
  else if (departure === "project restart") await store.getState().restartPi("/p");
  else await store.getState().restartAllPi();
  bound.resolve({ error: "obsolete bound failure" }); await recovering;
  cold.resolve(base("getState")); await old;
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().model).toEqual(newer);
  await nextSubmit(store, submits);
});

for (const global of [false, true]) test(`late failed ${global ? "global" : "project"} restart cannot take ownership from a newer selected state read`, async () => {
  const store = fixture(), old = deferred(), stop = deferred(), newerState = deferred();
  let levels = 0;
  stubInvoke(async channel => {
    if (channel === "getThinkingLevels" && ++levels === 1) return old.promise;
    if (channel === "restartPi" || channel === "restartAllPi") return stop.promise;
    if (channel === "getState") return newerState.promise;
    return base(channel);
  });
  const reading = store.getState().refreshThinkingLevels();
  const restarting = (global ? store.getState().restartAllPi() : store.getState().restartPi("/p")).catch(() => {});
  const warming = warmProject(store.setState, store.getState, "/p");
  stop.resolve({ ok: false }); await restarting;
  old.resolve({ levels: ["max"], error: "retired failure" }); await reading;
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a?.error).toBeUndefined();
  newerState.resolve(base("getState", newer)); await warming;
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().model).toEqual(newer);
});

for (const readerOwned of [false, true]) test(`publication respects an existing bound ${readerOwned ? "reader" : "Pi"} error's ownership over a detached reader error`, async () => {
  const store = fixture(true), submit = deferred(); let failLevels = true;
  stubInvoke(async channel => channel === "submit" ? submit.promise
    : channel === "getThinkingLevels" && failLevels ? { levels: [], error: "levels unavailable" } : base(channel));
  store.getState().setDraft("first"); const sending = store.getState().send();
  await store.getState().refreshThinkingLevels();
  store.getState().newChat();
  if (readerOwned) {
    const readerError = store.getState().conversations["/p"];
    // The bound event projection can already exist before submit publishes its cold owner.
    store.setState(state => ({ conversations: { ...state.conversations, bound: {
      ...readerError, projectDir: "/p", sessionFile: "bound", error: "bound levels unavailable", modelControlError: true,
    } } }));
  } else store.getState().onPiError("/p", "bound Pi error", "bound", "bound-runtime");
  submit.resolve(base("submit")); await sending;
  expect(store.getState().conversations.bound.modelControlError).toBe(readerOwned ? true : undefined);
  failLevels = false; await store.getState().selectChat("bound");
  expect(store.getState().conversations.bound.error).toBe(readerOwned ? undefined : "bound Pi error");
});

test("detached agent_start clears reader banner ownership before publication", async () => {
  const store = fixture(true), submit = deferred();
  stubInvoke(async channel => channel === "submit" ? submit.promise
    : channel === "getThinkingLevels" ? { levels: [], error: "levels unavailable" } : base(channel));
  store.getState().setDraft("first"); const sending = store.getState().send();
  store.getState().onEvent({ projectDir: "/p", runtimeId: "cold-runtime", event: { type: "session_info_changed", name: "First" } });
  await store.getState().refreshThinkingLevels();
  store.getState().newChat();
  store.getState().onEvent({ projectDir: "/p", runtimeId: "cold-runtime", event: { type: "agent_start" } });
  submit.resolve(base("submit")); await sending;
  expect(store.getState().conversations.bound.error).toBeUndefined();
  expect(store.getState().conversations.bound.modelControlError).toBeUndefined();
});

for (const global of [false, true]) test(`failed ${global ? "global" : "project"} restart cannot settle a newer chat's pending read`, async () => {
  const store = fixture(), old = deferred(), stop = deferred(), selected = deferred(); let levels = 0;
  stubInvoke(async channel => {
    if (channel === "getThinkingLevels" && ++levels === 1) return old.promise;
    if (channel === "restartPi" || channel === "restartAllPi") return stop.promise;
    if (channel === "getState") return selected.promise;
    return base(channel);
  });
  const reading = store.getState().refreshThinkingLevels();
  const restarting = (global ? store.getState().restartAllPi() : store.getState().restartPi("/p")).catch(() => {});
  const selecting = store.getState().selectChat("other");
  await new Promise(resolve => setTimeout(resolve, 0));
  stop.resolve({ ok: false }); await restarting;
  old.resolve({ levels: ["max"] }); await reading;
  expect(store.getState().activeSessionFile).toBe("other");
  expect(store.getState().thinkingLevelsLoading).toBe(true);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.other?.error).toBeUndefined();
  if (!global) expect(store.getState().conversations.a.error).toBe("Pi could not restart. Try again.");
  selected.resolve(base("getState", newer)); await selecting;
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().model).toEqual(newer);
});

test("failure restarting another project preserves its target error without retiring selected levels", async () => {
  const store = fixture(), levels = deferred();
  stubInvoke(async channel => channel === "getThinkingLevels" ? levels.promise : channel === "restartPi" ? { ok: false } : base(channel));
  const reading = store.getState().refreshThinkingLevels();
  await store.getState().restartPi("/other-project");
  expect(store.getState().thinkingLevelsLoading).toBe(true);
  expect(store.getState().conversations["/other-project"].error).toBe("Pi could not restart. Try again.");
  levels.resolve({ levels: ["max"] }); await reading;
  expect(store.getState().thinkingLevels).toEqual(["max"]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
});

test("a successful replacement global restart retires older failed project restart and levels replies", async () => {
  const store = fixture(), old = deferred(), stop = deferred(), submits: any[] = []; let levels = 0, restarts = 0;
  stubInvoke(async (channel, params) => {
    if (channel === "getThinkingLevels" && ++levels === 1) return old.promise;
    if (channel === "restartPi" || channel === "restartAllPi") return ++restarts === 1 ? stop.promise : { ok: true };
    if (channel === "submit") submits.push(params);
    return base(channel, newer);
  });
  const reading = store.getState().refreshThinkingLevels();
  // A global request can supersede a pending project request; the inverse joins it.
  const restarting = store.getState().restartPi("/p");
  await store.getState().restartAllPi();
  stop.resolve({ ok: false }); await restarting;
  old.resolve({ levels: ["max"] }); await reading;
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a.error).toBeUndefined();
  await nextSubmit(store, submits);
});

for (const bufferedStart of [false, true]) test(`snapshot publication ${bufferedStart ? "clears a replayed" : "preserves the same"} reader banner owner`, async () => {
  const store = fixture(), snapshot = deferred(); let failLevels = true;
  stubInvoke(async channel => channel === "readSessionSnapshot" ? snapshot.promise
    : channel === "getThinkingLevels" && failLevels ? { levels: [], error: "levels unavailable" } : base(channel));
  const reading = store.getState().refreshSession("/p", "a");
  if (bufferedStart) store.getState().onEvent({ projectDir: "/p", sessionFile: "a", runtimeId: "runtime", sequence: 1, event: { type: "agent_start" } });
  await store.getState().refreshThinkingLevels();
  expect(store.getState().conversations.a.modelControlError).toBe(true);
  snapshot.resolve({ consistency: "stable", entries: [], runtimeId: "runtime", eventWatermark: 0 }); await reading;
  expect(store.getState().conversations.a.error).toBe(bufferedStart ? undefined : "levels unavailable");
  expect(store.getState().conversations.a.modelControlError).toBe(bufferedStart ? undefined : true);
  failLevels = false; await warmProject(store.setState, store.getState, "/p");
  expect(store.getState().conversations.a.error).toBeUndefined();
});

test("ordinary completed cold model projection does not require another read when submit binds it", async () => {
  const store = fixture(true); let states = 0;
  stubInvoke(async channel => { if (channel === "getState") ++states; return base(channel); });
  await readModelState(store.setState, store.getState, "/p");
  store.getState().setDraft("first"); await store.getState().send();
  expect(store.getState().activeSessionFile).toBe("bound");
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  expect(states).toBe(1);
});

for (const global of [false, true]) test(`a failed ${global ? "global" : "project"} restart can be explicitly restarted again before retired levels arrive`, async () => {
  const store = fixture(), old = deferred(), submits: any[] = []; let levels = 0, stops = 0;
  stubInvoke(async (channel, params) => {
    if (channel === "getThinkingLevels" && ++levels === 1) return old.promise;
    if (channel === "restartPi" || channel === "restartAllPi") return { ok: ++stops > 1 };
    if (channel === "submit") submits.push(params);
    return base(channel, newer);
  });
  const reading = store.getState().refreshThinkingLevels();
  const restart = () => global ? store.getState().restartAllPi() : store.getState().restartPi("/p");
  await restart().catch(() => {});
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBe("Pi could not restart. Try again.");
  await restart();
  old.resolve({ levels: ["max"], error: "retired levels failure" }); await reading;
  expect(stops).toBe(2);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a.error).toBeUndefined();
  expect(store.getState().conversations.a.errorRecovery).toBeUndefined();
  await nextSubmit(store, submits);
});
