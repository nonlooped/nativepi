import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { DICTATION_MODEL, type DictationStatus } from "../shared/dictation.ts";

/** Only a verified, complete download is ever published at the model path. */
export class DictationModel {
  private state: DictationStatus = { phase: "missing", downloaded: 0 };
  private installing = false;
  private verifiedFile?: string;
  readonly path: string;
  constructor(private directory: string, private publish: (status: DictationStatus) => void, private fetchModel: typeof fetch = fetch, private model: { filename: string; bytes: number; sha256: string; url: string } = DICTATION_MODEL) {
    this.path = join(directory, model.filename);
  }
  async status(): Promise<DictationStatus> {
    if (!this.installing && this.state.phase !== "error") {
      const file = await stat(this.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (file?.size === this.model.bytes) {
        const revision = `${file.ino}:${file.mtimeMs}:${file.ctimeMs}`;
        if (this.verifiedFile !== revision) {
          const hash = createHash("sha256");
          for await (const chunk of createReadStream(this.path)) hash.update(chunk);
          if (hash.digest("hex") !== this.model.sha256) {
            this.state = { phase: "error", downloaded: 0, error: "The installed speech model is damaged. Download it again." };
            return this.state;
          }
          this.verifiedFile = revision;
        }
        this.state = { phase: "ready", downloaded: this.model.bytes };
      } else this.state = { phase: "missing", downloaded: 0 };
    }
    return this.state;
  }
  private update(status: DictationStatus) { this.state = status; this.publish(status); }
  async install(signal: AbortSignal): Promise<DictationStatus> {
    if (this.installing) throw new Error("A dictation model download is already running.");
    if ((await this.status()).phase === "ready") return this.state;
    if (this.installing) throw new Error("A dictation model download is already running.");
    signal.throwIfAborted();
    this.installing = true;
    const partial = `${this.path}.download`;
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      this.update({ phase: "downloading", downloaded: 0 });
      await mkdir(this.directory, { recursive: true });
      file = await open(partial, "w", 0o600);
      const response = await this.fetchModel(this.model.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]) });
      if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Check your connection and try again.`);
      const hash = createHash("sha256");
      let downloaded = 0;
      let publishedAt = 0;
      for await (const chunk of response.body) {
        signal.throwIfAborted();
        downloaded += chunk.byteLength;
        if (downloaded > this.model.bytes) throw new Error("The downloaded model has an unexpected size. Try again.");
        hash.update(chunk);
        await file.writeFile(chunk);
        if (Date.now() - publishedAt >= 100) {
          this.update({ phase: "downloading", downloaded });
          publishedAt = Date.now();
        }
      }
      this.update({ phase: "verifying", downloaded });
      if (downloaded !== this.model.bytes || hash.digest("hex") !== this.model.sha256)
        throw new Error("The model download is incomplete or damaged. Try downloading again.");
      await file.sync();
      await file.close();
      file = undefined;
      signal.throwIfAborted();
      await rename(partial, this.path);
      this.update({ phase: "ready", downloaded });
    } catch (error) {
      this.update(signal.aborted ? { phase: "missing", downloaded: 0 }
        : { phase: "error", downloaded: 0, error: (error instanceof Error ? error.message : String(error)).slice(0, 2000) });
    } finally {
      await file?.close();
      await rm(partial, { force: true });
      this.installing = false;
    }
    return this.state;
  }
}
