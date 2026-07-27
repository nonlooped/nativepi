import { randomUUID } from "node:crypto";
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
