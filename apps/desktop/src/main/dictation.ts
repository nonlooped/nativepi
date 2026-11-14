import { app, systemPreferences } from "electron";
import { fork } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import type { ClientLeases } from "./clientLeases.ts";
import { DictationModel } from "./dictationModel.ts";
import type { DictationStatus } from "../shared/dictation.ts";

export class Dictation {
  private model?: DictationModel;
  private active?: { client: ClientLeases; id: string; controller: AbortController };
  constructor(private publish: (status: DictationStatus) => void) {}
  private store() { return this.model ??= new DictationModel(join(app.getPath("userData"), "speech"), this.publish); }
  status() { return this.store().status(); }
  async install(client: ClientLeases, id: string) {
    return this.operation(client, id, signal => this.store().install(signal));
  }
  cancel(client: ClientLeases, id: string) {
    if (this.active?.client === client && this.active.id === id) this.active.controller.abort();
    return { ok: true as const };
  }
  private async operation<T>(client: ClientLeases, id: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.active) throw new Error("Dictation is already busy. Finish or cancel it first.");
    const active = { client, id, controller: new AbortController() };
    this.active = active;
    const key = `dictation:${id}`;
    client.acquire(key, () => active.controller.abort());
    try { active.controller.signal.throwIfAborted(); return await run(active.controller.signal); }
    finally { if (this.active === active) this.active = undefined; client.release(key); }
  }
  async transcribe(client: ClientLeases, id: string, audio: string): Promise<{ text: string }> {
    return this.operation(client, id, async signal => {
      if ((await this.status()).phase !== "ready") throw new Error("Download the dictation model first.");
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        const child = fork(join(app.getAppPath(), "out/main/dictation-worker.js"), [], {
          execPath: process.execPath, execArgv: [],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        });
        let settled = false;
        const finish = (error?: Error, text = "") => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
          child.kill("SIGKILL");
          if (error) reject(error); else resolve({ text });
        };
        const cancel = () => finish(new Error("Dictation cancelled."));
        const timer = setTimeout(() => finish(new Error("Transcription took too long. Try a shorter recording.")), 180_000);
        signal.addEventListener("abort", cancel, { once: true });
        child.once("error", error => finish(error));
        child.once("exit", () => finish(new Error("The speech engine stopped unexpectedly. Try again.")));
        child.once("message", (message: unknown) => {
          const reply = z.union([z.object({ text: z.string().max(100000) }), z.object({ error: z.string() })]).safeParse(message);
          if (!reply.success) finish(new Error("The speech engine returned an invalid result."));
          else if ("error" in reply.data) finish(new Error(`Transcription failed: ${reply.data.error}`));
          else finish(undefined, reply.data.text);
        });
        if (signal.aborted) cancel();
        else child.send({ path: this.store().path, audio }, error => { if (error) finish(error); });
      });
    });
  }
}

export async function dictationMicrophone() {
  if (process.platform === "darwin" && !await systemPreferences.askForMediaAccess("microphone"))
    throw new Error("Allow microphone access for NativePi in System Settings → Privacy & Security → Microphone, then restart NativePi.");
  return { ok: true as const };
}
