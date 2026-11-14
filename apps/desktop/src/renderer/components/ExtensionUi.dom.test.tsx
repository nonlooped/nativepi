import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ExtensionPrompt } from "../lib/store.ts";

Object.defineProperty(globalThis, "requestAnimationFrame", { value: window.requestAnimationFrame.bind(window), configurable: true });
Object.defineProperty(globalThis, "cancelAnimationFrame", { value: window.cancelAnimationFrame.bind(window), configurable: true });
const respond = mock((_response: unknown) => {});
const state = { extPrompts: [] as ExtensionPrompt[], respondExtension: respond };
mock.module("../lib/store.ts", () => ({ useAppStore: (select: (s: typeof state) => unknown) => select(state) }));
const { default: ExtensionUi } = await import("./ExtensionUi.tsx");
let root: Root;
let container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  respond.mockClear();
});
async function mount(prompt: ExtensionPrompt) {
  state.extPrompts = [prompt];
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
  const submit = button("Submit");
  expect(submit.form).toBe(document.querySelector("form"));
  await act(async () => submit.click());
  expect(respond.mock.calls).toEqual([[{ value: "My answer" }]]);
});

test("Cancel never submits the input form", async () => {
  await mount({ ...common, method: "input" });
  await act(async () => button("Cancel").click());
  expect(respond.mock.calls).toEqual([[{ cancel: true }]]);
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
  expect(respond.mock.calls).toEqual([[{ value: "Edited\nanswer" }]]);
});

test("select rows preserve the full option as the response", async () => {
  const option = "A long option with enough detail to wrap across several lines in a narrow dialog";
  await mount({ ...common, method: "select", options: [option, "Second"] });
  await act(async () => button(option).click());
  expect(respond.mock.calls).toEqual([[{ value: option }]]);
});

test("confirm and close keep their distinct extension responses", async () => {
  await mount({ ...common, method: "confirm", message: "Continue?" });
  await act(async () => button("Confirm").click());
  expect(respond.mock.calls).toEqual([[{ confirmed: true }]]);
  respond.mockClear();
  await act(async () => button("Close dialog").click());
  expect(respond.mock.calls).toEqual([[{ cancel: true }]]);
});
