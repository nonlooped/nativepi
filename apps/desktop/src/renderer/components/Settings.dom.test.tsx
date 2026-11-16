import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { DEFAULT_PREFERENCES } from "../../shared/rpc-schema.ts";
mock.module("./settings/AppearanceSettings.tsx", () => ({ default: () => <output>appearance controls</output> }));
mock.module("./settings/TerminalSettings.tsx", () => ({ default: () => <details data-setting="scrollback"><summary>Scrollback options</summary><output>terminal controls</output></details>, PiShellSettings: () => <output>shell controls</output> }));
const { default: Settings } = await import("./Settings.tsx");
let root: Root;
let container: HTMLDivElement;
let reads = 0;
afterEach(async () => { if (root) await act(() => root.unmount()); container?.remove(); });
async function mount(destination: string | null = null) {
  reads = 0;
  stubInvoke(async channel => { if (channel === "getPiSettings") { reads++; return { settings: { autoRetry: true, autoCompaction: true, defaultThinkingLevel: "", blockImages: false, autoResizeImages: true, hideThinkingBlock: false, shellPath: "", shellCommandPrefix: "" } }; } if (channel === "getChatTitleModels") return { models: [] }; return {}; });
  useAppStore.setState({ settingsOpen: true, settingsCategory: destination, piSettings: null, piRestartPending: false, appPanel: null, conversations: {}, activeProjectPath: null, activeSessionFile: null, preferences: DEFAULT_PREFERENCES, providers: [] });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Settings />));
}
async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === name)!;
  expect(button).toBeDefined(); await act(async () => { button.click(); });
}
async function search(value: string) {
  await act(() => { const input = container.querySelector<HTMLInputElement>('[aria-label="Search settings"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
test("old destination links reveal their new controls without re-reading settings on navigation", async () => {
  await mount("Workbench");
  expect(container.querySelector("h1")?.textContent).toBe("Advanced");
  expect(container.querySelector<HTMLDetailsElement>('[data-setting="terminal"]')?.open).toBe(true);
  expect(container.textContent).toContain("terminal controls");
  await click("Appearance");
  expect(container.querySelector("output")?.textContent).toBe("appearance controls");
  await act(async () => useAppStore.getState().openSettings("Computer use"));
  expect(container.querySelector("h1")?.textContent).toBe("Permissions");
  await act(async () => useAppStore.getState().openSettings("System"));
  expect(container.querySelector("h1")?.textContent).toBe("General");
  for (const [legacy, page] of [["Terminal", "Advanced"], ["Extensions", "Tools & extensions"], ["Agent setup", "Tools & extensions"], ["Layout & diffs", "Appearance"], ["Theme & motion", "Appearance"], ["Agent", "Advanced"], ["unknown", "General"]]) {
    await act(async () => useAppStore.getState().openSettings(legacy));
    expect(container.querySelector("h1")?.textContent).toBe(page);
  }
  expect(reads).toBe(1);
});
test("search finds title generation and navigates to the actual conversation setting", async () => {
  await mount();
  await search("  FILE CHANGES  ");
  await click("Diff layoutAppearance");
  expect(container.querySelector("output")?.textContent).toBe("appearance controls");
  await search("  TITLE  ");
  expect(container.textContent).toContain("Title generation");
  await click("Title generationConversations");
  expect(container.querySelector("h1")?.textContent).toBe("Conversations");
  expect(container.querySelector('[data-setting="titles"]')?.textContent).toContain("Title generation");
  expect(useAppStore.getState().preferences.chatTitle).toEqual(DEFAULT_PREFERENCES.chatTitle);
});
test("search reveals advanced sections and recovers from no matches", async () => {
  await mount(); await search("scrollback");
  await click("ScrollbackAdvanced");
  expect(container.querySelector<HTMLDetailsElement>('[data-setting="terminal"]')?.open).toBe(true);
  await act(() => { container.querySelector<HTMLDetailsElement>('[data-setting="terminal"]')!.open = false; });
  await search("scrollback");
  await click("ScrollbackAdvanced");
  expect(container.querySelector<HTMLDetailsElement>('[data-setting="terminal"]')?.open).toBe(true);
  await search("no such setting");
  expect(container.querySelector("nav [role=status]")?.textContent).toBe("No matching settings.");
  await search("");
  expect(container.querySelector('nav [aria-current="page"]')?.textContent).toBe("Advanced");
});
test("app shortcuts leave preferences and legacy operation links still reach their features", async () => {
  await mount(); await search("usage"); await click("Usage");
  expect(useAppStore.getState().settingsOpen).toBe(false);
  expect(useAppStore.getState().appPanel).toBe("usage");
  await act(async () => useAppStore.getState().openSettings("Automations"));
  expect(useAppStore.getState().appPanel).toBe("automations");
  await act(async () => useAppStore.getState().openSettings("Access"));
  expect(useAppStore.getState().appPanel).toBe("access");
  await act(async () => useAppStore.getState().openSettings());
  expect(useAppStore.getState().appPanel).toBeNull();
  expect(useAppStore.getState().settingsOpen).toBe(true);
});
test("the header X closes settings", async () => {
  await mount(); await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')!.click());
  expect(useAppStore.getState().settingsOpen).toBe(false);
});
