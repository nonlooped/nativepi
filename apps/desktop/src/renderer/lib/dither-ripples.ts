import { ditherThreshold } from "./chat-backgrounds.ts";

export const RIPPLE_DURATION_MS = 850;
export interface DitherRipple { x: number; y: number; startedAt: number; strength: number }
export interface InkBounds { left: number; top: number; right: number; bottom: number }

/** Perturb the density of the existing screen-aligned dots, never their grid.
 * Each impulse stays where the mouse passed and expands before dissipating.
 * The caller restores the base pixels before painting this frame. */
export function rippleDither(
  pixels: Uint8ClampedArray, density: Float32Array, field: Float32Array,
  width: number, height: number, dot: number, ripples: readonly DitherRipple[], now: number,
): InkBounds | null {
  field.fill(0);
  const regions: InkBounds[] = [];
  let dirty: InkBounds | null = null;
  for (const ripple of ripples) {
    const progress = (now - ripple.startedAt) / RIPPLE_DURATION_MS;
    if (progress < 0 || progress >= 1) continue;
    const x = ripple.x / dot;
    const y = ripple.y / dot;
    const radius = (14 + progress * 140) / dot;
    const thickness = 24 / dot;
    const reach = radius + thickness;
    const region = {
      left: Math.max(0, Math.floor(x - reach)), top: Math.max(0, Math.floor(y - reach)),
      right: Math.min(width, Math.ceil(x + reach)), bottom: Math.min(height, Math.ceil(y + reach)),
    };
    if (region.left >= region.right || region.top >= region.bottom) continue;
    regions.push(region);
    dirty = unionInkBounds(dirty, region);
    const amplitude = 0.32 * ripple.strength * (1 - progress) ** 1.7;
    for (let row = region.top; row < region.bottom; row++) {
      for (let col = region.left; col < region.right; col++) {
        const offset = (Math.hypot(col + 0.5 - x, row + 0.5 - y) - radius) / thickness;
        if (Math.abs(offset) >= 1) continue;
        // A crest followed by a trough: dots gather and release along the wave.
        field[row * width + col] += Math.sin(offset * Math.PI) * (1 - Math.abs(offset)) ** 2 * amplitude;
      }
    }
  }
  for (const region of regions) {
    for (let row = region.top; row < region.bottom; row++) {
      for (let col = region.left; col < region.right; col++) {
        const pixel = row * width + col;
        if (field[pixel] === 0) continue;
        pixels[pixel * 4 + 3] = density[pixel]! + field[pixel]! > ditherThreshold(col, row) ? 255 : 0;
      }
    }
  }
  return dirty;
}

export function unionInkBounds(a: InkBounds | null, b: InkBounds | null): InkBounds | null {
  if (!a) return b;
  if (!b) return a;
  return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
}
