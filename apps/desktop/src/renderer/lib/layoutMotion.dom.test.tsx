import { afterEach, expect, test } from "bun:test";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLayoutMotion } from "./layoutMotion.ts";

let root: Root | undefined;
let host: HTMLDivElement;
const originalAnimate = HTMLElement.prototype.animate;
const originalRect = HTMLElement.prototype.getBoundingClientRect;
const originalMatchMedia = window.matchMedia;
let top = 100;
const activeAnimations = new Set<object>();
function Surface({ state }: { state: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutMotion(ref, state);
  return <div ref={ref}><input /></div>;
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  HTMLElement.prototype.animate = originalAnimate;
  HTMLElement.prototype.getBoundingClientRect = originalRect;
  window.matchMedia = originalMatchMedia;
  delete document.documentElement.dataset["motion"];
  activeAnimations.clear();
});
async function mount() {
  top = 100;
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.getBoundingClientRect = () => ({ top, left: 0 }) as DOMRect;
  HTMLElement.prototype.animate = (() => {
    const animation = { cancel: () => { activeAnimations.delete(animation); }, finished: new Promise(() => {}) };
    activeAnimations.add(animation);
    return animation;
  }) as unknown as typeof HTMLElement.prototype.animate;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Surface state={false} />));
}
test("layout changes carry the same focused input and cancel the previous animation on reversal and unmount", async () => {
  await mount();
  const input = host.querySelector("input")!; input.value = "unsent draft"; input.focus();
  top = 400;
  await act(async () => root!.render(<Surface state />));
  expect(activeAnimations.size).toBe(1);
  const firstAnimation = [...activeAnimations][0]!;
  expect(document.activeElement).toBe(input);
  top = 100;
  await act(async () => root!.render(<Surface state={false} />));
  expect(activeAnimations.size).toBe(1);
  expect(activeAnimations.has(firstAnimation)).toBe(false);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("unsent draft");
  await act(async () => root!.unmount()); root = undefined;
  expect(activeAnimations.size).toBe(0);
});
test("reduced motion cancels travel immediately and applies later layouts without animation", async () => {
  await mount();
  top = 400;
  await act(async () => root!.render(<Surface state />));
  expect(activeAnimations.size).toBe(1);
  await act(async () => { document.documentElement.dataset["motion"] = "reduced"; });
  expect(activeAnimations.size).toBe(0);
  top = 100;
  await act(async () => root!.render(<Surface state={false} />));
  expect(activeAnimations.size).toBe(0);
});
