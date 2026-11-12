import { afterEach, expect, test } from "bun:test";
import { createStore, type StoreApi } from "zustand/vanilla";
import { stubInvoke } from "./testBridge.ts";
import { createAppState } from "../store.ts";
import { runtime, warmProject } from "./internals.ts";
import type { AppState } from "./types.ts";
import type { ModelInfo } from "../../../shared/pi-types.ts";

const initial = { provider: "p", id: "initial" };
const chosen = { provider: "p", id: "chosen" };
const newer = { provider: "p", id: "newer" };
const stores: StoreApi<AppState>[] = [];
function fixture() {
  const store = createStore<AppState>()(createAppState);
  store.setState({ activeProjectPath: "/p", activeSessionFile: "a", model: initial,
    thinkingLevels: ["off", "max"], trust: { required: true, trusted: true } });
  stores.push(store);
  return store;
}
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function base(channel: string, model: ModelInfo = initial) {
  if (channel === "readSessionSnapshot") return { consistency: "stable", entries: [], eventWatermark: 0 };
  if (channel === "getState") return { state: { model, thinkingLevel: "off", isStreaming: false, isCompacting: false } };
  if (channel === "getThinkingLevels") return { levels: ["off", "high"] };
  if (channel === "getModels") return { models: [initial, chosen, newer] };
  if (channel === "getSessionProviders") return { providers: [] };
  if (channel === "loadGraphicalExtensions") return { extensions: [] };
  return { ok: true, sessionFile: "a" };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function nextSubmit(store: StoreApi<AppState>, submits: any[], expected: ModelInfo) {
  store.getState().setDraft("next");
  await store.getState().send();
  expect(submits.at(-1)?.model).toEqual(expected);
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    const owner = runtime(store.getState);
    clearTimeout(owner.saveTimer);
    for (const timer of owner.draftReports.values()) clearTimeout(timer);
  }
});

for (const appliedBeforeRead of [false, true]) test(`re-entry reads ${appliedBeforeRead ? "after" : "before"} application reconcile on acknowledgment and submit the accepted model`, async () => {
  const store = fixture(), reply = deferred(), submits: any[] = [], reads: string[] = [];
  let authoritative = initial;
  stubInvoke(async (channel, params: any) => {
    if (channel === "setModel") {
      if (appliedBeforeRead) authoritative = chosen;
      await reply.promise;
      authoritative = chosen;
      return { ok: true };
    }
    if (channel === "getState") reads.push(params.sessionFile);
    if (channel === "submit") submits.push(params);
    return base(channel, authoritative);
  });
  const choosing = store.getState().setModel(chosen);
  await store.getState().selectChat("b");
  await store.getState().selectChat("a");
  expect(store.getState().model).toEqual(appliedBeforeRead ? chosen : initial);
  reply.resolve({ ok: true });
  await choosing;
  expect(reads).toEqual(["b", "a", "a"]);
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  await nextSubmit(store, submits, chosen);
});

test("completion away from the target does no levels work; a later return reads Pi", async () => {
  const store = fixture(), reply = deferred(), levelsTargets: string[] = [], submits: any[] = [];
  let authoritative = initial;
  stubInvoke(async (channel, params: any) => {
    if (channel === "setModel") { await reply.promise; authoritative = chosen; return { ok: true }; }
    if (channel === "getThinkingLevels") levelsTargets.push(params.sessionFile);
    if (channel === "submit") submits.push(params);
    return base(channel, params?.sessionFile === "a" ? authoritative : initial);
  });
  const choosing = store.getState().setModel(chosen);
  await store.getState().selectChat("b");
  const projection = store.getState().model;
  reply.resolve({ ok: true }); await choosing;
  expect(store.getState().model).toBe(projection);
  expect(levelsTargets).toEqual(["b"]);
  await store.getState().selectChat("a");
  await nextSubmit(store, submits, chosen);
});

