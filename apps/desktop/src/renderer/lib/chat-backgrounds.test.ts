import { expect, test } from "bun:test";
import { chatBackgroundSource, CHAT_BACKGROUNDS, ditherPixels, importChatBackground } from "./chat-backgrounds.ts";
import { BACKGROUND_IMAGE_ACCEPT, MAX_BACKGROUND_DATA_LENGTH, MAX_BACKGROUND_FILE_BYTES } from "../../shared/chat-background.ts";

test("custom selection without a readable image falls back to the bundled landscape", () => {
  expect(chatBackgroundSource({ preset: "custom", customImage: null })).toBe(CHAT_BACKGROUNDS[0].src);
  expect(chatBackgroundSource({ preset: "none", customImage: "saved" })).toBeNull();
  expect(chatBackgroundSource({ preset: "custom", customImage: "saved" })).toBe("saved");
});

test("dithering preserves extremes, transparency, and the theme's ink", () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
  ditherPixels(pixels, 3, [20, 40, 60]);
  expect([...pixels]).toEqual([20, 40, 60, 255, 20, 40, 60, 0, 20, 40, 60, 0]);
});

test("midtones use a stable ordered dot pattern rather than a flat fill", () => {
  const make = () => new Uint8ClampedArray(Array.from({ length: 64 }, () => [128, 128, 128, 255]).flat());
  const pixels = make();
  ditherPixels(pixels, 8, [100, 100, 100]);
  const alpha = [...pixels].filter((_, index) => index % 4 === 3);
  expect(alpha.filter((value) => value === 255)).toHaveLength(32);
  const repeat = make();
  ditherPixels(repeat, 8, [100, 100, 100]);
  expect(repeat).toEqual(pixels);
});

test("unsupported and oversized uploads are rejected before decoding", async () => {
  expect(BACKGROUND_IMAGE_ACCEPT).toContain(".jpg");
  expect(BACKGROUND_IMAGE_ACCEPT).toContain(".webp");
  await expect(importChatBackground(new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }))).rejects.toThrow("JPEG, PNG, or WebP");
  const oversized = { type: "image/jpeg", size: MAX_BACKGROUND_FILE_BYTES + 1 } as File;
  await expect(importChatBackground(oversized)).rejects.toThrow("20 MB");
});

test("uploads decode directly, normalize to bounded JPEGs, and release decoded images", async () => {
  const originalDocument = globalThis.document;
  const originalDecode = globalThis.createImageBitmap;
  let closed = 0;
  const drawCalls: unknown[][] = [];
  let data = "data:image/jpeg;base64,/9j/AAAA";
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect: () => {}, drawImage: (...args: unknown[]) => drawCalls.push(args) }),
    toDataURL: (mime: string, quality: number) => { expect(mime).toBe("image/jpeg"); expect(quality).toBe(0.88); return data; },
  };
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  globalThis.createImageBitmap = (async () => ({ width: 6000, height: 4000, close: () => closed++ })) as unknown as typeof createImageBitmap;
  try {
    const file = new File(["image"], "landscape.jpg", { type: "image/jpeg" });
    expect(await importChatBackground(file)).toBe(data);
    expect([canvas.width, canvas.height]).toEqual([2560, 1707]);
    expect(drawCalls[0]?.slice(1)).toEqual([0, 0, 2560, 1707]);
    expect(closed).toBe(1);
    data = "A".repeat(MAX_BACKGROUND_DATA_LENGTH + 1);
    await expect(importChatBackground(file)).rejects.toThrow("smaller image");
    expect(closed).toBe(2);
    globalThis.createImageBitmap = async () => { throw new DOMException("Invalid image", "InvalidStateError"); };
    await expect(importChatBackground(file)).rejects.toThrow("Could not read this image");
  } finally {
    globalThis.document = originalDocument;
    globalThis.createImageBitmap = originalDecode;
  }
});
