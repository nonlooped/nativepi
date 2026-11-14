import { afterEach, expect, mock, test } from "bun:test";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import { emptyConversation } from "../lib/store/conversation.ts";
import type { SessionEntry } from "../../shared/pi-types.ts";
import { DeferredTranscript, DeferredTranscriptItem } from "./DeferredTranscript.tsx";
import Transcript from "./Transcript.tsx";

mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {} }));
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
const observers: TestObserver[] = [];
class TestObserver {
  targets = new Set<Element>();
  constructor(readonly callback: IntersectionObserverCallback) { observers.push(this); }
  observe(element: Element) { this.targets.add(element); }
  unobserve(element: Element) { this.targets.delete(element); }
  disconnect() { this.targets.clear(); }
  reveal(element: Element) { this.callback([{ target: element, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}
const originalObserver = globalThis.IntersectionObserver;
async function mount(children: React.ReactNode) {
  Reflect.set(globalThis, "IntersectionObserver", TestObserver);
  Reflect.set(globalThis, "requestAnimationFrame", window.requestAnimationFrame.bind(window));
  Reflect.set(globalThis, "cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
  observers.length = 0;
  stubInvoke(async () => ({}));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(children));
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  Reflect.set(globalThis, "IntersectionObserver", originalObserver);
});

function StatefulMessage() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Clicked {count}</button>;
}
domTest("history mounts near the viewport and stays mounted with its state intact", async () => {
  const view = (immediate: boolean) => <DeferredTranscript><DeferredTranscriptItem immediate={immediate} entryId="old"><StatefulMessage /></DeferredTranscriptItem></DeferredTranscript>;
  await mount(view(false));
  expect(container.querySelector("button")).toBeNull();
  expect(observers).toHaveLength(1);
  await act(async () => observers[0]!.reveal(container.querySelector("#entry-old")!));
  await act(async () => container.querySelector("button")!.click());
  await act(async () => root!.render(view(true)));
  await act(async () => root!.render(view(false)));
  expect(container.textContent).toBe("Clicked 1");
  expect(observers[0]!.targets.size).toBe(0);
});

const history: SessionEntry[] = Array.from({ length: 100 }, (_, i) => ([
  { type: "message", id: `u${i}`, parentId: null, timestamp: "2026-11-14T00:00:00Z", message: { role: "user", content: `Prompt ${i}`, timestamp: i } },
  { type: "message", id: `a${i}`, parentId: `u${i}`, timestamp: "2026-11-14T00:00:01Z", message: { role: "assistant", content: [{ type: "text", text: `Answer ${i}` }], timestamp: i } },
] as SessionEntry[])).flat();
function resetChat(entries = history) {
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "chat", extSurfaces: [], extRenderers: [], trust: null,
    transcriptTarget: null, conversations: { chat: { ...emptyConversation(), entries } } });
}
domTest("long transcripts initially mount only recent messages and reveal a deep link immediately", async () => {
  resetChat();
  await mount(<Transcript />);
  expect(container.querySelectorAll('article[id^="entry-a"]')).toHaveLength(10);
  expect(container.textContent).not.toContain("Answer 0");
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = () => {};
  try {
    await act(async () => useAppStore.setState({ transcriptTarget: { session: "chat", entry: "a0" } }));
    expect(container.textContent).toContain("Answer 0");
    expect(useAppStore.getState().transcriptTarget).toBeNull();
    await act(async () => useAppStore.setState(s => ({ selectionVersion: s.selectionVersion + 1 })));
    expect(container.textContent).not.toContain("Answer 0");
  } finally { HTMLElement.prototype.scrollIntoView = scroll; }
});

domTest("Select All reveals complete history before selection without affecting text fields", async () => {
  resetChat();
  await mount(<Transcript />);
  const viewport = container.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')!;
  const input = document.createElement("textarea");
  viewport.append(input);
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  expect(container.textContent).not.toContain("Answer 0");
  await act(async () => viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  expect(container.textContent).toContain("Answer 0");
  expect(container.querySelectorAll('article[id^="entry-a"]')).toHaveLength(100);
});

domTest("an offscreen pending graphical tool mounts without waiting for scrolling", async () => {
  const entries = structuredClone(history);
  (entries[1] as Extract<SessionEntry, { type: "message" }>).message = {
    role: "assistant", timestamp: 1,
    content: [{ type: "toolCall", id: "question", name: "ask_test", arguments: {} }],
  };
  resetChat(entries);
  useAppStore.setState({ extRenderers: [{ id: "test", name: "test", renderer: {
    apiVersion: 1, tools: { ask_test: () => <button>Pending question</button> },
  } }] });
  await mount(<Transcript />);
  expect(container.textContent).toContain("Pending question");
  expect(container.querySelectorAll('article[id^="entry-a"]')).toHaveLength(11);
});
