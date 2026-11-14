import ThreadActivity from "./ThreadActivity.tsx";
import type { ThreadSnapshot } from "../../shared/orchestration.ts";
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import type { AssistantMessage, ToolCall, ToolResultMessage } from "../../shared/pi-types.ts";
import { AssistantResponse } from "./Transcript.tsx";

mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {} }));
if (typeof window !== "undefined") {
  Reflect.set(globalThis, "requestAnimationFrame", window.requestAnimationFrame.bind(window));
  Reflect.set(globalThis, "cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
}
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
const call = (id: string, command: string): ToolCall => ({ type: "toolCall", id, name: "bash", arguments: { command } });
const first = call("a", "bun test");
const second = call("b", "git status");
const message = (content: AssistantMessage["content"]): AssistantMessage => ({ role: "assistant", content, timestamp: 1 } as AssistantMessage);
const results = new Map<string, ToolResultMessage>([
  ["a", { role: "toolResult", toolCallId: "a", toolName: "bash", content: [{ type: "text", text: "First command failed" }], isError: true, timestamp: 1 }],
  ["b", { role: "toolResult", toolCallId: "b", toolName: "bash", content: [{ type: "text", text: "Clean worktree" }], isError: false, timestamp: 1 }],
]);
async function mount() {
  stubInvoke(async () => ({}));
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "session", extRenderers: [], extUiState: { ...useAppStore.getState().extUiState, toolsExpanded: false } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
}
async function render(streaming: boolean, calls = [first, second]) {
  await act(async () => root!.render(<AssistantResponse entryId="response" messages={[
    message([{ type: "text", text: "Checking the project." }, ...calls]),
    ...(streaming ? [] : [message([{ type: "text", text: "The answer." }])]),
  ]} results={results} streaming={streaming} />));
}
async function click(prefix: string) {
  const target = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.startsWith(prefix));
  expect(target).toBeDefined();
  await act(async () => target!.click());
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });

domTest("work is expanded during a run and collapses on completion, leaving the answer visible", async () => {
  await mount();
  await render(true);
  expect(container.textContent).toContain("Checking the project.");
  expect(container.textContent).toContain("Ran 2 commands");
  expect(container.textContent).not.toContain("First command failed");
  await render(false);
  expect(container.textContent).not.toContain("Checking the project.");
  expect(container.textContent).not.toContain("Ran 2 commands");
  expect(container.textContent).toContain("The answer.");
  await click("Worked for");
  expect(container.textContent).toContain("Checking the project.");
});

domTest("group and individual outputs expand only on demand, including failures", async () => {
  await mount();
  await render(true);
  expect(container.textContent).not.toContain("Failed");
  expect(container.textContent).not.toContain("Completed");
  await click("Ran 2 commands");
  expect(container.textContent).toContain("bun test");
  expect(container.textContent).not.toContain("First command failed");
  await click("bun test");
  expect(container.textContent).toContain("First command failed");
  expect(container.textContent).not.toContain("Clean worktree");
  // Appending another call does not close a group or output opened by the reader.
  await render(true, [first, second, call("c", "bun typecheck")]);
  expect(container.textContent).toContain("First command failed");
  expect(container.textContent).toContain("bun typecheck");
});

domTest("thinking is optional and does not fill the expanded work section", async () => {
  await mount();
  await act(async () => root!.render(<AssistantResponse entryId="response" messages={[message([
    { type: "thinking", thinking: "Detailed private reasoning" }, first,
  ])]} results={results} streaming />));
  expect(container.textContent).toContain("Thinking");
  expect(container.textContent).not.toContain("Detailed private reasoning");
  await click("Thinking");
  expect(container.textContent).toContain("Detailed private reasoning");
});


domTest("Pi's explicit tools-expanded UI request still reveals grouped tool output", async () => {
  await mount();
  await render(true);
  expect(container.textContent).not.toContain("First command failed");
  await act(async () => useAppStore.setState(s => ({ extUiState: { ...s.extUiState, toolsExpanded: true } })));
  expect(container.textContent).toContain("First command failed");
  expect(container.textContent).toContain("Clean worktree");
});

