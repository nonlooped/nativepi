import type { ImageAttachment } from "../../shared/rpc-schema.ts";
import type { ImageContent } from "../../shared/pi-types.ts";

/**
 * Images between a paste, drop or file picker and the composer.
 *
 * All three routes hand the window a `File`, so all three read their bytes the
 * same way and only the main process — where Pi's resizer lives — ever decides
 * what an image should end up as.
 */

/** What the picker offers and `prepareImages` will keep. */
export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";

/** The image files in a clipboard or a drop, ignoring everything else in it. */
export function imageFilesIn(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  return [...transfer.files].filter((file) => file.type.startsWith("image/"));
}

/**
 * Whether a drag that is still in the air is carrying images.
 *
 * `files` is empty until the drop: while the pointer is moving, Chromium
 * exposes only the kinds and mime types through `items`, so a dragover that
 * asked `imageFilesIn` would always say no and the composer would never become
 * a drop target. Some sources describe their payload as a bare `Files` entry
 * with no type, which is accepted here and sorted out on drop.
 */
export function draggingImages(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  const items = [...transfer.items].filter((item) => item.kind === "file");
  if (items.length > 0) return items.some((item) => item.type === "" || item.type.startsWith("image/"));
  return transfer.types.includes("Files");
}

/**
 * A file as base64, via the data URL the platform already builds.
 *
 * The prefix is dropped rather than sent: Pi wants the payload and its mime type
 * as separate fields, and the mime type is on the `File` already.
 */
export async function readAsBase64(file: File): Promise<{ name: string; mimeType: string; data: string }> {
  const reader = new FileReader();
  const url = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
  // A screenshot from the clipboard has no name of its own.
  return { name: file.name || "Pasted image", mimeType: file.type, data: url.slice(url.indexOf(",") + 1) };
}

export function dataUrl(attachment: ImageAttachment): string {
  return `data:${attachment.mimeType};base64,${attachment.data}`;
}

/** An attachment as Pi's prompt wants it: the id and name are ours, not Pi's. */
export function toImageContent(attachment: ImageAttachment): ImageContent {
  return { type: "image", data: attachment.data, mimeType: attachment.mimeType };
}
