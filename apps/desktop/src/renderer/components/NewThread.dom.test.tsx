import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
let loaded = true;
let ready = false;
const openSettings = mock(() => {});
mock.module("../lib/store.ts", () => ({ useAppStore: (select: (s: unknown) => unknown) => select({ providersLoaded: loaded, providers: [{ ready }], openSettings }) }));
mock.module("./Composer.tsx", () => ({ default: () => <textarea aria-label="Message" /> }));
const { default: NewThread } = await import("./NewThread.tsx");
let root: Root;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); openSettings.mockClear(); });
async function mount() { container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => root.render(<NewThread />)); }
test("unconnected users get a provider action and no composer", async () => {
  loaded = true; ready = false; await mount();
  expect(container.querySelector("textarea")).toBeNull();
  await act(async () => container.querySelector("button")!.click());
  expect(openSettings).toHaveBeenCalledWith("Providers");
});
test("ready providers show only the work heading and composer", async () => {
  loaded = true; ready = true; await mount();
  expect(container.querySelector("h1")?.textContent).toBe("What should we work on?");
  expect(container.querySelector("textarea")).not.toBeNull();
  expect(container.querySelector("button")).toBeNull();
});
test("loading providers does not flash an unconnected state", async () => {
  loaded = false; ready = false; await mount();
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  expect(container.querySelector("button, textarea")).toBeNull();
});
