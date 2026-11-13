import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { runtime } from "../lib/store/internals.ts";

const domTest = test.skipIf(typeof document === "undefined");
if (typeof document !== "undefined") {
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
}
let root: Root | undefined;
let container: HTMLDivElement | undefined;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function button(text: string) {
  const found = [...document.querySelectorAll("button")].find(node => node.textContent?.includes(text));
  expect(found).toBeDefined();
  return found!;
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = undefined;
});

for (const thrown of [false, true]) domTest(`the real picker settles a ${thrown ? "thrown" : "typed"} levels failure and retries without losing the selected model`, async () => {
  const { useAppStore } = await import("../lib/store.ts");
  const { default: ModelSelector } = await import("./ModelSelector.tsx");
  const original = useAppStore.getState();
  const initial = { provider: "p", id: "initial", name: "Initial" };
  const chosen = { provider: "p", id: "chosen", name: "Chosen" };
  const failed = deferred<{ levels: string[]; error?: string }>();
  const retry = deferred<{ levels: string[] }>();
  const writes: unknown[] = [];
  let reads = 0;
  stubInvoke(async (channel, params) => {
    if (channel === "setModel") { writes.push(params); return { ok: true }; }
    if (channel === "getThinkingLevels") return ++reads === 1 ? failed.promise : retry.promise;
    return {};
  });
  useAppStore.setState({ activeProjectPath: "/p", activeSessionFile: "a", models: [initial, chosen], model: initial,
    providers: [], providersLoaded: true, thinkingLevel: "off", thinkingLevels: ["off", "max"],
    thinkingLevelsLoading: false, thinkingLevelsError: undefined, conversations: {} });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  try {
    await act(async () => { root!.render(<ModelSelector />); });
    await act(async () => { container!.querySelector("button")!.click(); });
    expect(document.querySelector('[role="combobox"][aria-label="Reasoning effort"]')).not.toBeNull();
    await act(async () => { button("Chosen").click(); });
    expect(document.body.textContent).toContain("Loading this model’s levels");
    expect(document.querySelector('[role="combobox"][aria-label="Reasoning effort"]')).toBeNull();
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Chosen");
    await act(async () => {
      if (thrown) failed.reject(new Error("levels unavailable"));
      else failed.resolve({ levels: [], error: "levels unavailable" });
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("levels unavailable");
    expect(document.body.textContent).not.toContain("Loading this model’s levels");
    expect(document.querySelector('[role="combobox"][aria-label="Reasoning effort"]')).toBeNull();
    expect(useAppStore.getState().model).toEqual(chosen);
    await act(async () => { button("Retry levels").click(); });
    expect(document.body.textContent).toContain("Loading this model’s levels");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(writes).toHaveLength(1);
    await act(async () => { retry.resolve({ levels: ["off", "high"] }); });
    await expectReasoningOptions(["Off", "High"]);
    expect(document.body.textContent).not.toContain("Loading this model’s levels");
    expect(document.body.textContent).not.toContain("Retry levels");
    expect(useAppStore.getState().thinkingLevels).toEqual(["off", "high"]);
    expect(useAppStore.getState().model).toEqual(chosen);
    expect(container.textContent).toContain("Chosen");
    expect(writes).toHaveLength(1);
  } finally {
    await act(async () => { root!.unmount(); }); root = undefined;
    const owner = runtime(useAppStore.getState);
    clearTimeout(owner.saveTimer);
    for (const timer of owner.draftReports.values()) clearTimeout(timer);
    useAppStore.setState(original);
  }
});

domTest("the picker presents a successful empty levels reply as settled", async () => {
  const { useAppStore } = await import("../lib/store.ts");
  const { default: ModelSelector } = await import("./ModelSelector.tsx");
  const original = useAppStore.getState();
  const model = { provider: "p", id: "chosen", name: "Chosen" };
  stubInvoke(async channel => channel === "getThinkingLevels" ? { levels: [] } : { ok: true });
  useAppStore.setState({ activeProjectPath: "/p", activeSessionFile: "a", models: [model], model,
    providers: [], providersLoaded: true, thinkingLevels: ["off"], thinkingLevelsLoading: false,
    thinkingLevelsError: undefined });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  try {
    await act(async () => { root!.render(<ModelSelector />); });
    await act(async () => { container!.querySelector("button")!.click(); });
    await act(async () => { await useAppStore.getState().refreshThinkingLevels(); });
    expect(document.body.textContent).toContain("No reasoning levels available.");
    expect(document.body.textContent).not.toContain("Loading this model’s levels");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="combobox"][aria-label="Reasoning effort"]')).toBeNull();
  } finally {
    await act(async () => { root!.unmount(); }); root = undefined;
    useAppStore.setState(original);
  }
});

const initialModel = { provider: "p", id: "initial", name: "Initial" };
const chosenModel = { provider: "p", id: "chosen", name: "Chosen" };
const newerModel = { provider: "p", id: "newer", name: "Newer" };
function pickerReply(channel: string, model = initialModel): any {
  if (channel === "getState") return { state: { model, thinkingLevel: "off", isStreaming: false, isCompacting: false } };
  if (channel === "getModels") return { models: [initialModel, chosenModel, newerModel] };
  if (channel === "getThinkingLevels") return { levels: ["off", "high"] };
  if (channel === "getSessionProviders") return { providers: [] };
  if (channel === "loadGraphicalExtensions") return { extensions: [] };
  if (channel === "readSessionSnapshot") return { consistency: "stable", entries: [], eventWatermark: 0 };
  return { ok: true, sessionFile: "a" };
}
async function withPicker(run: (store: typeof import("../lib/store.ts").useAppStore) => Promise<void>) {
  const { useAppStore } = await import("../lib/store.ts");
  const { default: ModelSelector } = await import("./ModelSelector.tsx");
  const original = useAppStore.getState();
  useAppStore.setState({ activeProjectPath: "/p", activeSessionFile: "a", model: initialModel,
    models: [initialModel, chosenModel, newerModel], providers: [], providersLoaded: true,
    thinkingLevel: "off", thinkingLevelReady: true, thinkingLevels: ["off", "high"],
    thinkingLevelsLoading: false, thinkingLevelsError: undefined, conversations: {}, drafts: {},
    trust: { required: true, trusted: true } });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  try {
    await act(async () => { root!.render(<ModelSelector />); });
    await act(async () => { container!.querySelector("button")!.click(); });
    await run(useAppStore);
  } finally {
    await act(async () => { root!.unmount(); }); root = undefined;
    const owner = runtime(useAppStore.getState);
    clearTimeout(owner.saveTimer);
    for (const timer of owner.draftReports.values()) clearTimeout(timer);
    useAppStore.setState(original);
  }
}

for (const levelsFirst of [false, true]) domTest(`actual Retry levels finishes ${levelsFirst ? "before" : "after"} state reconciliation and next send keeps the chosen row`, async () => {
  const ack = deferred<unknown>(), state = deferred<unknown>(), levels = deferred<unknown>(), submits: any[] = [];
  let authoritative = initialModel, reconciling = false;
  stubInvoke(async (channel, params: any) => {
    if (channel === "setModel") { await ack.promise; authoritative = chosenModel; return { ok: true }; }
    if (channel === "getState" && reconciling) return state.promise;
    if (channel === "getThinkingLevels" && params.sessionFile === "a") return authoritative === initialModel
      ? { levels: [], error: "reentry levels failed" } : levels.promise;
    if (channel === "submit") submits.push(params);
    return pickerReply(channel, authoritative);
  });
  await withPicker(async store => {
    await act(async () => { button("Chosen").click(); });
    await act(async () => { await store.getState().selectChat("b"); await store.getState().selectChat("a"); });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("reentry levels failed");
    reconciling = true; await act(async () => { ack.resolve({}); });
    await act(async () => { button("Retry levels").click(); });
    if (levelsFirst) await act(async () => { levels.resolve({ levels: ["off", "high"] }); });
    await act(async () => { state.resolve(pickerReply("getState", chosenModel)); });
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Chosen");
    if (!levelsFirst) {
      expect(document.body.textContent).toContain("Loading this model’s levels");
      await act(async () => { levels.resolve({ levels: ["off", "high"] }); });
    }
    await expectReasoningOptions(["Off", "High"]);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await act(async () => { store.getState().setDraft("next"); await store.getState().send(); });
    expect(submits.at(-1).model).toEqual({ provider: "p", id: "chosen" });
  });
});

for (const thrown of [false, true]) domTest(`actual picker settles superseding state ${thrown ? "throw" : "failure"} and retries state until recovery`, async () => {
  const oldLevels = deferred<unknown>(), recovery = deferred<unknown>(), submits: any[] = [];
  let stateReads = 0, levelReads = 0, choosing: Promise<void>;
  stubInvoke(async (channel, params) => {
    if (channel === "getState") {
      stateReads++;
      if (stateReads === 1) { if (thrown) throw new Error("state unavailable"); return { error: "state unavailable" }; }
      if (stateReads === 2) return { error: "recovery unavailable" };
      return recovery.promise;
    }
    if (channel === "getThinkingLevels") return ++levelReads === 1 ? oldLevels.promise : { levels: ["off", "high"] };
    if (channel === "submit") submits.push(params);
    return pickerReply(channel);
  });
  await withPicker(async store => {
    const { warmProject } = await import("../lib/store/internals.ts");
    await act(async () => { choosing = store.getState().setModel(chosenModel); });
    await act(async () => { await warmProject(store.setState, store.getState, "/p").catch(() => {}); });
    await act(async () => { oldLevels.resolve({ levels: ["max"] }); await choosing; });
    expect(document.body.textContent).not.toContain("Loading this model’s levels");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("state unavailable");
    expect(document.querySelector('[role="combobox"][aria-label="Reasoning effort"]')).toBeNull();
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Chosen");
    await act(async () => { button("Retry levels").click(); });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("recovery unavailable");
    await act(async () => { button("Retry levels").click(); });
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).toContain("Loading this model’s levels");
    await act(async () => { recovery.resolve(pickerReply("getState", newerModel)); });
    expect(stateReads).toBe(3); expect(levelReads).toBe(2);
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Newer");
    await expectReasoningOptions(["Off", "High"]);
    await act(async () => { store.getState().setDraft("next"); await store.getState().send(); });
    expect(submits.at(-1).model).toEqual({ provider: "p", id: "newer" });
  });
});

