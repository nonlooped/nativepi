import { randomUUID } from "node:crypto";
import { orchestrationReplySchema } from "../../../shared/orchestration.ts";
declare global {
  var __NATIVEPI_ORCHESTRATION_SESSION__: string | undefined;
  var __NATIVEPI_DISPATCH_FENCED__: boolean | undefined;
  var __NATIVEPI_ORCHESTRATION__: ((action: string, params: Record<string, unknown>, operationId: string, signal?: AbortSignal) => Promise<unknown>) | undefined;
}
/** Private fork IPC, independent of stdout RPC and extension frame deadlines. */
export function installOrchestrationChannel(): void {
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }>();
  process.on("message", (raw: unknown) => {
    const parsed = orchestrationReplySchema.safeParse(raw);
    if (!parsed.success) return;
    const waiter = pending.get(parsed.data.requestId);
    pending.delete(parsed.data.requestId); waiter?.cleanup();
    if (parsed.data.error) waiter?.reject(new Error(parsed.data.error)); else waiter?.resolve(parsed.data.result);
  });
  process.once("disconnect", () => {
    for (const waiter of pending.values()) { waiter.cleanup(); waiter.reject(new Error("NativePi host disconnected")); }
    pending.clear();
  });
  globalThis.__NATIVEPI_ORCHESTRATION__ = (action, params, operationId, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Request cancelled")); return; }
    if (!process.connected || !process.send) { reject(new Error("NativePi host unavailable")); return; }
    const requestId = randomUUID();
    const cancel = () => {
      pending.delete(requestId); process.send?.({ type: "nativepi_orchestration_cancel", requestId });
      reject(new Error("Orchestration request cancelled"));
    };
    pending.set(requestId, { resolve, reject, cleanup: () => signal?.removeEventListener("abort", cancel) });
    signal?.addEventListener("abort", cancel, { once: true });
    process.send({ type: "nativepi_orchestration_request", requestId, operationId, action, params }, error => {
      if (!error) return;
      const waiter = pending.get(requestId); pending.delete(requestId); waiter?.cleanup(); waiter?.reject(error);
    });
  });
}
