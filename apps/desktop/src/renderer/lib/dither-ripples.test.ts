import { expect, test } from "bun:test";
import { ditherPixels } from "./chat-backgrounds.ts";
import { rippleDither } from "./dither-ripples.ts";

const width = 400;
const height = 300;
function plate() {
  const pixels = new Uint8ClampedArray(Array.from({ length: width * height }, () => [128, 128, 128, 255]).flat());
  ditherPixels(pixels, width, [30, 50, 70]);
  return pixels;
}
function disturbance(now: number) {
  const base = plate();
  const pixels = base.slice();
  const region = rippleDither(pixels, new Float32Array(width * height).fill(1 - 128 / 255),
    new Float32Array(width * height), width, height, 1, [{ x: 200, y: 150, startedAt: 0, strength: 1 }], now);
  return { base, pixels, region };
}

test("ripples gather and release the fixed grid's dots without moving or recoloring the image", () => {
  const { base, pixels, region } = disturbance(100);
  let gathered = 0;
  let released = 0;
  let sameColors = true;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4;
    for (let channel = 0; channel < 3; channel++) if (pixels[offset + channel] !== base[offset + channel]) sameColors = false;
    if (pixels[offset + 3]! > base[offset + 3]!) gathered++;
    if (pixels[offset + 3]! < base[offset + 3]!) released++;
  }
  expect(gathered).toBeGreaterThan(20);
  expect(released).toBeGreaterThan(20);
  expect(sameColors).toBe(true);
  expect(pixels.subarray(0, 400)).toEqual(base.subarray(0, 400));
  expect(region?.left).toBeGreaterThan(100);
  expect(region?.right).toBeLessThan(300);
});

test("a disturbance propagates from its original position and completely dissipates", () => {
  const early = disturbance(100);
  const later = disturbance(450);
  expect(later.region!.left).toBeLessThan(early.region!.left);
  expect(later.region!.right).toBeGreaterThan(early.region!.right);
  expect((later.region!.left + later.region!.right) / 2).toBe(200);
  const settled = disturbance(900);
  expect(settled.region).toBeNull();
  expect(settled.pixels).toEqual(settled.base);
});

test("ripples at the edge stay bounded by the canvas", () => {
  const pixels = plate();
  const region = rippleDither(pixels, new Float32Array(width * height).fill(0.5),
    new Float32Array(width * height), width, height, 1, [{ x: 0, y: 0, startedAt: 0, strength: 1 }], 100);
  expect(region?.left).toBe(0);
  expect(region?.top).toBe(0);
  expect(region?.right).toBeLessThan(width);
  expect(region?.bottom).toBeLessThan(height);
});
