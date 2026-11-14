import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import { emptyConversation } from "../lib/store/conversation.ts";
import type { SessionEntry } from "../../shared/pi-types.ts";
import Transcript from "./Transcript.tsx";

mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {} }));
const domTest = test.skipIf(typeof document === "undefined");
if (typeof window !== "undefined") {
  Reflect.set(globalThis, "requestAnimationFrame", window.requestAnimationFrame.bind(window));
  Reflect.set(globalThis, "cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
}
let root: Root | undefined;
let container: HTMLDivElement;
let restoreGeometry: (() => void) | undefined;
const entry = (id: string, role: "user" | "assistant"): SessionEntry => ({
  type: "message", id, parentId: null, timestamp: "2026-11-14T12:00:00Z",
  message: { role, content: [{ type: "text", text: role === "user" ? "My prompt" : "The answer" }], timestamp: 1 },
} as SessionEntry);
const history = [entry("user-old", "user"), entry("answer-old", "assistant"), entry("user-latest", "user"), entry("answer-latest", "assistant")];

function geometry(short: boolean) {
  const proto = HTMLElement.prototype;
  const properties = ["getBoundingClientRect", "clientHeight", "scrollHeight", "scrollTo"] as const;
  const originals = properties.map(name => Object.getOwnPropertyDescriptor(proto, name));
  const offsets: Record<string, [number, number]> = short
    ? { "user-old": [0, 60], "answer-old": [60, 80] }
    : { "user-old": [0, 100], "answer-old": [100, 1100], "user-latest": [1200, 80], "answer-latest": [1280, 720] };
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 400; } });
  Object.defineProperty(proto, "scrollHeight", { configurable: true, get() { return short ? 400 : 2000; } });
  Object.defineProperty(proto, "scrollTo", { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = options.top ?? 0; } });
  Object.defineProperty(proto, "getBoundingClientRect", { configurable: true, value(this: HTMLElement) {
    const viewport = container?.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]');
    const scroll = viewport?.scrollTop ?? 0;
    const item = this.dataset.messageId ? offsets[this.dataset.messageId] : undefined;
    const top = item ? item[0] - scroll : this.dataset.slot === "message-scroller-content" ? -scroll : 0;
    const height = item ? item[1] : this.dataset.slot === "message-scroller-content" ? short ? 400 : 2000 : 400;
    return { top, bottom: top + height, left: 0, right: 600, x: 0, y: top, width: 600, height, toJSON() {} };
  } });
  restoreGeometry = () => properties.forEach((name, index) => {
    const original = originals[index];
    if (original) Object.defineProperty(proto, name, original);
    else Reflect.deleteProperty(proto, name);
  });
}

async function mount(entries: SessionEntry[], short = false, jumpRequest = 0) {
  stubInvoke(async () => ({}));
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "chat", extSurfaces: [], extRenderers: [], trust: null,
    transcriptTarget: null, jumpRequest, conversations: { chat: { ...emptyConversation(), entries } } });
  container = document.createElement("div");
  document.body.append(container);
  geometry(short);
  root = createRoot(container);
  await act(async () => root!.render(<Transcript />));
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  restoreGeometry?.();
  container?.remove();
});
const viewport = () => container.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')!;

domTest("opening a long saved chat positions the transcript at the end", async () => {
  await mount(history);
  expect(viewport().scrollTop).toBe(1600);
  expect(container.querySelector('[data-message-id="user-latest"]')?.getAttribute("data-scroll-anchor")).toBe("false");
  expect(container.querySelector('[data-message-id="answer-latest"]')?.getAttribute("data-scroll-anchor")).toBe("false");
});

domTest("short exchanges stay at the top without introducing a scroll gap", async () => {
  await mount(history.slice(0, 2), true);
  expect(viewport().scrollTop).toBe(0);
  expect(container.querySelector('[data-message-scroller-spacer]')?.hasAttribute("hidden")).toBe(true);
});

domTest("opening waits for fetched messages before scrolling to the end", async () => {
  await mount([]);
  expect(container.querySelector('[data-slot="message-scroller-item"]')).toBeNull();
  await act(async () => useAppStore.setState(s => ({ conversations: { ...s.conversations, chat: { ...s.conversations.chat, entries: history } } })));
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  expect(viewport().scrollTop).toBe(1600);
});


domTest("a fresh jump request returns to the end after scrolling up", async () => {
  await mount(history, false, 5);
  expect(viewport().scrollTop).toBe(1600);
  viewport().scrollTop = 400;
  await act(async () => useAppStore.getState().requestJumpToLatest());
  expect(viewport().scrollTop).toBe(1600);
});
