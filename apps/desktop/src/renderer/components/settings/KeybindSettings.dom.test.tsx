import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import KeybindSettings from "./KeybindSettings.tsx";
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let root: Root; let host: HTMLDivElement;
afterEach(async () => { await act(() => root?.unmount()); host?.remove(); });
async function action(label: string, name: string) {
  await act(() => host.querySelector<HTMLButtonElement>(`[aria-label="Actions for ${label}"]`)!.click());
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === name)!;
  expect(item).toBeDefined();
  await act(() => item.click());
}

test("shortcut search cancels recording before typing, and the modified filter retains reset behavior", async () => {
  useAppStore.setState({ ready: false, keybindingOverrides: { selectModel: "$mod+Shift+KeyM" } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<KeybindSettings />));
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label^="Change shortcut for Focus message composer"]')!.click());
  const input = host.querySelector<HTMLInputElement>('[aria-label="Search shortcuts"]')!;
  await act(() => input.focus());
  await act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "m", code: "KeyM", bubbles: true })));
  expect(useAppStore.getState().keybindingOverrides).toEqual({ selectModel: "$mod+Shift+KeyM" });
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "model"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(host.textContent).toContain("Choose model");
  expect(host.textContent).not.toContain("Focus message composer");
  await act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Modified")!.click());
  await action("Choose model", "Reset to default");
  expect(useAppStore.getState().keybindingOverrides).toEqual({});
  expect(host.textContent).toContain("No matching shortcuts");
});


test("disable and reset update the effective binding without losing other custom keys", async () => {
  useAppStore.setState({ ready: false, keybindingOverrides: { search: "$mod+KeyU" } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<KeybindSettings />));
  await action("Focus message composer", "Disable shortcut");
  expect(useAppStore.getState().keybindingOverrides).toEqual({ search: "$mod+KeyU", focusComposer: "" });
  expect(host.querySelector('[aria-label^="Change shortcut for Focus message composer"]')!.textContent).toContain("Unassigned");
  await action("Focus message composer", "Reset to default");
  expect(useAppStore.getState().keybindingOverrides).toEqual({ search: "$mod+KeyU" });
});


test("the action menu starts recording; Escape cancels and keys save the new binding", async () => {
  useAppStore.setState({ ready: false, keybindingOverrides: {} });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<KeybindSettings />));
  await action("Focus message composer", "Change shortcut");
  const binding = () => host.querySelector<HTMLButtonElement>('[aria-label^="Change shortcut for Focus message composer"]')!;
  expect(binding().getAttribute("aria-pressed")).toBe("true");
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })));
  expect(binding().getAttribute("aria-pressed")).toBe("false");
  expect(useAppStore.getState().keybindingOverrides).toEqual({});
  await act(() => binding().click());
  const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "u", code: "KeyU", ...(mac ? { metaKey: true } : { ctrlKey: true }), bubbles: true, cancelable: true })));
  expect(useAppStore.getState().keybindingOverrides).toEqual({ focusComposer: "$mod+KeyU" });
  expect(binding().getAttribute("aria-pressed")).toBe("false");
});
