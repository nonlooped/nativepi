import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { browserRelaySchema } from "../../shared/background-service.ts";
type Command = z.infer<typeof browserRelaySchema>;
let desktop: ((command: Command) => Promise<unknown>) | undefined;
export function attachBrowserDesktop(send: NonNullable<typeof desktop>) {
  desktop = send;
  return () => { if (desktop === send) desktop = undefined; };
}
/** The host retains runtime ownership; live web contents belong to the desktop. */
export class SharedBrowser {
  private id = randomUUID();
  private closed = false;
  annotationTarget?: Command["annotationTarget"];
  private ownerTitle = "New Work chat";
  private async send(method: Command["method"], input?: unknown) {
    const send = desktop;
    if (!send) throw new Error("Open NativePi on this computer to use the shared browser.");
    const { preferences } = await (await import("../state.ts")).loadState();
    if (this.closed && method !== "dispose") throw new Error("Browser closed.");
    return send({ type: "browser", id: randomUUID(), browser: this.id, method, input, ownerTitle: this.ownerTitle, annotationTarget: this.annotationTarget, preferences });
  }
  setOwner(title: string) { this.ownerTitle = title; }
  show() { return this.send("show"); }
  chrome(input: unknown) { return this.send("chrome", input); }
  async run(input: unknown, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error("Browser cancelled.");
    let cancel: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      cancel = () => { this.cancel(); reject(new Error("Browser cancelled; inspect before retrying.")); };
      signal?.addEventListener("abort", cancel, { once: true });
    });
    try { return await Promise.race([this.send("run", input), aborted]); }
    finally { if (cancel) signal?.removeEventListener("abort", cancel); }
  }
  cancel() { void this.send("cancel").catch(() => {}); }
  dispose() { this.closed = true; void this.send("dispose").catch(() => {}); }
}