for (const order of ["before", "during"] as const) domTest(`actual picker failed retry preserves a same-text send banner ${order} retry and after recovery`, async () => {
  const retry = deferred<unknown>(); let levels = 0;
  stubInvoke(async channel => {
    if (channel === "getThinkingLevels") {
      if (++levels === 1) return { levels: [], error: "shared failure" };
      return levels === 2 ? retry.promise : { levels: ["off", "high"] };
    }
    if (channel === "submit") return { ok: false, error: "shared failure" };
    return pickerReply(channel);
  });
  await withPicker(async store => {
    await act(async () => { button("Chosen").click(); });
    const failSend = async () => { await act(async () => { store.getState().setDraft("preserve"); await store.getState().send(); }); };
    if (order === "before") await failSend();
    await act(async () => { button("Retry levels").click(); });
    if (order === "during") await failSend();
    expect(store.getState().conversations.a.error).toBe("shared failure");
    await act(async () => { retry.resolve({ levels: ["max"], error: "shared failure" }); });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("shared failure");
    expect(store.getState().conversations.a.errorRecovery).toBe("retrySend");
    await act(async () => { button("Retry levels").click(); });
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await expectReasoningOptions(["Off", "High"]);
    expect(store.getState().drafts.a).toBe("preserve");
    expect(store.getState().conversations.a.error).toBe("shared failure");
    expect(store.getState().conversations.a.errorRecovery).toBe("retrySend");
  });
});

