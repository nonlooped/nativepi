import { useEffect } from "react";
import { formatElapsed } from "./format.ts";
import { useAppStore } from "./store.ts";

function notifyFinished(elapsed: string, sound: boolean): void {
  if (typeof Notification === "undefined" || Notification.permission === "denied") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
    return;
  }
  try {
    new Notification("NativePi", {
      body: elapsed ? `Finished in ${elapsed}` : "The agent finished its turn.",
      silent: !sound,
    });
  } catch {}
}

/** Notify for any chat that finishes, including work continuing in the background. */
export function useTurnCompletionSignal(): void {
  useEffect(() => {
    const initial = useAppStore.getState();
    const running = new Map(Object.entries(initial.conversations).map(([key, conversation]) => [
      key,
      { running: conversation.running, startedAt: conversation.runStartedAt },
    ]));

    return useAppStore.subscribe((state) => {
      for (const [key, conversation] of Object.entries(state.conversations)) {
        const previous = running.get(key);
        running.set(key, { running: conversation.running, startedAt: conversation.runStartedAt });
        if (!previous?.running || conversation.running) continue;
        if (!state.preferences.notifyOnTurnEnd) continue;
        const activeKey = state.activeSessionFile ?? state.activeProjectPath;
        const foreground = conversation.projectDir === state.activeProjectPath && key === activeKey;
        if (foreground && document.hasFocus()) continue;
        const elapsed = previous.startedAt ? formatElapsed(Date.now() - previous.startedAt) : "";
        notifyFinished(elapsed, state.preferences.notificationSound);
      }
      for (const key of running.keys()) {
        if (!state.conversations[key]) running.delete(key);
      }
    });
  }, []);
}
