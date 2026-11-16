import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../../lib/store.ts";
import { DEFAULT_PREFERENCES } from "../../../shared/rpc-schema.ts";
import GeneralSettings from "./GeneralSettings.tsx";
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let root: Root; let host: HTMLDivElement;
afterEach(async () => { await act(() => root?.unmount()); host?.remove(); });
async function choose(label: string) {
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Background turn notifications"]')!.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === label)!;
  await act(() => option.click());
}
test("notification modes round-trip both preferences and retain sound while off", async () => {
  useAppStore.setState({ ready: false, preferences: { ...DEFAULT_PREFERENCES, notifyOnTurnEnd: true, notificationSound: true } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<GeneralSettings />));
  await choose("Off");
  expect(useAppStore.getState().preferences).toMatchObject({ notifyOnTurnEnd: false, notificationSound: true });
  await choose("Notification");
  expect(useAppStore.getState().preferences).toMatchObject({ notifyOnTurnEnd: true, notificationSound: false });
  await choose("Notification and sound");
  expect(useAppStore.getState().preferences).toMatchObject({ notifyOnTurnEnd: true, notificationSound: true });
});