test("re-entry after application preserves a newer authoritative model instead of replaying the captured choice", async () => {
  const store = fixture(), reply = deferred(), submits: any[] = [];
  let authoritative = initial;
  stubInvoke(async (channel, params) => {
    if (channel === "setModel") { authoritative = chosen; await reply.promise; return { ok: true }; }
    if (channel === "submit") submits.push(params);
    return base(channel, authoritative);
  });
  const choosing = store.getState().setModel(chosen);
  await store.getState().selectChat("b");
  authoritative = newer;
  await store.getState().selectChat("a");
  reply.resolve({ ok: true }); await choosing;
  await nextSubmit(store, submits, newer);
});

test("a newer state read supersedes an in-flight post-mutation reconciliation", async () => {
  const store = fixture(), reply = deferred(), staleRead = deferred(), submits: any[] = [];
  let authoritative = initial, hold = false;
  stubInvoke(async (channel, params) => {
    if (channel === "setModel") { await reply.promise; authoritative = chosen; return { ok: true }; }
    if (channel === "getState" && hold) { hold = false; return staleRead.promise; }
    if (channel === "submit") submits.push(params);
    return base(channel, authoritative);
  });
  const choosing = store.getState().setModel(chosen);
  await store.getState().selectChat("b"); await store.getState().selectChat("a");
  hold = true; reply.resolve({ ok: true }); await tick();
  authoritative = newer;
  await warmProject(store.setState, store.getState, "/p");
  staleRead.resolve(base("getState", chosen)); await choosing;
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  await nextSubmit(store, submits, newer);
});

for (const global of [false, true]) for (const newPending of [false, true]) {
  test(`${global ? "global" : "project"} restart retires an old levels gate; old cleanup ${newPending ? "cannot release a new pending write" : "cannot change a completed new model"}`, async () => {
    const store = fixture(), oldLevels = deferred(), newReply = deferred(), writes: string[] = [], submits: any[] = [];
    let held = false;
    stubInvoke(async (channel, params: any) => {
      if (channel === "setModel") {
        writes.push(params.modelId);
        if (params.modelId === "newer" && newPending) return newReply.promise;
        return { ok: true };
      }
      if (channel === "getThinkingLevels" && !held) { held = true; return oldLevels.promise; }
      if (channel === "submit") submits.push(params);
      return base(channel);
    });
    const old = store.getState().setModel(chosen); await tick();
    if (global) await store.getState().restartAllPi(); else await store.getState().restartPi("/p");
    const replacement = store.getState().setModel(newer);
    if (!newPending) await replacement;
    expect(writes).toEqual(["chosen", "newer"]);
    oldLevels.resolve({ levels: [], error: "retired levels failure" }); await old;
    expect(store.getState().thinkingLevelsError).toBeUndefined();
    if (newPending) {
      expect(store.getState().thinkingLevelsLoading).toBe(true);
      await store.getState().setModel(initial);
      expect(writes).toEqual(["chosen", "newer"]);
      newReply.resolve({ ok: true }); await replacement;
    }
    expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
    await nextSubmit(store, submits, newer);
    await store.getState().setModel(initial);
    expect(writes).toEqual(["chosen", "newer", "initial"]);
  });
}

for (const global of [false, true]) test(`old acknowledgment after ${global ? "global" : "project"} retirement starts no levels request`, async () => {
  const store = fixture(), reply = deferred(), levels: string[] = [];
  stubInvoke(async (channel, params: any) => {
    if (channel === "setModel") return reply.promise;
    if (channel === "getThinkingLevels") levels.push(params.sessionFile);
    return base(channel);
  });
  const old = store.getState().setModel(chosen);
  if (global) await store.getState().restartAllPi(); else await store.getState().restartPi("/p");
  const count = levels.length;
  reply.resolve({ ok: true }); await old;
  expect(levels).toHaveLength(count);
  expect(store.getState().model).toEqual(initial);
});

