import { expect, test } from "bun:test";
import { DICTATION_SAMPLES, dictationAudioSchema, dictationStatusSchema } from "./dictation.ts";

test("audio requests accept the recording limit and reject oversized payloads", () => {
  const audio = Buffer.alloc(DICTATION_SAMPLES * 2).toString("base64");
  expect(dictationAudioSchema.safeParse(audio).success).toBe(true);
  expect(dictationAudioSchema.safeParse(audio + "AAAA").success).toBe(false);
});
test("audio requests reject malformed encodings", () => {
  for (const value of ["", "AAAAA", "AA=A", "====", "AA\nA", "音声"])
    expect(dictationAudioSchema.safeParse(value).success).toBe(false);
});
test("installation events reject invalid phases and impossible progress", () => {
  expect(dictationStatusSchema.safeParse({ phase: "ready", downloaded: -1 }).success).toBe(false);
  expect(dictationStatusSchema.safeParse({ phase: "downloading", downloaded: 1e12 }).success).toBe(false);
  expect(dictationStatusSchema.safeParse({ phase: "unknown", downloaded: 0 }).success).toBe(false);
});