domTest("new file diffs and the final changes list stay closed until requested", async () => {
  await mount();
  const write: ToolCall = { type: "toolCall", id: "write", name: "write", arguments: { path: "new.ts", content: "new file contents" } };
  const writeResult: ToolResultMessage = { role: "toolResult", toolCallId: "write", toolName: "write", content: [{ type: "text", text: "Written" }], isError: false, timestamp: 1 };
  await act(async () => root!.render(<AssistantResponse entryId="response" messages={[message([write]), message([{ type: "text", text: "Created the file." }])]} results={new Map([["write", writeResult]])} />));
  expect(container.textContent).toContain("Created the file.");
  expect(container.textContent).toContain("1 file changed");
  expect(container.textContent).not.toContain("new file contents");
  expect(container.textContent).not.toContain("new.ts");
  await click("Worked for");
  expect(container.textContent).toContain("new.ts");
  expect(container.textContent).not.toContain("new file contents");
});

domTest("delegate cards remain at their spawn response, update in place, and never pin to the composer", async () => {
  await mount();
  const lead = { id: "lead", cwd: "/project", file: "session" };
  const ref = { id: "child", cwd: "/worktree", file: "delegate-session" };
  const spawned: ToolCall = { type: "toolCall", id: "spawn-call", name: "delegate_spawn", arguments: { label: "Audit copy", task: "Review the public copy" } };
  const child: ThreadSnapshot = { ref, running: true, busy: true, relationship: { operationId: "spawn", sourceToolCallId: spawned.id, lead, delegate: ref, label: "Audit copy", configuration: { provider: "p", model: "m", reasoning: "off", tools: ["read"] }, workspace: { mode: "worktree", path: ref.cwd, base: "commit", branch: "audit", repository: lead.cwd } }, assignment: { id: "assignment", delegate: ref, attempt: 1, taskMessageId: "task", state: "running", questions: [] }, inbox: [], pendingDelivery: [], readMessageIds: [], reports: [], delegates: [] };
  const parent: ThreadSnapshot = { ref: lead, running: false, busy: true, inbox: [], pendingDelivery: [], readMessageIds: [], reports: [], delegates: [child] };
  useAppStore.setState({ destination: "work", orchestration: { revision: 1, threads: [parent, child] } });
  // The durable source call ID connects an allocated child even before the
  // transport's result arrives, rather than matching a potentially repeated label.
  await act(async () => root!.render(<><AssistantResponse entryId="spawn-response" messages={[message([spawned]), message([{ type: "text", text: "Audit assigned." }])]} results={new Map()} streaming={false} /><AssistantResponse entryId="later-response" messages={[message([{ type: "text", text: "An unrelated later turn." }])]} results={new Map()} streaming={false} /><div data-composer-activity><ThreadActivity /></div></>));
  const card = container.querySelector('[data-delegate-invocation="spawn-call"]')!;
  expect(card).not.toBeNull();
  expect(container.querySelector("#entry-spawn-response")?.contains(card)).toBe(true);
  expect(container.querySelector("#entry-later-response")?.contains(card)).toBe(false);
  expect(card.textContent).toContain("Running");
  expect(container.querySelector("[data-composer-activity]")?.textContent).not.toContain("Audit copy");
  const previousSelect = useAppStore.getState().selectChat;
  const selections: string[][] = [];
  useAppStore.setState({ selectChat: async (file, cwd) => { selections.push([file, cwd!]); } });
  try {
    await act(async () => card.querySelector<HTMLButtonElement>('[aria-label="Open delegate: Audit copy"]')!.click());
    expect(selections).toEqual([[ref.file, ref.cwd]]);
    const finished = { ...child, running: false, busy: false, assignment: { ...child.assignment!, state: "completed" as const } };
    await act(async () => useAppStore.setState({ orchestration: { revision: 2, threads: [{ ...parent, busy: false, delegates: [finished] }, finished] } }));
    expect(container.querySelector('[data-delegate-invocation="spawn-call"]')).toBe(card);
    expect(card.textContent).toContain("Completed");
    expect(container.querySelector('[data-composer-activity]')?.textContent).toBe("");
    expect(card.querySelector('[aria-label="Stop delegate: Audit copy"]')).toBeNull();
  } finally { useAppStore.setState({ selectChat: previousSelect }); }
});