for (const warming of [false, true]) for (const thrown of [false, true]) {
  test(`${warming ? "warm" : "model"} levels ${thrown ? "throw" : "typed failure"} settles visibly, keeps accepted model, and retries without another mutation`, async () => {
    const store = fixture(), retry = deferred(), writes: string[] = [], submits: any[] = [];
    let levelReads = 0;
    stubInvoke(async (channel, params: any) => {
      if (channel === "setModel") { writes.push(params.modelId); return { ok: true }; }
      if (channel === "getThinkingLevels") {
        if (++levelReads > 1) return retry.promise;
        if (thrown) throw new Error("levels unavailable");
        return { levels: [], error: "levels unavailable" };
      }
      if (channel === "submit") submits.push(params);
      return base(channel, chosen);
    });
    if (warming) await warmProject(store.setState, store.getState, "/p"); else await store.getState().setModel(chosen);
    expect(store.getState().model).toEqual(chosen);
    expect(store.getState().thinkingLevels).toEqual([]);
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    expect(store.getState().thinkingLevelsError).toBe("levels unavailable");
    expect(store.getState().conversations.a.error).toBe("levels unavailable");
    const recovering = store.getState().refreshThinkingLevels();
    expect(store.getState().thinkingLevelsLoading).toBe(true);
    expect(store.getState().thinkingLevelsError).toBeUndefined();
    expect(store.getState().conversations.a.error).toBeUndefined();
    retry.resolve({ levels: ["off", "high"] }); await recovering;
    expect(writes).toEqual(warming ? [] : ["chosen"]);
    expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
    await nextSubmit(store, submits, chosen);
  });
}

test("model reselection recovers levels failure without restoring unsupported old levels", async () => {
  const store = fixture(); let fail = true;
  stubInvoke(async channel => channel === "getThinkingLevels" && fail ? { levels: [], error: "failed levels" } : base(channel));
  await store.getState().setModel(chosen);
  expect(store.getState().thinkingLevels).toEqual([]);
  fail = false;
  await store.getState().setModel(newer);
  expect(store.getState().model).toEqual(newer);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a.error).toBeUndefined();
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
});

test("a failed retry from an old view cannot replace the new view's levels or error", async () => {
  const store = fixture(), reply = deferred(); let reads = 0;
  stubInvoke(async channel => channel === "getThinkingLevels" && ++reads === 1 ? reply.promise : base(channel));
  store.setState({ thinkingLevels: [], thinkingLevelsError: "previous failure" });
  const old = store.getState().refreshThinkingLevels();
  await store.getState().selectChat("b");
  reply.resolve({ levels: [], error: "stale retry" }); await old;
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
});

test("an empty successful levels result is settled rather than loading", async () => {
  const store = fixture();
  stubInvoke(async channel => channel === "getThinkingLevels" ? { levels: [] } : base(channel));
  await store.getState().setModel(chosen);
  expect(store.getState().thinkingLevels).toEqual([]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
});

test("a state read during a same-view mutation cannot permanently mask its later application", async () => {
  const store = fixture(), reply = deferred(), submits: any[] = [];
  let authoritative = initial;
  stubInvoke(async (channel, params) => {
    if (channel === "setModel") { await reply.promise; authoritative = chosen; return { ok: true }; }
    if (channel === "submit") submits.push(params);
    return base(channel, authoritative);
  });
  const choosing = store.getState().setModel(chosen);
  await warmProject(store.setState, store.getState, "/p");
  expect(store.getState().model).toEqual(initial);
  reply.resolve({ ok: true }); await choosing;
  await nextSubmit(store, submits, chosen);
});

test("a rejected model after re-entry reports failure without rolling back the new projection", async () => {
  const store = fixture(), reply = deferred();
  stubInvoke(async channel => channel === "setModel" ? reply.promise : base(channel, newer));
  const choosing = store.getState().setModel(chosen);
  await store.getState().selectChat("b"); await store.getState().selectChat("a");
  reply.resolve({ ok: false, error: "model refused" }); await choosing;
  expect(store.getState().model).toEqual(newer);
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  expect(store.getState().conversations.a.error).toBe("model refused");
});

test("a successful levels retry preserves an unrelated conversation error", async () => {
  const store = fixture();
  stubInvoke(async channel => channel === "getThinkingLevels" ? { levels: [], error: "levels failed" } : base(channel));
  await store.getState().setModel(chosen);
  store.getState().onPiError("/p", "unrelated failure", "a");
  stubInvoke(async channel => base(channel));
  await store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a.error).toBe("unrelated failure");
});

