import type { TuiHostFrame } from "../../../shared/tui-frames.ts";

type Write = (line: string, done: (error?: Error | null) => void) => unknown;
const RETRY_MS = 10;
const MAX_RETRIES = 100;
function transient(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return code === "EAGAIN" || code === "EWOULDBLOCK";
}

/** Owns only NativePi's side channel, independent of Pi's RPC output writer. */
export function createFrameWriter(write: Write, onError: (error: unknown) => void) {
  const queue: string[] = [];
  let disposed = false;
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelAttempt: (() => void) | undefined;
  function dispose(error?: unknown): void {
    if (disposed)
      return;
    disposed = true;
    clearTimeout(timer);
    cancelAttempt?.();
    queue.length = 0;
    if (error !== undefined)
      onError(error);
  }
  function pump(): void {
    if (disposed || active || queue.length === 0)
      return;
    active = true;
    const line = queue.shift()!;
    let retries = 0;
    const attempt = () => {
      if (disposed)
        return;
      let settled = false;
      cancelAttempt = () => { settled = true; };
      const done = (error?: Error | null) => {
        if (settled || disposed)
          return;
        settled = true;
        cancelAttempt = undefined;
        if (!error) {
          active = false;
          // A writer may call back synchronously; avoid recursion through the queue.
          queueMicrotask(pump);
          return;
        }
        // Windows can report a full pipe as a transient write failure.
        if (transient(error) && retries++ < MAX_RETRIES) {
          timer = setTimeout(attempt, RETRY_MS);
          timer.unref?.();
        }
        else
          dispose(error);
      };
      try { write(line, done); }
      catch (error) { done(error instanceof Error ? error : new Error(String(error))); }
    };
    attempt();
  }
  return {
    send(frame: TuiHostFrame): void {
      if (disposed)
        return;
      queue.push(`${JSON.stringify(frame)}\n`);
      pump();
    },
    handleError(error: unknown): void {
      // Writable emits an error after invoking its write callback; that attempt owns retries.
      if (!transient(error))
        dispose(error);
    },
    dispose,
  };
}
