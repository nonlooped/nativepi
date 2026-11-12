import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
if (typeof document !== "undefined") {
  mock.module("./DiffView.tsx", () => ({ default: ({ patch }: { patch: string }) => <pre>{patch}</pre> }));
  mock.module("./FileTypeIcon.tsx", () => ({ default: () => null }));
}
const { default: DiffPreview } = await import("./DiffPreview.tsx");
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
async function render(path: string, onBack = () => {}) {
  if (!root) { container = document.createElement("div"); document.body.append(container); root = createRoot(container); }
  await act(async () => root!.render(<DiffPreview key={path} projectDir="/project" path={path} mode="working" onBack={onBack} />));
}
domTest("switching a file discards the older response and preserves long Unicode paths", async () => {
  let resolve!: (value: unknown) => void;
  const old = new Promise(done => { resolve = done; });
  stubInvoke(async (_channel, params: any) => params.file === "old" ? old : { kind: "diff", patch: "current content" });
  await render("old");
  const path = "a/".repeat(60) + "文件 with spaces.ts";
  await render(path);
  await act(async () => resolve({ kind: "diff", patch: "obsolete content" }));
  expect(container.textContent).toContain("current content");
  expect(container.textContent).not.toContain("obsolete content");
  expect(container.textContent).toContain("文件 with spaces.ts");
});
domTest("failed reads can retry and oversized diffs retain a route back", async () => {
  let attempts = 0; let returned = false;
  stubInvoke(async () => { if (!attempts++) throw new Error("File was removed"); return { kind: "large", bytes: 1048577 }; });
  await render("image.bin", () => { returned = true; });
  expect(container.textContent).toContain("File was removed");
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Try again")!.click());
  expect(container.textContent).toContain("too large to preview");
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Changes")!.click());
  expect(returned).toBe(true);
});
