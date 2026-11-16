import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import KeybindSettings from "./KeybindSettings.tsx";
let root: Root; let host: HTMLDivElement;
afterEach(async () => { await act(() => root?.unmount()); host?.remove(); });
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
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Reset Choose model to default"]')!.click());
  expect(useAppStore.getState().keybindingOverrides).toEqual({});
  expect(host.textContent).toContain("No matching shortcuts");
});


test("disable and reset update the effective binding without losing other custom keys", async () => {
  useAppStore.setState({ ready: false, keybindingOverrides: { search: "$mod+KeyU" } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<KeybindSettings />));
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Disable Focus message composer shortcut"]')!.click());
  expect(useAppStore.getState().keybindingOverrides).toEqual({ search: "$mod+KeyU", focusComposer: "" });
  expect(host.querySelector('[aria-label^="Change shortcut for Focus message composer"]')!.textContent).toContain("Unassigned");
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Reset Focus message composer to default"]')!.click());
  expect(useAppStore.getState().keybindingOverrides).toEqual({ search: "$mod+KeyU" });
});
