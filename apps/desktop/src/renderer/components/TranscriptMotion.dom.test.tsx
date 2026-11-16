import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import { emptyConversation } from "../lib/store/conversation.ts";
import Transcript from "./Transcript.tsx";

mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {} }));
Reflect.set(globalThis, "requestAnimationFrame", window.requestAnimationFrame.bind(window));
Reflect.set(globalThis, "cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; host?.remove();
});
async function mount() {
  stubInvoke(async () => ({}));
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "chat", extSurfaces: [], extRenderers: [],
    conversations: { chat: { ...emptyConversation(), running: true, runStartedAt: Date.now() - 1000 } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<Transcript />));
}
function stop() { return [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Stop")!; }
async function running(value: boolean) {
  await act(async () => useAppStore.setState(state => ({ conversations: {
    ...state.conversations, chat: { ...state.conversations.chat, running: value },
  } })));
}
test("completion disables Stop and a restarted run survives the previous completion timeout", async () => {
  await mount();

  expect(stop().closest("[inert]")).toBeNull();
  await running(false);
  expect(host.textContent).toContain("Response finished in");
  expect(stop().closest("[inert]")).not.toBeNull();
  await running(true);
  expect(host.textContent).not.toContain("Response finished in");
  expect(stop().closest("[inert]")).toBeNull();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2550)); });
  expect(host.textContent).not.toContain("Response finished in");
  expect(stop().closest('[aria-hidden="true"], [inert]')).toBeNull();
});
test("switching conversations never carries completion feedback into the destination", async () => {
  await mount();
  await running(false);
  expect(host.textContent).toContain("Response finished in");
  await act(async () => useAppStore.setState(state => ({ activeSessionFile: "other", conversations: {
    ...state.conversations, other: emptyConversation(),
  } })));
  expect(host.textContent).not.toContain("Response finished in");
  expect(stop()).toBeUndefined();
});
