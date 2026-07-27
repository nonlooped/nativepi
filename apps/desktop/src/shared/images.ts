/**
 * The limits both sides of the attachment path agree on.
 *
 * The main process is where an image is accepted or refused, but the window has
 * to know the same numbers: it holds the `File` before anything is read, and
 * turning a huge one into base64 just to have it refused an IPC hop later costs
 * hundreds of megabytes in the renderer for nothing.
 */

/** Images per batch. Past this a drop is a mistake, not a message. */
export const MAX_IMAGES = 20;

/** On-disk bytes. Base64 of this still fits under the decode limit in `images.ts`. */
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
