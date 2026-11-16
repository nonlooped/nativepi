import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RendererContext } from "@nativepi/extension-api";
import { ExtensionToolResult, ComposerControls } from "./ExtensionSlots.tsx";
import { primaryStore } from "../lib/store.ts";
import { dispatchExtensionEvent } from "../lib/extensionEvents.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";

const original = primaryStore.getState();
let root: Root;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(() => root.unmount()); container?.remove(); primaryStore.setState(original, true); });

test("retained callbacks cannot edit a different chat, and old event listeners are removed", async () => {
  let saved!: RendererContext;
  let events = 0;
  const ext = { id: "test", name: "test", renderer: { apiVersion: 1 as const,
    protocol: { methods: {}, events: { changed: undefined } },
    composerControls: [{ id: "capture", render: (context: RendererContext) => { saved = context; return <button onClick={() => context.actions.insertIntoComposer("hello")}>Insert</button>; } }],
  } };
  primaryStore.setState({ activeProjectPath: "/project", activeSessionFile: null, extRenderers: [ext], drafts: {} });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(() => root.render(<ComposerControls />));
  const old = saved;
  old.channel.on("changed", () => { events++; });
  await act(() => container.querySelector("button")!.click());
  expect(Object.values(primaryStore.getState().drafts)).toContain("hello");
  await act(() => primaryStore.setState({ activeProjectPath: "/other", selectionVersion: original.selectionVersion + 1, extRenderers: [] }));
  expect(() => old.actions.insertIntoComposer("wrong")).toThrow("view has closed");
  dispatchExtensionEvent("test", "changed", undefined, primaryStore.getState);
  expect(events).toBe(0);
  expect(Object.values(primaryStore.getState().drafts)).not.toContain("wrong");
});

test("reload during a pending channel call rejects its result", async () => {
  let context!: RendererContext;
  let finish!: (value: unknown) => void;
  const ext = { id: "test", name: "test", renderer: { apiVersion: 1 as const,
    protocol: { methods: { state: { result: { parse: (value: unknown) => Number(value) } } }, events: {} },
    composerControls: [{ id: "capture", render: (value: RendererContext) => { context = value; return null; } }],
  } };
  primaryStore.setState({ activeProjectPath: "/project", activeSessionFile: null, extRenderers: [ext] });
  stubInvoke(async channel => { if (channel === "callExtension") return new Promise(resolve => { finish = resolve; }); return {}; });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(() => root.render(<ComposerControls />));
  const pending = context.channel.call("state");
  await act(() => primaryStore.setState({ extRenderers: [] }));
  finish({ result: 3 });
  await expect(pending).rejects.toThrow("view has closed");
});


test("graphical tools receive live updates and clear progress when the tool ends", async () => {
  const { emptyConversation } = await import("../lib/store/conversation.ts");
  const { reduce } = await import("../lib/store/events.ts");
  const ext = { id: "progress", name: "progress", renderer: { apiVersion: 1 as const,
    tools: { inspect: ({ progress }: { progress?: { text: string } }) => <span>{progress?.text ?? "Waiting"}</span> },
  } };
  let conversation: ReturnType<typeof emptyConversation> = { ...emptyConversation(), projectDir: "/project" };
  primaryStore.setState({ activeProjectPath: "/project", activeSessionFile: null, extRenderers: [ext], conversations: { "/project": conversation } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(() => root.render(<ExtensionToolResult call={{ type: "toolCall", id: "tool", name: "inspect", arguments: {} }} />));
  conversation = { ...conversation, ...reduce(conversation, { type: "tool_execution_update", toolCallId: "tool", partialResult: { content: [{ type: "text", text: "Checked 12 files" }] } }) };
  await act(() => primaryStore.setState({ conversations: { "/project": conversation } }));
  expect(container.textContent).toBe("Checked 12 files");
  conversation = { ...conversation, ...reduce(conversation, { type: "tool_execution_end", toolCallId: "tool" }) };
  await act(() => primaryStore.setState({ conversations: { "/project": conversation } }));
  expect(container.textContent).toBe("Waiting");
});
