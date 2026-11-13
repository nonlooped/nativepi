import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const domTest = test.skipIf(typeof document === "undefined");
// happy-dom has no layout/intersection engine. Supply a fixed 360px viewport
// and 20px line geometry; use the actual PatchDiff and Virtualizer components.
if (typeof document !== "undefined") {
  for (const key of ["Document", "ShadowRoot", "CSSStyleSheet", "HTMLPreElement", "HTMLSlotElement", "CustomEvent", "customElements", "SVGElement", "DOMRect"]) {
    Object.defineProperty(globalThis, key, { value: Reflect.get(window, key), configurable: true });
  }
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return 1000016; } });
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { queueMicrotask(() => {
      const rect = target.getBoundingClientRect();
      this.callback([{ target, contentRect: rect, contentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }], borderBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }); }
    unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver = class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { queueMicrotask(() => this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)); }
    unobserve() {} disconnect() {} takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
}
const { primeDiffHighlighter } = await import("../lib/diffHighlighter.ts");
const { default: DiffView } = await import("./DiffView.tsx");
let root: Root | undefined;
let container: HTMLDivElement;
let geometry: ReturnType<typeof spyOn> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; container?.remove(); geometry?.mockRestore();
});
async function settle() {
  await act(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function mount(patch: string, embedded = false) {
  geometry = spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const scroll = container?.querySelector<HTMLElement>(".overflow-auto")?.scrollTop ?? 0;
    return new DOMRect(0, this.tagName === "DIFFS-CONTAINER" ? -scroll : 0, 800,
      this.classList.contains("overflow-auto") ? 360 : 20);
  });
  await primeDiffHighlighter();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<DiffView patch={patch} embedded={embedded} />));
  await settle();
}
const patchFor = (lines: number) => `--- /dev/null\n+++ b/generated.txt\n@@ -0,0 +1,${lines} @@\n` + Array.from({ length: lines }, (_, i) => `+row${i}\n`).join("");
domTest("large diffs mount a bounded range and scrolling reaches the final line", async () => {
  await mount(patchFor(50000));
  const diff = container.querySelector("diffs-container")!;
  const shadow = diff.shadowRoot!;
  expect(shadow.textContent).toContain("row0");
  expect(shadow.querySelectorAll("[data-line]").length).toBeGreaterThan(0);
  expect(shadow.querySelectorAll("[data-line]").length).toBeLessThan(500);
  const viewport = container.querySelector<HTMLElement>(".overflow-auto")!;
  Object.defineProperty(viewport, "scrollHeight", { value: 1000016 });
  await act(async () => { viewport.scrollTop = 999640; viewport.dispatchEvent(new Event("scroll")); });
  await settle();
  expect(shadow.textContent).toContain("row49999");
  expect(shadow.querySelectorAll("[data-line]").length).toBeLessThan(500);
});
domTest("embedded diffs retain wrapping, split/unified controls and theme updates", async () => {
  await mount(patchFor(10), true);
  expect(container.firstElementChild!.className).toContain("max-h-96");
  const wrap = [...container.querySelectorAll("button")].find(button => button.textContent === "Wrap lines")!;
  await act(async () => wrap.click());
  expect(wrap.getAttribute("aria-pressed")).toBe("true");
  const mode = [...container.querySelectorAll("button")].find(button => /^(Unified|Split) view$/.test(button.textContent ?? ""))!;
  const previous = mode.textContent;
  await act(async () => mode.click());
  expect(mode.textContent).not.toBe(previous);
  await act(async () => document.documentElement.classList.add("dark"));
  await settle();
  expect(container.querySelector("diffs-container")!.shadowRoot!.textContent).toContain("row9");
  await act(async () => document.documentElement.classList.remove("dark"));
});
