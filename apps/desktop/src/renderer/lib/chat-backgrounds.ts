import type { ChatBackground } from "../../shared/chat-background.ts";
import { BACKGROUND_IMAGE_TYPES, MAX_BACKGROUND_DATA_LENGTH, MAX_BACKGROUND_FILE_BYTES } from "../../shared/chat-background.ts";
import mist from "../assets/backgrounds/mist.webp";
import dunes from "../assets/backgrounds/dunes.webp";
import coast from "../assets/backgrounds/coast.webp";

export const CHAT_BACKGROUNDS = [
  { id: "mist", name: "Mist", src: mist, photographer: "Nik Iurev", url: "https://unsplash.com/photos/Pk1MrGNquo8" },
  { id: "dunes", name: "Dunes", src: dunes, photographer: "NIR HIMI", url: "https://unsplash.com/photos/Nl8huOhdcQA" },
  { id: "coast", name: "Coast", src: coast, photographer: "Luke Stackpoole", url: "https://unsplash.com/photos/NEsS80iDVdw" },
] as const;

export function chatBackgroundSource(background: ChatBackground): string | null {
  if (background.preset === "none") return null;
  if (background.preset === "custom" && background.customImage) return background.customImage;
  return (CHAT_BACKGROUNDS.find((entry) => entry.id === background.preset) ?? CHAT_BACKGROUNDS[0]).src;
}

// Ordered 8×8 Bayer dithering: stable dots, no animated noise or render loop.
const BAYER = [
  0, 48, 12, 60, 3, 51, 15, 63,
  32, 16, 44, 28, 35, 19, 47, 31,
  8, 56, 4, 52, 11, 59, 7, 55,
  40, 24, 36, 20, 43, 27, 39, 23,
  2, 50, 14, 62, 1, 49, 13, 61,
  34, 18, 46, 30, 33, 17, 45, 29,
  10, 58, 6, 54, 9, 57, 5, 53,
  42, 26, 38, 22, 41, 25, 37, 21,
];

export function ditherThreshold(x: number, y: number): number {
  return (BAYER[(y % 8) * 8 + x % 8]! + 0.5) / 64;
}

/** Turn a photograph into transparent ink in the theme's foreground color. */
export function ditherPixels(pixels: Uint8ClampedArray, width: number, ink: readonly number[]): void {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const pixel = offset / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const luminance = (0.2126 * pixels[offset]! + 0.7152 * pixels[offset + 1]! + 0.0722 * pixels[offset + 2]!) / 255;
    const threshold = ditherThreshold(x, y);
    const alpha = pixels[offset + 3]!;
    pixels[offset] = ink[0]!;
    pixels[offset + 1] = ink[1]!;
    pixels[offset + 2] = ink[2]!;
    pixels[offset + 3] = 1 - luminance > threshold ? alpha : 0;
  }
}

/** Save a bounded, metadata-free copy, shared by desktop and browser file inputs. */
export async function importChatBackground(file: File): Promise<string> {
  if (!BACKGROUND_IMAGE_TYPES.split(",").includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > MAX_BACKGROUND_FILE_BYTES) throw new Error("Choose an image smaller than 20 MB.");
  let image: ImageBitmap | undefined;
  try {
    // Decode the File directly: object-URL <img>s are blocked by our image CSP.
    image = await createImageBitmap(file);
    const scale = Math.min(1, 2560 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this image.");
    // Transparent PNGs get a neutral ground rather than becoming solid ink.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.88);
    if (data.length > MAX_BACKGROUND_DATA_LENGTH) throw new Error("This image has too much detail to save. Choose a smaller image.");
    return data;
  } catch (error) {
    if (error instanceof Error && !["EncodingError", "InvalidStateError"].includes(error.name)) throw error;
    throw new Error("Could not read this image. Try another JPEG, PNG, or WebP.");
  } finally {
    image?.close();
  }
}
