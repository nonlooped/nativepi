import { z } from "zod";

export const MAX_BACKGROUND_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_BACKGROUND_DATA_LENGTH = 2 * 1024 * 1024;
export const BACKGROUND_IMAGE_TYPES = "image/jpeg,image/png,image/webp";
export const BACKGROUND_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp," + BACKGROUND_IMAGE_TYPES;

export const chatBackgroundSchema = z.object({
  preset: z.enum(["mist", "dunes", "coast", "custom", "none"]).catch("mist"),
  // Only normalized raster data, never a URL or a path into the user's files.
  customImage: z.string().max(MAX_BACKGROUND_DATA_LENGTH)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).nullable().catch(null),
}).catch({ preset: "mist", customImage: null }).transform((background) =>
  background.preset === "custom" && !background.customImage
    ? { ...background, preset: "mist" as const }
    : background,
);

export type ChatBackground = z.infer<typeof chatBackgroundSchema>;
