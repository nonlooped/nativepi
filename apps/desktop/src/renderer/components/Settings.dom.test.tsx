import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";
let initial: string | null = null;
let settingsReads = 0;
mock.module("../lib/layout.ts", () => ({ useWorkspaceLayout: () => "wide" }));
mock.module("./settings/AppearanceSettings.tsx", () => ({ default: () => <output>appearance controls</output> }));
mock.module("./settings/TerminalSettings.tsx", () => ({ default: () => <output>terminal controls</output> }));
const { default: Settings, settingsPage, CATEGORIES } = await import("./Settings.tsx");
let root: Root;
let container: HTMLDivElement;
afterEach(async () => { if(root) await act(async () => root.unmount()); container?.remove(); });
async function mount() {
  settingsReads = 0;
  stubInvoke(async channel => { if (channel === "getPiSettings") settingsReads++; return {}; });
  useAppStore.setState({ settingsOpen: true, settingsCategory: initial, conversations: {}, activeProjectPath: null, activeSessionFile: null });
  container=document.createElement("div"); document.body.append(container); root=createRoot(container); await act(async () => root.render(<Settings />)); }
test("legacy destinations still resolve to their replacement pages", () => {
  expect(settingsPage("Appearance")).toBe("Appearance");
  expect(settingsPage("Layout & diffs")).toBe("Appearance");
  expect(settingsPage("Theme & motion")).toBe("Appearance");
  expect(settingsPage("Workbench")).toBe("Terminal");
  expect(settingsPage("System")).toBe("General");
  expect(settingsPage("Agent")).toBe("Behavior");
  expect(settingsPage("Providers")).toBe("Providers");
  expect(settingsPage("Computer use")).toBe("Behavior");
  expect(settingsPage("unknown")).toBe("Appearance");
});
test("sidebar exposes grouped pages and switching pages does not re-read local settings", async () => {
  initial=null; await mount();
  const nav=container.querySelector("nav")!;
  expect(container.querySelector('[aria-label="Close sidebar"]')).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("appearance controls");
  expect([...nav.querySelectorAll("button")].some(x => x.textContent === "Layout & diffs")).toBe(false);
  const terminal=[...nav.querySelectorAll("button")].find(x=>x.textContent==="Terminal")!;
  await act(() => terminal.click());
  expect(container.querySelector("output")?.textContent).toBe("terminal controls");
  expect(settingsReads).toBe(1);
});
test("direct terminal navigation refreshes Pi settings", async () => {
  initial="Terminal"; await mount();
  expect(container.querySelector("output")?.textContent).toBe("terminal controls");
  expect(settingsReads).toBe(1);
});

test("the header X closes settings", async () => {
  initial=null; await mount();
  expect(container.textContent).not.toContain("Back to workspace");
  await act(async () => (container.querySelector('[aria-label="Close settings"]') as HTMLButtonElement).click());
  expect(useAppStore.getState().settingsOpen).toBe(false);
});

test("sidebar search filters descriptions, hides empty groups, and recovers from no matches", async () => {
  initial=null; await mount();
  const input=container.querySelector('[aria-label="Filter categories"]') as HTMLInputElement;
  async function search(value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await search("  FILE CHANGES  ");
  expect([...container.querySelectorAll("nav button")].map(x=>x.textContent?.trim())).toEqual(["Appearance"]);
  expect(container.querySelectorAll("nav h2").length).toBe(1);
  expect(container.querySelector("output")?.textContent).toBe("appearance controls");
  await search("no such setting");
  expect(container.querySelector("nav [role=status]")?.textContent).toBe("No matching categories.");
  await search("");
  expect(container.querySelectorAll("nav button").length).toBe(CATEGORIES.length);
});
