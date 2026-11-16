import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { rpc } from "../lib/rpc.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { PaneStoreContext, createPaneStore, releasePaneStore, focusPaneStore, primaryStore, useAppStore } from "../lib/store.ts";
import { remoteConnection } from "../lib/connection.ts";
import QuitDialog from "./QuitDialog.tsx";
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLElement;
const originalOn = rpc.events.on;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); rpc.events.on = originalOn; remoteConnection.setState({ phase: "connected" }, true); });
domTest("confirmed quit waits for the latest draft save and keeps the modal open on typed host failure", async () => {
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  let requested!: (payload: unknown) => void;
  rpc.events.on = ((channel: string, listener: (payload: unknown) => void) => { if (channel === "quitRequested") requested = listener; return () => {}; }) as typeof rpc.events.on;
  let saved!: (value: unknown) => void;
  const calls: [string, any][] = [];
  stubInvoke(async (c, p) => { calls.push([c, p]); return c === "saveState" ? new Promise(resolve => { saved = resolve; }) : { ok: false }; });
  useAppStore.setState({ ready: true, drafts: { session: "latest unsent text" } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<QuitDialog />));
  await act(async () => requested({ work: { runs: [], terminals: [], viewers: 1 } }));
  const quit = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Close NativePi"))!;
  expect(quit).toBeDefined();
  await act(async () => quit.click());
  expect(calls.map(([c]) => c)).toEqual(["saveState"]);
  expect(calls[0][1].state.drafts.session).toBe("latest unsent text");
  await act(async () => saved({ ok: true }));
  expect(calls.map(([c]) => c)).toEqual(["saveState", "confirmQuit"]);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.textContent).toContain("Could not close NativePi");
});


domTest("quit confirmation still opens after the shared shell switches pane stores", async () => {
  const first = createPaneStore(), second = createPaneStore();
  let requested!: (payload: unknown) => void;
  rpc.events.on = ((channel: string, listener: (payload: unknown) => void) => { if (channel === "quitRequested") requested = listener; return () => {}; }) as typeof rpc.events.on;
  stubInvoke(async () => ({ ok: true }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  try {
    focusPaneStore(first);
    await act(async () => root!.render(<PaneStoreContext value={first}><QuitDialog /></PaneStoreContext>));
    focusPaneStore(second);
    await act(async () => root!.render(<PaneStoreContext value={second}><QuitDialog /></PaneStoreContext>));
    await act(async () => requested({ work: { runs: [], terminals: [], viewers: 0, dirtyFiles: ["unsaved.ts"] } }));
    expect(document.body.textContent).toContain("Discard edits and quit");
    expect(document.body.textContent).toContain("unsaved.ts");
  } finally { releasePaneStore(first); releasePaneStore(second); focusPaneStore(primaryStore); }
});


domTest("a workspace command is named in the quit guard and can be kept running", async () => {
  let requested!: (payload: unknown) => void;
  const calls: string[] = [];
  rpc.events.on = ((channel: string, listener: (payload: unknown) => void) => { if (channel === "quitRequested") requested = listener; return () => {}; }) as typeof rpc.events.on;
  stubInvoke(async name => { calls.push(name); return { ok: true }; });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<QuitDialog />));
  await act(async () => requested({ work: { runs: [], terminals: [], commands: ["/project"], viewers: 0 } }));
  expect(document.body.textContent).toContain("Project commands are still running");
  await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Keep working")!.click());
  expect(calls).toEqual([]);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

domTest("explicitly discarding edits can close a client whose background host is unavailable", async () => {
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  let requested!: (payload: unknown) => void;
  rpc.events.on = ((channel: string, listener: (payload: unknown) => void) => { if (channel === "quitRequested") requested = listener; return () => {}; }) as typeof rpc.events.on;
  const calls: string[] = [];
  stubInvoke(async channel => { calls.push(channel); if (channel === "saveState") throw new Error("Host unavailable"); return { ok: true }; });
  remoteConnection.setState({ phase: "unavailable" }, true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<QuitDialog />));
  await act(async () => requested({ work: { runs: [], terminals: [], viewers: 0, dirtyFiles: ["unsaved.ts"] } }));
  expect(document.body.textContent).toContain("Closing may also discard chat drafts");
  const discard = [...document.querySelectorAll("button")].find(button => button.textContent === "Discard edits and quit")!;
  await act(async () => discard.click());
  expect(calls).toEqual(["confirmQuit"]);
});
