import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ExtensionPrompt } from "../lib/store.ts";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";

Object.defineProperty(globalThis, "requestAnimationFrame", { value: window.requestAnimationFrame.bind(window), configurable: true });
Object.defineProperty(globalThis, "cancelAnimationFrame", { value: window.cancelAnimationFrame.bind(window), configurable: true });
const responses: unknown[] = [];
const original = useAppStore.getState();
const { default: ExtensionUi } = await import("./ExtensionUi.tsx");
let root: Root;
let container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  responses.length = 0;
  useAppStore.setState(original, true);
});
async function mount(prompt: ExtensionPrompt) {
  stubInvoke(async (channel, params) => {
    if (channel !== "extensionRespond") throw new Error(`Unexpected request: ${channel}`);
    responses.push(params);
    return { ok: true };
  });
  // The prompt belongs to another chat: replies must use its original target.
  useAppStore.setState({ activeProjectPath: "/elsewhere", activeSessionFile: "/other", extPrompts: [prompt], extensionPromptsByProject: { [prompt.projectDir]: [prompt] } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ExtensionUi />));
}
function button(label: string) {
  return [...document.querySelectorAll("button")].find(el => el.textContent === label)!;
}
const common = { type: "extension_ui_request" as const, id: "prompt", title: "Extension question", projectDir: "/repo", sessionFile: null };

test("footer Submit sends the current input through its associated form", async () => {
  await mount({ ...common, method: "input" });
  const input = document.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, "My answer");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Submit").click());
  expectReply({ value: "My answer" });
});

test("Cancel never submits the input form", async () => {
  await mount({ ...common, method: "input" });
  await act(async () => button("Cancel").click());
  expectReply({ cancelled: true });
});

test("editor footer submits the latest multiline text", async () => {
  await mount({ ...common, method: "editor", prefill: "Original" });
  const input = document.querySelector("textarea")!;
  expect(input.value).toBe("Original");
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Edited\nanswer");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Submit").click());
  expectReply({ value: "Edited\nanswer" });
});

test("select rows preserve the full option as the response", async () => {
  const option = "A long option with enough detail to wrap across several lines in a narrow dialog";
  await mount({ ...common, method: "select", options: [option, "Second"] });
  await act(async () => button(option).click());
  expectReply({ value: option });
});

test("confirm and close keep their distinct extension responses", async () => {
  await mount({ ...common, method: "confirm", message: "Continue?" });
  await act(async () => button("Confirm").click());
  expectReply({ confirmed: true });
  responses.length = 0;
  await act(async () => useAppStore.setState({ extPrompts: [{ ...common, method: "confirm", message: "Continue?" }] }));
  await act(async () => button("Close dialog").click());
  expectReply({ cancelled: true });
});

function expectReply(reply: { value?: string; confirmed?: boolean; cancelled?: boolean }) {
  expect(responses).toEqual([{ projectDir: "/repo", sessionFile: null, response: { type: "extension_ui_response", id: "prompt", ...reply } }]);
  expect(useAppStore.getState().extPrompts).toEqual([]);
  expect(useAppStore.getState().extensionPromptsByProject["/repo"]).toEqual([]);
}