domTest("cold historical spawn results retain navigation without adopting the original child", async () => {
  await mount();
  useAppStore.setState({ activeSessionFile: "cloned-session", orchestration: { revision: 1, threads: [] } });
  const spawned: ToolCall = { type: "toolCall", id: "old-call", name: "delegate_spawn", arguments: { label: "Original audit" } };
  const output: ToolResultMessage = { role: "toolResult", toolName: "delegate_spawn", toolCallId: spawned.id, content: [], isError: false, details: { ref: { id: "old-child", cwd: "/original", file: "/original-child" }, accepted: true }, timestamp: 1 };
  await act(async () => root!.render(<AssistantResponse entryId="historical" messages={[message([spawned])]} results={new Map([[spawned.id, output]])} streaming={false} />));
  expect(container.querySelector('[aria-label="Open delegate: Original audit"]')).not.toBeNull();
  expect(container.textContent).toContain("Status unavailable");
  expect(container.querySelector('[aria-label="Stop delegate: Original audit"]')).toBeNull();
  const ref = { id: "old-child", cwd: "/original", file: "/original-child" };
  const oldLead = { id: "original-id", cwd: "/project", file: "cloned-session" };
  const original: ThreadSnapshot = { ref, running: true, busy: true, status: "running", inbox: [], pendingDelivery: [], readMessageIds: [], reports: [], delegates: [], relationship: { operationId: "original-spawn", lead: oldLead, delegate: ref, label: "Original audit", configuration: { provider: "p", model: "m", reasoning: "off", tools: ["read"] }, workspace: { mode: "shared", path: ref.cwd } } };
  const clone: ThreadSnapshot = { ...original, ref: { ...oldLead, id: "new-id" }, relationship: undefined, running: false, busy: false };
  await act(async () => useAppStore.setState({ orchestration: { revision: 2, threads: [clone, original] } }));
  expect(container.textContent).toContain("Running");
  expect(container.querySelector('[aria-label="Stop delegate: Original audit"]')).toBeNull();
});

domTest("computer screenshots remain viewable from the persisted tool result", async () => {
  await mount();
  const screenshot: ToolCall = { type: "toolCall", id: "screen", name: "computer_screenshot", arguments: { app: "Notes" } };
  const result: ToolResultMessage = { role: "toolResult", toolCallId: "screen", toolName: screenshot.name, content: [{ type: "text", text: "Captured Notes" }, { type: "image", mimeType: "image/png", data: "aW1hZ2U=" }], isError: false, timestamp: 1 };
  await act(async () => root!.render(<AssistantResponse entryId="response" messages={[message([screenshot])]} results={new Map([["screen", result]])} streaming />));
  await click("Capture Notes");
  expect(container.querySelector('img[alt="Computer screenshot"]')?.getAttribute("src")).toBe("data:image/png;base64,aW1hZ2U=");
  await click("Computer screenshot.png");
  expect(document.querySelector('[role="dialog"] img')?.getAttribute("src")).toBe("data:image/png;base64,aW1hZ2U=");
});

domTest("computer errors explain the failure without dumping protocol JSON", async () => {
  await mount();
  const call: ToolCall = { type: "toolCall", id: "computer", name: "computer_use", arguments: { command: "click" } };
  const result: ToolResultMessage = { role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text: '{"ok":false}' }], details: { computerUse: { ok: false, command: "click", error: { code: "COMPUTER_BUSY", message: "Another Work chat is controlling the computer." } } }, isError: true, timestamp: 1 };
  await act(async () => root!.render(<AssistantResponse entryId="response" messages={[message([call])]} results={new Map([[call.id, result]])} streaming />));
  await click("Click");
  expect(container.textContent).toContain("Another Work chat is controlling the computer.");
  expect(container.textContent).not.toContain('{"ok":false}');
});
