import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Run with a DOM preload; the repository intentionally has no DOM-test dependency.
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(() => root!.unmount());
  container?.remove();
  root = undefined;
});

for (const multiline of [false, true]) {
  for (const blur of [false, true]) {
    domTest(`text setting commits once on ${blur ? "blur then unmount" : "unblurred unmount"} (multiline: ${multiline})`, async () => {
      const { TextRow } = await import("./rows.tsx");
      const commits: string[] = [];
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      await act(() => root!.render(<TextRow label="Shell" value="old" multiline={multiline} onCommit={(value) => commits.push(value)} />));
      const input = container.querySelector("input,textarea") as HTMLInputElement | HTMLTextAreaElement;
      input.focus();
      await act(() => {
        // Bypass React's value tracker, as a native keystroke does.
        const prototype = multiline ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, "new");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      if (blur) await act(() => input.blur());
      await act(() => root!.unmount());
      root = undefined;
      expect(commits).toEqual(["new"]);
    });
  }
}

domTest("text setting ignores a draft replaced by an authoritative prop and uses the latest callback", async () => {
  const { TextRow } = await import("./rows.tsx");
  const commits: string[] = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const render = (value: string, prefix: string) => act(async () => {
    root!.render(<TextRow label="Shell" value={value} onCommit={(typed) => commits.push(`${prefix}:${typed}`)} />);
  });
  await render("old", "first");
  const type = async (value: string) => {
    const input = container!.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await type("outdated draft");
  await render("external", "current");
  expect(container.querySelector("input")?.value).toBe("external");
  await act(async () => { root!.unmount(); });
  root = createRoot(container);
  expect(commits).toEqual([]);
  await render("external", "first");
  await type("latest draft");
  await render("external", "current");
  await act(async () => { root!.unmount(); });
  root = undefined;
  expect(commits).toEqual(["current:latest draft"]);
});
