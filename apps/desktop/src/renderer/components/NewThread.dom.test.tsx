import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import NewThread from "./NewThread.tsx";

let root: Root | undefined;
let container: HTMLDivElement;
const original = useAppStore.getState();
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  useAppStore.setState(original, true);
});

test("provider loading resolves to onboarding, its action opens provider settings, and a ready provider clears onboarding", async () => {
  useAppStore.setState({ destination: "work", providersLoaded: false, providers: [], settingsOpen: false, settingsCategory: null });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<NewThread />));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Checking providers…");
  expect(container.querySelector("button")).toBeNull();

  await act(async () => useAppStore.setState({ providersLoaded: true }));
  const connect = [...container.querySelectorAll("button")].find(button => button.textContent === "Connect a provider")!;
  await act(async () => connect.click());
  expect(useAppStore.getState()).toMatchObject({ settingsOpen: true, settingsCategory: "Providers" });

  await act(async () => useAppStore.setState({ providers: [
    { id: "test", name: "Test", supportsApiKey: true, supportsOAuth: false, configured: true, ready: true },
  ] }));
  // Ready clears the setup message; the wordmark and composer provide the empty state.
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.textContent).not.toContain("Connect a provider");
});
