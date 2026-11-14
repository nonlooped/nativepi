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