test("a typed levels error never exposes even a populated partial result", async () => {
  const store = fixture();
  stubInvoke(async channel => channel === "getThinkingLevels" ? { levels: ["max"], error: "incomplete levels" } : base(channel));
  await store.getState().setModel(chosen);
  expect(store.getState().model).toEqual(chosen);
  expect(store.getState().thinkingLevels).toEqual([]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBe("incomplete levels");
});

for (const levelsFirst of [false, true]) for (const retryFails of [false, true]) {
  test(`levels retry ${levelsFirst ? "before" : "after"} reconciliation ${retryFails ? "fails" : "succeeds"} without losing the accepted model on submit`, async () => {
    const store = fixture(), ack = deferred(), state = deferred(), levels = deferred(), submits: any[] = [];
    let authoritative = initial, reconciling = false, stateReads = 0;
    stubInvoke(async (channel, params: any) => {
      if (channel === "setModel") { await ack.promise; authoritative = chosen; return { ok: true }; }
      if (channel === "getState" && reconciling) { stateReads++; return state.promise; }
      if (channel === "getThinkingLevels" && params.sessionFile === "a") {
        if (authoritative === initial) return { levels: [], error: "reentry levels failed" };
        return levels.promise;
      }
      if (channel === "submit") submits.push(params);
      return base(channel, authoritative);
    });
    const choosing = store.getState().setModel(chosen);
    await store.getState().selectChat("b"); await store.getState().selectChat("a");
    expect(store.getState().thinkingLevelsError).toBe("reentry levels failed");
    reconciling = true; ack.resolve({ ok: true }); await tick();
    const retrying = store.getState().refreshThinkingLevels();
    const finishLevels = async () => {
      levels.resolve(retryFails ? { levels: ["max"], error: "retry failed" } : { levels: ["off", "high"] });
      await retrying;
    };
    if (levelsFirst) await finishLevels();
    state.resolve(base("getState", chosen)); await choosing;
    if (!levelsFirst) {
      expect(store.getState().thinkingLevelsLoading).toBe(true);
      await finishLevels();
    }
    expect(stateReads).toBe(1);
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    expect(store.getState().thinkingLevels).toEqual(retryFails ? [] : ["off", "high"]);
    expect(store.getState().thinkingLevelsError).toBe(retryFails ? "retry failed" : undefined);
    await nextSubmit(store, submits, chosen);
  });
}

for (const thrown of [false, true]) for (const oldLevelsFirst of [false, true]) {
  test(`superseding state ${thrown ? "throw" : "typed failure"}, old levels ${oldLevelsFirst ? "first" : "last"}, settles and requires authoritative recovery`, async () => {
    const store = fixture(), oldLevels = deferred(), state = deferred(), recovery = deferred(), submits: any[] = [];
    let stateReads = 0, levelReads = 0;
    stubInvoke(async (channel, params) => {
      if (channel === "getThinkingLevels") return ++levelReads === 1 ? oldLevels.promise : { levels: ["off", "high"] };
      if (channel === "getState") {
        stateReads++;
        if (stateReads === 1) { await state.promise; if (thrown) throw new Error("state unavailable"); return { error: "state unavailable" }; }
        if (stateReads === 2) return { error: "recovery unavailable" };
        return recovery.promise;
      }
      if (channel === "submit") submits.push(params);
      return base(channel);
    });
    const choosing = store.getState().setModel(chosen); await tick();
    const warming = warmProject(store.setState, store.getState, "/p").catch(error => error);
    if (oldLevelsFirst) { oldLevels.resolve({ levels: ["max"] }); await choosing; }
    state.resolve({}); expect((await warming).message).toBe("state unavailable");
    if (!oldLevelsFirst) { oldLevels.resolve({ levels: ["max"] }); await choosing; }
    expect(store.getState().model).toEqual(chosen);
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    expect(store.getState().thinkingLevels).toEqual([]);
    expect(store.getState().thinkingLevelsError).toBe("state unavailable");
    await store.getState().refreshThinkingLevels();
    expect(store.getState().thinkingLevelsError).toBe("recovery unavailable");
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    const retrying = store.getState().refreshThinkingLevels();
    expect(store.getState().thinkingLevelsLoading).toBe(true);
    expect(store.getState().thinkingLevelsError).toBeUndefined();
    expect(store.getState().conversations.a.error).toBeUndefined();
    recovery.resolve(base("getState", newer)); await retrying;
    expect(stateReads).toBe(3); expect(levelReads).toBe(2);
    expect(store.getState().model).toEqual(newer);
    expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
    expect(store.getState().thinkingLevelsLoading).toBe(false);
    expect(store.getState().thinkingLevelsError).toBeUndefined();
    await nextSubmit(store, submits, newer);
  });
}

for (const stateRecovery of [false, true]) test(`a new mutation supersedes a pending ${stateRecovery ? "authoritative recovery" : "levels retry"}`, async () => {
  const store = fixture(), old = deferred(), submits: any[] = [];
  let stateReads = 0, levelReads = 0;
  stubInvoke(async (channel, params) => {
    if (channel === "getState" && stateRecovery) return ++stateReads === 1 ? { error: "state failed" } : old.promise;
    if (channel === "getThinkingLevels") return ++levelReads === 1 && !stateRecovery ? old.promise : { levels: ["off", "high"] };
    if (channel === "submit") submits.push(params);
    return base(channel);
  });
  if (stateRecovery) await warmProject(store.setState, store.getState, "/p").catch(() => {});
  const retrying = store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsLoading).toBe(true);
  await store.getState().setModel(newer);
  old.resolve(stateRecovery ? { error: "obsolete state failure" } : { levels: ["max"], error: "obsolete levels failure" });
  await retrying;
  expect(store.getState().model).toEqual(newer);
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a?.error).toBeUndefined();
  await nextSubmit(store, submits, newer);
});

