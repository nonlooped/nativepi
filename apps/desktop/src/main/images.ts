import { randomUUID } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resizeImage } from "@earendil-works/pi-coding-agent";
import type { ImageAttachment } from "../shared/rpc-schema.ts";
import { MAX_IMAGES } from "../shared/images.ts";

/**
 * Images on their way to a prompt, sized the way Pi sizes them.
 *
 * Pi's own `@file` path resizes before an image ever reaches a provider, and its
 * resizer is exported, so this calls it rather than deciding on a second set of
 * limits in the renderer. What comes back is base64 in whichever of PNG or JPEG
 * came out smaller, which is exactly the shape Pi's `prompt` command wants.
 *
 * The renderer reads the bytes because paste, drop and the file picker all hand
 * it a `File` and only the picker would ever have had a path to send instead.
 */

/** Anything a model will take, and Photon can decode. */
const SUPPORTED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Base64 of an unresizable image is passed through only if a provider would accept it. */
const MAX_BASE64_BYTES = 4.5 * 1024 * 1024;

/** Past this, decoding to resize costs more than the image can possibly be worth. */
const MAX_INPUT_BASE64_BYTES = 48 * 1024 * 1024;

export async function readProjectImage(projectDir: string, file: string): Promise<string> {
  if (/^[a-z][a-z\d+.-]*:/i.test(file) && !/^[a-z]:[\\/]/i.test(file)) {
    const url = new URL(file);
    if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost")) {
      throw new Error("Use a local image path.");
    }
    file = fileURLToPath(url);
  }
  if (/^[\\/]{2}/.test(file)) throw new Error("Use a local image path.");
  const root = await realpath(projectDir);
  const target = await realpath(resolve(root, file));
  const within = relative(root, target);
  if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new Error("Image must be inside the project.");
  }
  const mimeType = ({
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  } as Record<string, string>)[extname(target).toLowerCase()];
  if (!mimeType) throw new Error("Unsupported image format.");
  const handle = await open(target, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Image is not a file.");
    if (stat.size > 16 * 1024 * 1024) throw new Error("Image is too large. Use an image up to 16 MB.");
    // A fixed buffer also bounds reads if another process grows the file after stat.
    const bytes = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = await handle.read(bytes, size, bytes.length - size, size);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size !== stat.size) throw new Error("Image changed while it was loading. Try again.");
    return `data:${mimeType};base64,${bytes.subarray(0, size).toString("base64")}`;
  } finally {
    await handle.close();
  }
}

export async function prepareImages(
  files: { name: string; mimeType: string; data: string }[],
): Promise<{ images: ImageAttachment[]; rejected: string[] }> {
  const images: ImageAttachment[] = [];
  // Past the batch limit the extra files are named rather than dropped: a drop
  // of thirty images that came back empty and silent would look like a failure
  // of the whole feature.
  const rejected: string[] = files.slice(MAX_IMAGES).map((file) => file.name);

  for (const file of files.slice(0, MAX_IMAGES)) {
    if (!SUPPORTED.has(file.mimeType) || file.data.length > MAX_INPUT_BASE64_BYTES) {
      rejected.push(file.name);
      continue;
    }
    const bytes = Buffer.from(file.data, "base64");
    const resized = await resizeImage(bytes, file.mimeType);
    // A null result is "Photon could not do it" — either the image resists every
    // size it tried, or the WASM module is missing from this build. Small images
    // are still perfectly sendable, so only give up on the ones that are not.
    if (!resized && file.data.length > MAX_BASE64_BYTES) {
      rejected.push(file.name);
      continue;
    }
    images.push({
      id: randomUUID(),
      name: file.name,
      mimeType: resized?.mimeType ?? file.mimeType,
      data: resized?.data ?? file.data,
    });
  }

  return { images, rejected };
}