for (const failure of [false, true]) domTest(`cold promotion exposes bound Retry; bound state ${failure ? "failure stays retryable" : "success projects the model"}`, async () => {
  const cold = deferred<unknown>(), bound = deferred<unknown>(), submits: any[] = [], targets: unknown[] = [];
  let reads = 0;
  stubInvoke(async (channel, params: any) => {
    if (channel === "getState") {
      targets.push(params.sessionFile);
      if (++reads === 1) return { error: "state unavailable" };
      if (reads === 2) return cold.promise;
      if (reads === 3) return bound.promise;
      return pickerReply(channel, newerModel);
    }
    if (channel === "submit") { submits.push(params); return { ok: true, sessionFile: "bound" }; }
    return pickerReply(channel);
  });
  await withPicker(async store => {
    const { readModelState } = await import("../lib/store/internals.ts");
    await act(async () => {
      store.setState({ activeSessionFile: null });
      await readModelState(store.setState, store.getState, "/p").catch(() => {});
    });
    await act(async () => { button("Retry levels").click(); });
    expect(document.body.textContent).toContain("Loading this model’s levels");
    await act(async () => { store.getState().setDraft("first"); await store.getState().send(); });
    expect(store.getState().activeSessionFile).toBe("bound");
    expect(document.body.textContent).not.toContain("Loading this model’s levels");
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => { button("Retry levels").click(); });
    expect(targets).toEqual([null, null, "bound"]);
    expect(document.body.textContent).toContain("Loading this model’s levels");
    await act(async () => { cold.resolve(pickerReply("getState", chosenModel)); });
    expect(document.body.textContent).toContain("Loading this model’s levels");
    expect(store.getState().model).toEqual(initialModel);
    await act(async () => { bound.resolve(failure ? { error: "bound state unavailable" } : pickerReply("getState", newerModel)); });
    expect(document.body.textContent).not.toContain("Loading this model’s levels");
    if (failure) {
      expect(document.querySelector('[role="alert"]')?.textContent).toBe("bound state unavailable");
      await act(async () => { button("Retry levels").click(); });
    }
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Newer");
    expect(document.querySelector('[role="combobox"][aria-label="Reasoning effort"]')).not.toBeNull();
    await act(async () => { store.getState().setDraft("next"); await store.getState().send(); });
    expect(submits.at(-1).model).toEqual({ provider: "p", id: "newer" });
  });
});