for (const order of ["before", "during"] as const) for (const sameText of [false, true]) {
  test(`failed levels retry preserves ${sameText ? "same-text" : "different-text"} send failure ${order} retry, through recovery`, async () => {
    const store = fixture(), retry = deferred(); let reads = 0;
    const sendError = sameText ? "shared failure" : "send offline";
    stubInvoke(async channel => {
      if (channel === "getThinkingLevels") {
        reads++;
        if (reads === 1) return { levels: [], error: "shared failure" };
        if (reads === 2) return retry.promise;
        return { levels: ["off", "high"] };
      }
      if (channel === "submit") return { ok: false, error: sendError };
      return base(channel);
    });
    await store.getState().setModel(chosen);
    const failSend = async () => { store.getState().setDraft("preserve"); await store.getState().send(); };
    if (order === "before") await failSend();
    const retrying = store.getState().refreshThinkingLevels();
    if (order === "during") await failSend();
    expect(store.getState().conversations.a.error).toBe(sendError);
    expect(store.getState().conversations.a.errorRecovery).toBe("retrySend");
    expect(store.getState().conversations.a.modelControlError).toBeUndefined();
    retry.resolve({ levels: ["max"], error: "shared failure" }); await retrying;
    expect(store.getState().thinkingLevelsError).toBe("shared failure");
    expect(store.getState().conversations.a.error).toBe(sendError);
    await store.getState().refreshThinkingLevels();
    expect(store.getState().thinkingLevelsError).toBeUndefined();
    expect(store.getState().conversations.a.error).toBe(sendError);
    expect(store.getState().conversations.a.errorRecovery).toBe("retrySend");
    expect(store.getState().drafts.a).toBe("preserve");
    expect(store.getState().conversations.a.pending).toEqual([]);
  });
}

