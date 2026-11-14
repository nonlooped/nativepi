import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";

Object.defineProperty(globalThis, "requestAnimationFrame", { value: window.requestAnimationFrame.bind(window), configurable: true });
Object.defineProperty(globalThis, "cancelAnimationFrame", { value: window.cancelAnimationFrame.bind(window), configurable: true });

mock.module("../lib/platform.ts", () => ({ isDesktopShell: false }));
mock.module("../lib/fileIcons.ts", () => ({ fileIconCatalog: () => undefined, subscribeFileIcons: () => () => {} }));
const { default: FileExplorer } = await import("./FileExplorer.tsx");
let root: Root;
let container: HTMLDivElement;
const calls: { channel: string; params: unknown }[] = [];
beforeEach(() => {
  calls.length = 0;
  stubInvoke(async (channel, params) => {
    calls.push({ channel, params });
    if (channel === "readProjectDirectory") return { entries: [
      { name: "notes.ts", path: "notes.ts", kind: "file" },
      { name: "photo.png", path: "photo.png", kind: "file" },
    ] };
    if (channel === "listProjectFiles") return { files: ["notes.ts", "photo.png"] };
    if (channel === "readProjectMedia") return { src: "data:image/png;base64,YQ==" };
    return {};
  });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); });
async function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<FileExplorer projectDir="/project" renderHeader={({ search }) => <button onClick={search}>Search files</button>} />));
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent === label)!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
for (const search of [false, true]) test(`Local Access file taps preview media and explain unsupported files (search ${search})`, async () => {
  await mount();
  if (search) await click("Search files");
  await click("notes.ts");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("notes.ts: Open this file in the NativePi desktop app");
  expect(calls.some(call => call.channel === "openFileIn")).toBe(false);
  await click("photo.png");
  expect(calls.filter(call => call.channel === "readProjectMedia")).toEqual([{ channel: "readProjectMedia", params: { projectDir: "/project", file: "photo.png" } }]);
  expect(document.querySelector('img[alt="photo.png"]')?.getAttribute("src")).toBe("data:image/png;base64,YQ==");
  expect(container.querySelector('[role="status"]')).toBeNull();
});

test("Local Access media failures can be retried without opening a desktop editor", async () => {
  await mount();
  let unavailable = true;
  stubInvoke(async channel => {
    if (channel === "readProjectMedia") {
      if (unavailable) throw new Error("Disconnected");
      return { src: "data:image/png;base64,YQ==" };
    }
    return {};
  });
  await click("photo.png");
  expect(document.body.textContent).toContain("Media could not be loaded.");
  unavailable = false;
  const retry = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Try again"))!;
  await act(async () => retry.click());
  expect(document.querySelector('img[alt="photo.png"]')?.getAttribute("src")).toBe("data:image/png;base64,YQ==");
});
