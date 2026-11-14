import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_PREFERENCES } from "../../../shared/rpc-schema.ts";
import { useAppStore } from "../../lib/store.ts";
import AppearanceSettings from "./AppearanceSettings.tsx";

let root: Root;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => { root.unmount(); }); container?.remove(); });

test("compact layout choices save their values and cannot be deselected", async () => {
  useAppStore.setState({ ready: false, preferences: { ...DEFAULT_PREFERENCES, themeId: "nativepi" } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<AppearanceSettings />); });
  expect(container.textContent).toContain("Glass background");
  expect(container.querySelector('[aria-label="Backgrounds"]')).toBeNull();
  const choice = (name: string) => [...container.querySelectorAll("button")].find(button => button.textContent === name)!;
  await act(async () => { choice("Full").click(); });
  expect(useAppStore.getState().preferences.conversationWidth).toBe("full");
  await act(async () => { choice("Full").click(); });
  expect(useAppStore.getState().preferences.conversationWidth).toBe("full");
  await act(async () => { choice("Side by side").click(); });
  expect(useAppStore.getState().preferences.diffStyle).toBe("split");
  await act(async () => { choice("Unified").click(); });
  expect(useAppStore.getState().preferences.diffStyle).toBe("unified");
  await act(() => useAppStore.setState({ preferences: { ...DEFAULT_PREFERENCES, themeId: "paper" } }));
  expect(container.querySelector('[aria-label="Backgrounds"]')).not.toBeNull();
  const selected = container.querySelector('[role="radio"][aria-checked="true"]');
  expect(selected?.textContent).toContain("Paper");
  const acrylic = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    .find(button => button.textContent?.includes("Acrylic"))!;
  expect(acrylic).toBeDefined();
  await act(() => acrylic.click());
  expect(useAppStore.getState().preferences.themeId).toBe("nativepi");
  expect(container.textContent).toContain("Glass background");
});