for (const stateRecovery of [false, true]) test(`${stateRecovery ? "state" : "levels"} recovery preserves a same-text Pi error without a send recovery marker`, async () => {
  const store = fixture(); let fail = true;
  stubInvoke(async channel => {
    if (fail && channel === (stateRecovery ? "getState" : "getThinkingLevels")) return stateRecovery ? { error: "same text" } : { levels: [], error: "same text" };
    return base(channel, chosen);
  });
  if (stateRecovery) await warmProject(store.setState, store.getState, "/p").catch(() => {});
  else await store.getState().setModel(chosen);
  expect(store.getState().conversations.a.modelControlError).toBeDefined();
  store.getState().onPiError("/p", "same text", "a");
  // This external failure has its own recovery; it must survive either reader.
  expect(store.getState().conversations.a.modelControlError).toBeUndefined();
  fail = false; await store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a.error).toBe("same text");
  expect(store.getState().conversations.a.errorRecovery).toBe("restartPi");
});

test("levels error ownership survives unrelated conversation updates and releases on clear/retry", async () => {
  const store = fixture(); let fail = true;
  stubInvoke(async channel => channel === "getThinkingLevels" && fail ? { levels: [], error: "owned levels" } : base(channel));
  await store.getState().setModel(chosen);
  store.getState().onEvent({ projectDir: "/p", sessionFile: "a", event: { type: "agent_settled", aborted: false } });
  expect(store.getState().conversations.a.modelControlError).toBeDefined();
  fail = false; await store.getState().refreshThinkingLevels();
  expect(store.getState().conversations.a.error).toBeUndefined();
  expect(store.getState().conversations.a.modelControlError).toBeUndefined();
  fail = true; await store.getState().refreshThinkingLevels();
  store.getState().clearError();
  expect(store.getState().conversations.a.modelControlError).toBeUndefined();
  expect(store.getState().thinkingLevelsError).toBe("owned levels");
  fail = false; await store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsError).toBeUndefined();
});