for (const global of [false, true]) domTest(`failed ${global ? "global" : "project"} restart settles the picker and its Retry reads state without erasing the restart banner`, async () => {
  const old = deferred<unknown>(), state = deferred<unknown>(), submits: any[] = [];
  let levels = 0, states = 0;
  stubInvoke(async (channel, params) => {
    if (channel === "getThinkingLevels" && ++levels === 1) return old.promise;
    if (channel === "getState") { ++states; return state.promise; }
    if (channel === "restartPi" || channel === "restartAllPi") return { ok: false };
    if (channel === "submit") submits.push(params);
    return pickerReply(channel);
  });
  await withPicker(async store => {
    let reading!: Promise<void>;
    await act(async () => { reading = store.getState().refreshThinkingLevels(); });
    expect(document.body.textContent).toContain("Loading this model’s levels");
    await act(async () => {
      if (global) await store.getState().restartAllPi().catch(() => {});
      else await store.getState().restartPi("/p");
    });
    expect(document.body.textContent).not.toContain("Loading this model’s levels");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Pi could not restart. Try again.");
    await act(async () => { button("Retry levels").click(); });
    expect(states).toBe(1);
    await act(async () => { old.resolve({ levels: ["max"] }); await reading; });
    expect(document.body.textContent).toContain("Loading this model’s levels");
    await act(async () => { state.resolve(pickerReply("getState", newerModel)); });
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Newer");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(store.getState().conversations.a.error).toBe("Pi could not restart. Try again.");
    expect(store.getState().conversations.a.errorRecovery).toBe("restartPi");
    await act(async () => { store.getState().setDraft("next"); await store.getState().send(); });
    expect(submits.at(-1).model).toEqual({ provider: "p", id: "newer" });
  });
});


async function chooseOption(label: string, option: string) {
  await act(async () => { document.querySelector<HTMLButtonElement>(`[role="combobox"][aria-label="${label}"]`)!.click(); });
  const item = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent?.trim() === option);
  expect(item).toBeDefined();
  await act(async () => { item!.click(); });
}

async function expectReasoningOptions(labels: string[]) {
  const trigger = document.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="Reasoning effort"]');
  expect(trigger).not.toBeNull();
  await act(async () => { trigger!.click(); });
  expect([...document.querySelectorAll('[role="option"]')].map(node => node.textContent?.trim())).toEqual(labels);
  const selected = document.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
  expect(selected).not.toBeNull();
  await act(async () => { selected!.click(); });
}

