import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";

mock.module("./ExtensionSlots.tsx", () => ({ ExtensionPanels: () => null }));
mock.module("./FileTypeIcon.tsx", () => ({ default: () => null }));
await import("./FileExplorer.tsx");
const { default: ContextPane } = await import("./ContextPane.tsx");
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
});

async function mount(projectDir: string | null, onClose = () => {}) {
  useAppStore.setState({ activeProjectPath: projectDir, projects: [{ path: "/project", name: "NativePi" }] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ContextPane onClose={onClose} />);
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

test("one Files header owns refresh and hide; refresh preserves expanded folders", async () => {
  const reads: string[] = [];
  stubInvoke(async (channel, params) => {
    if (channel !== "readProjectDirectory") return {};
    const { path } = params as { path: string };
    reads.push(path);
    return { entries: path === "" ? [{ name: "src", path: "src", kind: "dir" }] : [{ name: "main.ts", path: "src/main.ts", kind: "file" }] };
  });
  let closed = false;
  await mount("/project", () => { closed = true; });
  expect(container.querySelectorAll("h2")).toHaveLength(1);
  expect(container.querySelector("h2")?.textContent).toBe("Files");
  expect(container.textContent).not.toContain("Project files");
  expect(container.textContent).not.toContain("NativePi");
  const folder = container.querySelector<HTMLButtonElement>('[title="src"]')!;
  await act(async () => folder.click());
  expect(folder.getAttribute("aria-expanded")).toBe("true");
  reads.length = 0;
  await act(async () => container.querySelector<HTMLButtonElement>('header [aria-label="Refresh files"]')!.click());
  expect(reads).toEqual(["", "src"]);
  expect(folder.getAttribute("aria-expanded")).toBe("true");
  expect(container.textContent).toContain("main.ts");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Collapse folders"]')!.click());
  expect(folder.getAttribute("aria-expanded")).toBe("false");
  expect(container.textContent).not.toContain("main.ts");
  await act(async () => container.querySelector<HTMLButtonElement>('header [aria-label="Hide files"]')!.click());
  expect(closed).toBeTrue();
});

test("empty workspace keeps the Files header and disables refresh", async () => {
  await mount(null);
  expect(container.querySelector("h2")?.textContent).toBe("Files");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Refresh files"]')?.disabled).toBeTrue();
  expect(container.textContent).toContain("No project is open.");
});


test("search finds unexpanded project paths, opens them, and preserves the query on refresh", async () => {
  let opened: unknown;
  let searches = 0;
  stubInvoke(async (channel, params) => {
    if (channel === "readProjectDirectory") return { entries: [] };
    if (channel === "listProjectFiles") { searches++; return { files: ["src/deep/Button.tsx", "README.md"] }; }
    if (channel === "openFileIn") { opened = params; return { ok: true }; }
    return {};
  });
  await mount("/project");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Search files"]')!.click());
  const input = container.querySelector<HTMLInputElement>('[aria-label="Search project files"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "button");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.textContent).toContain("src/deep/Button.tsx");
  expect(container.textContent).not.toContain("README.md");
  await act(async () => container.querySelector<HTMLButtonElement>('[title="src/deep/Button.tsx"]')!.click());
  expect(opened).toMatchObject({ projectDir: "/project", file: "src/deep/Button.tsx" });
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Refresh files"]')!.click());
  expect(searches).toBe(2);
  expect(input.value).toBe("button");
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[aria-label="Search project files"]')).toBeNull();
});
