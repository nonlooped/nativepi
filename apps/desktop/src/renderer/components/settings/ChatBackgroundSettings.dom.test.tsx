import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import { DEFAULT_PREFERENCES } from "../../../shared/rpc-schema.ts";
import ChatBackgroundSettings from "./ChatBackgroundSettings.tsx";

let root: Root;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(() => root.unmount()); container?.remove(); });

async function mount(customImage: string | null = null) {
  useAppStore.setState({ ready: false, preferences: { ...DEFAULT_PREFERENCES, chatBackground: { preset: "mist", customImage } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(<ChatBackgroundSettings />));
}

test("switching backgrounds keeps a saved custom image and None disables the backdrop", async () => {
  const customImage = "data:image/jpeg;base64,/9j/AAAA";
  await mount(customImage);
  const choice = (name: string) => container.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`) ??
    [...container.querySelectorAll("button")].find((button) => button.textContent === name)!;
  await act(() => choice("Dunes").click());
  expect(useAppStore.getState().preferences.chatBackground).toEqual({ preset: "dunes", customImage });
  expect(choice("Dunes").getAttribute("aria-pressed")).toBe("true");
  await act(() => choice("None").click());
  expect(useAppStore.getState().preferences.chatBackground).toEqual({ preset: "none", customImage });
  await act(() => choice("Your image").click());
  expect(useAppStore.getState().preferences.chatBackground.preset).toBe("custom");
  await act(() => choice("Remove your image").click());
  expect(useAppStore.getState().preferences.chatBackground).toEqual({ preset: "mist", customImage: null });
});

test("an invalid upload keeps the current image and explains how to recover", async () => {
  await mount();
  const input = container.querySelector("input")!;
  Object.defineProperty(input, "files", { value: [new File(["bad"], "bad.svg", { type: "image/svg+xml" })] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("JPEG, PNG, or WebP");
  expect(useAppStore.getState().preferences.chatBackground).toEqual({ preset: "mist", customImage: null });
  expect([...container.querySelectorAll("button")].every((button) => !button.disabled)).toBe(true);
});
