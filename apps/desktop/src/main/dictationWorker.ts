// A separate entry: native inference and driver failures must never take down Electron.
import { z } from "zod";
import { dictationAudioSchema, DICTATION_SAMPLES } from "../shared/dictation.ts";
import { join } from "node:path";

process.once("message", async (input: unknown) => {
  try {
    const { path, audio } = z.object({ path: z.string().min(1), audio: dictationAudioSchema }).parse(input);
    const bytes = Buffer.from(audio, "base64");
    if (bytes.length % 2 || bytes.length < 3200 || bytes.length / 2 > DICTATION_SAMPLES || bytes.toString("base64") !== audio)
      throw new Error("Invalid dictation audio.");
    const pcm = new Float32Array(bytes.length / 2);
    let energy = 0;
    for (let i = 0; i < pcm.length; i++) { pcm[i] = bytes.readInt16LE(i * 2) / 32768; energy += pcm[i] ** 2; }
    // Do not ask a generative recognizer to invent words for an empty recording.
    if (Math.sqrt(energy / pcm.length) < 0.001) {
      process.send?.({ text: "" });
      return;
    }
    const speech = await import("transcribe-cpp");
    const directory = speech.artifactDir().replace(/\.asar([\\/])/g, ".asar.unpacked$1");
    process.env.TRANSCRIBE_LIBRARY = join(directory, process.platform === "win32" ? "transcribe.dll" : process.platform === "darwin" ? "libtranscribe.dylib" : "libtranscribe.so");
    const model = await speech.TranscribeModel.load(path, { backend: "auto" });
    const result = await model.transcribe(pcm, { timestamps: "none", family: { kind: "whisper", temperature: 0 } });
    process.send?.({ text: result.text.trim() });
    // Parent kills the process after receiving the result. Never dispose during native work.
  } catch (error) {
    process.send?.({ error: error instanceof Error ? error.message : String(error) });
  }
});
process.on("disconnect", () => process.kill(process.pid, "SIGKILL"));