domTest("provider and favorites filters preserve search and reasoning choices update Pi", async () => {
  stubInvoke(async channel => pickerReply(channel));
  await withPicker(async store => {
    const a = { provider: "alpha", id: "one", name: "Alpha model" };
    const b = { provider: "beta", id: "two", name: "Beta model" };
    const selected: string[] = [];
    await act(async () => { store.setState({ models: [a, b], model: a, providers: [], favoriteModels: ["beta/two"], thinkingLevels: ["off", "high"], thinkingLevel: "off", setThinkingLevel: async level => { selected.push(level); } }); });
    await chooseFilter("alpha");
    expect(document.querySelector('[data-selected-model]')?.textContent).toContain("Alpha model");
    expect(document.body.textContent).not.toContain("Beta model");
    await chooseFilter("All models");
    expect(document.body.textContent).toContain("Beta model");
    await chooseOption("Reasoning effort", "High");
    expect(selected).toEqual(["high"]);
    const search = document.querySelector<HTMLInputElement>('[aria-label="Search models"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Beta");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.querySelector("[data-selected-model]")).toBeNull();
    await chooseFilter("alpha");
    expect(search.value).toBe("Beta");
    expect(document.body.textContent).toContain("No models match");
    await chooseFilter("Favorites");
    expect(document.body.textContent).toContain("Beta model");
    expect(document.querySelector("[data-selected-model]")).toBeNull();
  });
});

async function chooseFilter(label: string) {
  const filter = [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Filter models"] button')]
    .find(node => node.textContent?.trim() === label);
  expect(filter).toBeDefined();
  await act(async () => { filter!.click(); });
}

domTest("favorites lead without duplicate rows and search supports provider and model terms in any order", async () => {
  stubInvoke(async channel => pickerReply(channel));
  await withPicker(async store => {
    const a = { provider: "alpha", id: "one", name: "Alpha model", contextWindow: 200000 };
    const b = { provider: "beta", id: "two", name: "Beta model" };
    await act(async () => {
      store.setState({ models: [a, b], model: a, providers: [], favoriteModels: ["beta/two"] });
    });
    const choices = () => [...document.querySelectorAll<HTMLButtonElement>("[data-model-choice]")];
    expect(choices()).toHaveLength(2);
    expect(choices()[0]!.textContent).toContain("Beta model");
    expect(choices()[1]!.textContent).toContain("200K context");
    const search = document.querySelector<HTMLInputElement>('[aria-label="Search models"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "one alpha");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(choices()).toHaveLength(1);
    expect(choices()[0]!.textContent).toContain("Alpha model");
    await chooseFilter("Favorites");
    expect(choices()).toHaveLength(0);
    expect(search.value).toBe("one alpha");
  });
});

domTest("arrow keys move between search and model rows; activation selects through Pi", async () => {
  const writes: unknown[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "setModel") writes.push(params);
    return pickerReply(channel);
  });
  await withPicker(async store => {
    await act(async () => { store.setState({ favoriteModels: [] }); });
    const search = document.querySelector<HTMLInputElement>('[aria-label="Search models"]')!;
    const rows = [...document.querySelectorAll<HTMLButtonElement>("[data-model-choice]")];
    const key = async (target: HTMLElement, value: string) => {
      await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
    };
    search.focus();
    await key(search, "ArrowDown");
    expect(document.activeElement).toBe(rows[0]);
    await key(rows[0]!, "End");
    expect(document.activeElement).toBe(rows.at(-1)!);
    await key(rows.at(-1)!, "Home");
    expect(document.activeElement).toBe(rows[0]);
    await key(rows[0]!, "ArrowUp");
    expect(document.activeElement).toBe(search);
    await key(search, "ArrowUp");
    expect(document.activeElement).toBe(rows.at(-1)!);
    // Native buttons translate Enter to click in a browser; happy-dom does not.
    await act(async () => { rows.at(-1)!.click(); });
    expect(writes).toHaveLength(1);
    expect(store.getState().model?.id).toBe("newer");
    expect(document.querySelector('[aria-label="Reasoning effort"]')).not.toBeNull();
  });
});
