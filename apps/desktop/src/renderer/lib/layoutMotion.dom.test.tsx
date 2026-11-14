import { afterEach, expect, mock, test } from "bun:test";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLayoutMotion } from "./layoutMotion.ts";

let root: Root | undefined;
let host: HTMLDivElement;
const originalAnimate = HTMLElement.prototype.animate;
const originalRect = HTMLElement.prototype.getBoundingClientRect;
const originalMatchMedia = window.matchMedia;
let top = 100;
const animations: Array<{ cancel: ReturnType<typeof mock>; frames: Keyframe[] }> = [];
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
  animations.length = 0;
});
async function mount() {
  top = 100;
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.getBoundingClientRect = () => ({ top, left: 0 }) as DOMRect;
  HTMLElement.prototype.animate = ((frames: Keyframe[]) => {
    const animation = { cancel: mock(() => {}), frames, finished: Promise.resolve() };
    animations.push(animation);
    return animation;
  }) as unknown as typeof HTMLElement.prototype.animate;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Surface state={false} />));
}
test("layout changes carry the same focused input and cancel the previous animation on reversal and unmount", async () => {
  await mount();
  const input = host.querySelector("input")!; input.focus();
  top = 400;
  await act(async () => root!.render(<Surface state />));
  expect(animations[0]!.frames[0]!.transform).toBe("translate(0px, -300px)");
  expect(document.activeElement).toBe(input);
  top = 100;
  await act(async () => root!.render(<Surface state={false} />));
  expect(animations[0]!.cancel).toHaveBeenCalledTimes(1);
  expect(animations).toHaveLength(2);
  await act(async () => root!.unmount()); root = undefined;
  expect(animations[1]!.cancel).toHaveBeenCalledTimes(1);
});
test("reduced motion cancels travel immediately and applies later layouts without animation", async () => {
  await mount();
  top = 400;
  await act(async () => root!.render(<Surface state />));
  await act(async () => { document.documentElement.dataset["motion"] = "reduced"; });
  expect(animations[0]!.cancel).toHaveBeenCalledTimes(1);
  top = 100;
  await act(async () => root!.render(<Surface state={false} />));
  expect(animations).toHaveLength(1);
});