for (const departure of ["navigation", "project restart", "global restart"] as const) test(`state recovery after ${departure} cannot erase the new view's failure`, async () => {
  const store = fixture(), old = deferred(); let stateReads = 0;
  stubInvoke(async channel => {
    if (channel === "getState") {
      stateReads++;
      if (stateReads === 1) return { error: "original state failure" };
      if (stateReads === 2) return old.promise;
      return base(channel, newer);
    }
    if (channel === "getThinkingLevels") return { levels: [], error: "new levels failure" };
    return base(channel, newer);
  });
  await warmProject(store.setState, store.getState, "/p").catch(() => {});
  const retrying = store.getState().refreshThinkingLevels();
  if (departure === "navigation") await store.getState().selectChat("b");
  else if (departure === "project restart") await store.getState().restartPi("/p");
  else await store.getState().restartAllPi();
  old.resolve({ error: "obsolete recovery failure" }); await retrying;
  expect(store.getState().model).toEqual(newer);
  expect(store.getState().thinkingLevels).toEqual([]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBe("new levels failure");
  expect(store.getState().conversations[store.getState().activeSessionFile!].error).toBe("new levels failure");
});

test("a state recovery followed by levels failure retries only levels next time", async () => {
  const store = fixture(); let states = 0, levels = 0;
  stubInvoke(async channel => {
    if (channel === "getState") return ++states === 1 ? { error: "state failed" } : base(channel, chosen);
    if (channel === "getThinkingLevels") return ++levels === 1 ? { levels: ["max"], error: "levels failed" } : { levels: ["off", "high"] };
    return base(channel);
  });
  store.setState({ model: undefined });
  await warmProject(store.setState, store.getState, "/p").catch(() => {});
  await store.getState().refreshThinkingLevels();
  expect(store.getState().model).toEqual(chosen);
  expect(store.getState().thinkingLevelsError).toBe("levels failed");
  await store.getState().refreshThinkingLevels();
  expect(states).toBe(2); expect(levels).toBe(2);
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
});

for (const order of ["before", "during"] as const) test(`failed state recovery preserves send failure ${order} retry through successful state recovery`, async () => {
  const store = fixture(), read = deferred(); let states = 0;
  stubInvoke(async channel => {
    if (channel === "getState") {
      states++;
      if (states === 1) return { error: "shared failure" };
      return states === 2 ? read.promise : base(channel, newer);
    }
    if (channel === "submit") return { ok: false, error: "shared failure" };
    return base(channel);
  });
  await warmProject(store.setState, store.getState, "/p").catch(() => {});
  const failSend = async () => { store.getState().setDraft("preserve"); await store.getState().send(); };
  if (order === "before") await failSend();
  const retrying = store.getState().refreshThinkingLevels();
  if (order === "during") await failSend();
  read.resolve({ error: "shared failure" }); await retrying;
  expect(store.getState().thinkingLevelsError).toBe("shared failure");
  expect(store.getState().conversations.a.modelControlError).toBeUndefined();
  await store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().model).toEqual(newer);
  expect(store.getState().conversations.a.error).toBe("shared failure");
  expect(store.getState().conversations.a.errorRecovery).toBe("retrySend");
  expect(store.getState().drafts.a).toBe("preserve");
});

for (const global of [false, true]) test(`failed authoritative warm after ${global ? "global" : "project"} restart keeps reader ownership for recovery`, async () => {
  const store = fixture(); let fail = true;
  stubInvoke(async channel => channel === "getState" && fail ? { error: "restart state unavailable" } : base(channel, newer));
  if (global) await store.getState().restartAllPi().catch(() => {}); else await store.getState().restartPi("/p");
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBe("restart state unavailable");
  expect(store.getState().conversations.a.modelControlError).toBe(true);
  fail = false; await store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a.error).toBeUndefined();
  expect(store.getState().model).toEqual(newer);
});

test("failed restart takes banner ownership even when its text equals a prior levels failure", async () => {
  const store = fixture(); let fail = true;
  stubInvoke(async channel => {
    if (channel === "getThinkingLevels" && fail) return { levels: [], error: "Pi could not restart. Try again." };
    if (channel === "restartPi") return { ok: false };
    return base(channel);
  });
  await store.getState().setModel(chosen);
  await store.getState().restartPi("/p");
  expect(store.getState().conversations.a.modelControlError).toBeUndefined();
  fail = false; await store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a.error).toBe("Pi could not restart. Try again.");
});

