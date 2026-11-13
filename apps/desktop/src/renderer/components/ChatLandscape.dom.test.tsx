import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ChatLandscape from "./ChatLandscape.tsx";

const originals = {
  image: globalThis.Image,
  raf: globalThis.requestAnimationFrame,
  cancel: globalThis.cancelAnimationFrame,
  media: window.matchMedia,
  context: window.HTMLCanvasElement.prototype.getContext,
  rect: window.HTMLCanvasElement.prototype.getBoundingClientRect,
};
let root: Root;
let host: HTMLDivElement;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
let ripplePaints = 0;
let frameTime = 0;

async function mount(reduced = false) {
  document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  window.matchMedia = (query) => {
    const media = originals.media.call(window, query);
    Object.defineProperty(media, "matches", { value: query.includes("hover"), configurable: true });
    return media;
  };
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  globalThis.Image = class {
    naturalWidth = 1600;
    naturalHeight = 900;
    onload: (() => void) | null = null;
    onerror = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  } as unknown as typeof Image;
  window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    const size = 800;
    return { width: size, height: size, top: 0, left: 0, bottom: size, right: size, x: 0, y: 0, toJSON() {} };
  };
  window.HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return {
      fillStyle: "#ffffff", fillRect() {}, clearRect() {}, drawImage() {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
      putImageData(...args: unknown[]) { if (args.length > 3) ripplePaints++; },
    };
  } as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
  host = document.createElement("div");
  host.className = "app-viewport";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ChatLandscape src="landscape.webp" />));
  flushFrame();
}

function flushFrame() {
  const pending = [...frames.values()];
  frames.clear();
  frameTime = Math.max(frameTime + 16, performance.now() + 16);
  for (const callback of pending) callback(frameTime);
}

function move(x: number, pointerType = "mouse") {
  const event = new Event("pointermove", { bubbles: true });
  Object.assign(event, { clientX: x, clientY: 400, pointerType });
  host.dispatchEvent(event);
}

afterEach(async () => {
  if (root) await act(() => root.unmount());
  host?.remove();
  globalThis.Image = originals.image;
  globalThis.requestAnimationFrame = originals.raf;
  globalThis.cancelAnimationFrame = originals.cancel;
  window.matchMedia = originals.media;
  window.HTMLCanvasElement.prototype.getContext = originals.context;
  window.HTMLCanvasElement.prototype.getBoundingClientRect = originals.rect;
  delete document.documentElement.dataset.motion;
  frames.clear();
  ripplePaints = 0;
  frameTime = 0;
});

test("the background ripples continue after pointer exit, settle, and cancel on unmount", async () => {
  await mount();
  expect(frames.size).toBe(0);
  expect(host.querySelectorAll("canvas")).toHaveLength(1);
  move(300);
  flushFrame();
  expect(ripplePaints).toBe(1);
  host.dispatchEvent(new Event("pointerleave"));
  flushFrame();
  expect(ripplePaints).toBe(2);
  for (let step = 0; frames.size && step < 100; step++) flushFrame();
  expect(frames.size).toBe(0);
  move(400);
  expect(frames.size).toBe(1);
  await act(() => root.unmount());
  expect(frames.size).toBe(0);
  move(600);
  expect(frames.size).toBe(0);
});

test("touch and reduced motion keep the landscape static", async () => {
  await mount();
  move(400, "touch");
  expect(frames.size).toBe(0);
  await act(async () => { document.documentElement.dataset.motion = "reduced"; });
  flushFrame();
  expect(host.querySelectorAll("canvas")).toHaveLength(1);
  move(500);
  expect(frames.size).toBe(0);
  expect(ripplePaints).toBe(0);
});
