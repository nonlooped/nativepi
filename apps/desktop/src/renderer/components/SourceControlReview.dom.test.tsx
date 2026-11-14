import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
if (typeof document !== "undefined") {
  mock.module("./DiffPreview.tsx", () => ({ default: ({ path, actions }: any) => <section><h2>{path}</h2>{actions}</section> }));
  mock.module("./DiffView.tsx", () => ({ default: () => null, DiffToolbar: () => null }));
}
const { default: SourceControlReview } = await import("./SourceControlReview.tsx");
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
function Surface() {
  const review = useAppStore(s => s.sourceControlReview);
  return review ? <SourceControlReview review={review} /> : null;
}
function button(name: string) { return [...container.querySelectorAll("button")].find(b => b.textContent === name)!; }
domTest("file navigation stays on the selected side and respects boundaries and busy mutations", async () => {
  useAppStore.setState({ sourceControlReview: { projectDir: "/project", path: "one", staged: false }, sourceControlBusy: false,
    git: { files: [
      { path: "one", state: "modified", staged: false, unstaged: true },
      { path: "index-only", state: "modified", staged: true, unstaged: false },
      { path: "two", state: "modified", staged: true, unstaged: true },
    ] } as any,
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<Surface />));
  expect(container.textContent).toContain("1 / 2");
  expect(button("Previous file").disabled).toBe(true);
  await act(async () => button("Next file").click());
  expect(useAppStore.getState().sourceControlReview?.path).toBe("two");
  expect(container.textContent).toContain("2 / 2");
  expect(button("Next file").disabled).toBe(true);
  await act(async () => useAppStore.setState({ sourceControlBusy: true }));
  expect(button("Previous file").disabled).toBe(true);
  await act(async () => useAppStore.setState({ sourceControlBusy: false }));
  await act(async () => button("View staged").click());
  expect(container.textContent).toContain("2 / 2");
  await act(async () => button("Previous file").click());
  expect(useAppStore.getState().sourceControlReview).toMatchObject({ path: "index-only", staged: true });
});
domTest("navigation remains usable when the current file loses changes", async () => {
  useAppStore.setState({ sourceControlReview: { projectDir: "/project", path: "gone", staged: false }, sourceControlBusy: false,
    git: { files: [{ path: "remaining", state: "modified", staged: false, unstaged: true }] } as any,
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<Surface />));
  expect(container.textContent).toContain("— / 1");
  await act(async () => button("Next file").click());
  expect(useAppStore.getState().sourceControlReview?.path).toBe("remaining");
  expect(button("Next file").disabled).toBe(true);
});