test("empty authoritative state is a recoverable failure without clearing existing model/levels projection", async () => {
  const store = fixture(); let fail = true;
  stubInvoke(async channel => channel === "getState" && fail ? {} : base(channel, chosen));
  await warmProject(store.setState, store.getState, "/p").catch(() => {});
  expect(store.getState().model).toEqual(initial);
  expect(store.getState().thinkingLevels).toEqual(["off", "max"]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBe("Pi could not read the current model.");
  fail = false; await store.getState().refreshThinkingLevels();
  expect(store.getState().model).toEqual(chosen);
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
});

test("reconciliation retains its mutation gate until state settles; a later mutation retires the independently pending retry", async () => {
  const store = fixture(), ack = deferred(), state = deferred(), retry = deferred(), submits: any[] = [], writes: string[] = [];
  let authoritative = initial, reconciling = false;
  stubInvoke(async (channel, params: any) => {
    if (channel === "setModel") {
      writes.push(params.modelId);
      if (params.modelId === "chosen") await ack.promise;
      authoritative = params.modelId === "chosen" ? chosen : newer;
      return { ok: true };
    }
    if (channel === "getState" && reconciling) return state.promise;
    if (channel === "getThinkingLevels" && params.sessionFile === "a") {
      if (authoritative === initial) return { levels: [], error: "reentry levels failed" };
      if (authoritative === chosen) return retry.promise;
    }
    if (channel === "submit") submits.push(params);
    return base(channel, authoritative);
  });
  const choosing = store.getState().setModel(chosen);
  await store.getState().selectChat("b"); await store.getState().selectChat("a");
  reconciling = true; ack.resolve({}); await tick();
  const retrying = store.getState().refreshThinkingLevels();
  await store.getState().setModel(newer);
  expect(writes).toEqual(["chosen"]);
  state.resolve(base("getState", chosen)); await choosing;
  expect(store.getState().thinkingLevelsLoading).toBe(true);
  await store.getState().setModel(newer);
  expect(writes).toEqual(["chosen", "newer"]);
  retry.resolve({ levels: ["max"], error: "obsolete retry" }); await retrying;
  expect(store.getState().thinkingLevels).toEqual(["off", "high"]);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  await nextSubmit(store, submits, newer);
});

test("a thrown levels retry cannot replace or clear an unrelated send failure", async () => {
  const store = fixture(); let reads = 0;
  stubInvoke(async channel => {
    if (channel === "getThinkingLevels") {
      reads++;
      if (reads === 1) return { levels: [], error: "levels failed" };
      if (reads === 2) throw new Error("shared failure");
      return { levels: ["off", "high"] };
    }
    if (channel === "submit") return { ok: false, error: "shared failure" };
    return base(channel);
  });
  await store.getState().setModel(chosen);
  store.getState().setDraft("preserve"); await store.getState().send();
  await store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBe("shared failure");
  expect(store.getState().conversations.a.error).toBe("shared failure");
  await store.getState().refreshThinkingLevels();
  expect(store.getState().thinkingLevelsError).toBeUndefined();
  expect(store.getState().conversations.a.error).toBe("shared failure");
  expect(store.getState().conversations.a.errorRecovery).toBe("retrySend");
});

for (const stateRecovery of [false, true]) test(`a rejected mutation during ${stateRecovery ? "state recovery" : "levels retry"} cannot restore an unowned loading flag`, async () => {
  const store = fixture(), old = deferred(); let states = 0, levels = 0;
  stubInvoke(async channel => {
    if (channel === "setModel") return { ok: false, error: "model refused" };
    if (channel === "getState") {
      if (stateRecovery) {
        states++;
        if (states === 1) return { error: "state failed" };
        if (states === 2) return old.promise;
      }
      return base(channel, chosen);
    }
    if (channel === "getThinkingLevels" && !stateRecovery && ++levels === 1) return old.promise;
    return base(channel);
  });
  if (stateRecovery) await warmProject(store.setState, store.getState, "/p").catch(() => {});
  const retrying = store.getState().refreshThinkingLevels();
  await store.getState().setModel(newer);
  old.resolve(stateRecovery ? base("getState", newer) : { levels: ["max"] }); await retrying;
  expect(store.getState().model).toEqual(initial);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBe("model refused");
  expect(store.getState().thinkingLevels).toEqual([]);
  await store.getState().refreshThinkingLevels();
  expect(store.getState().model).toEqual(chosen);
  expect(store.getState().thinkingLevelsLoading).toBe(false);
  expect(store.getState().thinkingLevelsError).toBeUndefined();
});
