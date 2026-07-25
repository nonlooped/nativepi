import { useEffect, useRef } from "react";
import { formatElapsed, pluralize } from "./format.ts";
import { useAppStore } from "./store.ts";

export function useTurnCompletionSignal(): void {
  const running = useAppStore((s) => s.running);
  const wasRunning = useRef(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      startedAt.current = useAppStore.getState().runStartedAt ?? Date.now();
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;

    const state = useAppStore.getState();
    const elapsed = startedAt.current ? formatElapsed(Date.now() - startedAt.current) : "";
    startedAt.current = null;
    if (document.hasFocus()) return;
    if (typeof Notification === "undefined" || Notification.permission === "denied") return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
      return;
    }

    const changed = state.git?.isRepo ? state.git.files.length : 0;
    const detail = [elapsed && `Finished in ${elapsed}`, changed > 0 && `${pluralize(changed, "file")} changed`]
      .filter(Boolean)
      .join(" · ");

    try {
      new Notification("NativePi", { body: detail || "The agent finished its turn.", silent: false });
    } catch {
    }
  }, [running]);
}
