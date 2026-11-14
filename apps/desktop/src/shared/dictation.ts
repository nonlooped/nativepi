import { z } from "zod";

// One multilingual model, pinned independently of the app's selected Pi model.
export const DICTATION_MODEL = {
  name: "Whisper Large v3 Turbo",
  filename: "whisper-large-v3-turbo-Q8_0.gguf",
  bytes: 886381760,
  sha256: "b2e30cc286bc9f3aba4db9099fc7403543497c05ce7100d0d83091ddfd25a183",
  url: "https://huggingface.co/handy-computer/whisper-large-v3-turbo-gguf/resolve/5eaf945c7978e564bae5b28a5b1639dd93c2bfb1/whisper-large-v3-turbo-Q8_0.gguf",
} as const;
export const DICTATION_SECONDS = 120;
export const DICTATION_SAMPLES = 16000 * DICTATION_SECONDS;
export const dictationStatusSchema = z.object({
  phase: z.enum(["missing", "downloading", "verifying", "ready", "error"]),
  downloaded: z.number().int().min(0).max(DICTATION_MODEL.bytes),
  error: z.string().max(2000).optional(),
});
export type DictationStatus = z.infer<typeof dictationStatusSchema>;
export const dictationAudioSchema = z.string().min(4).max(Math.ceil(DICTATION_SAMPLES * 2 / 3) * 4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/).refine(value => value.length % 4 === 0, "Invalid audio encoding");
