import { useEffect } from "react";
import { isAssistant } from "../../shared/messages.ts";
import { formatElapsed } from "./format.ts";
import { useAppStore } from "./store.ts";

type CompletionStore = Pick<typeof useAppStore, "getState" | "subscribe">;

/** Desktop owns delivery, so connected Local Access tabs never duplicate it. */
export function subscribeTurnCompletion(store: CompletionStore = useAppStore): () => void {
  if (!window.nativepi) return () => {};
  const running = new Map(Object.entries(store.getState().conversations).map(([key, chat]) =>
    [key, { running: chat.running, startedAt: chat.runStartedAt }]));
  const notifications = new Set<Notification>();
  let disposed = false;
  const report = (error: unknown) => console.warn("NativePi completion notification failed", error);
  const unsubscribe = store.subscribe((state) => {
    for (const [key, chat] of Object.entries(state.conversations)) {
      const previous = running.get(key);
      running.set(key, { running: chat.running, startedAt: chat.runStartedAt });
      if (!previous?.running || chat.running || chat.aborted || !chat.sessionFile || !chat.projectDir) continue;
      if (!state.preferences.notifyOnTurnEnd) continue;
      if (key === (state.activeSessionFile ?? state.activeProjectPath) && document.hasFocus()) continue;
      const sessionFile = chat.sessionFile, projectDir = chat.projectDir;
      const summary = state.sessionsByProject[projectDir]?.find(session => session.path === sessionFile);
      const title = chat.sessionName || summary?.name || summary?.firstMessage || "Untitled chat";
      const project = projectDir === state.chatRoot ? "Chat" : projectDir === state.workRoot ? "No project"
        : state.projects.find(project => project.path === projectDir)?.name || projectDir.split(/[\\/]/).filter(Boolean).at(-1) || projectDir;
      const elapsed = previous.startedAt ? formatElapsed(Date.now() - previous.startedAt) : "";
      const lastAssistant = chat.entries.findLast(entry => entry.type === "message" && isAssistant(entry.message));
      const failed = lastAssistant?.type === "message" && isAssistant(lastAssistant.message) && lastAssistant.message.stopReason === "error";
      const outcome = chat.error || failed ? "Failed" : "Finished";
      const body = `${project} · ${outcome}${elapsed ? ` in ${elapsed}` : ""}`;
      const deliver = () => {
        if (disposed || !store.getState().preferences.notifyOnTurnEnd) return;
        try {
          const notification = new Notification(title.replace(/\s+/g, " ").slice(0, 160), {
            body, silent: !store.getState().preferences.notificationSound, tag: `nativepi:${sessionFile}`,
          });
          notifications.add(notification);
          notification.onclose = () => notifications.delete(notification);
          notification.onerror = report;
          notification.onclick = () => {
            notification.close();
            notifications.delete(notification);
            void window.nativepi?.focusWindow?.().catch(report);
            void store.getState().selectChat(sessionFile, projectDir).catch(report);
          };
        } catch (error) { report(error); }
      };
      if (typeof Notification === "undefined" || Notification.permission === "denied") continue;
      if (Notification.permission === "default") {
        try {
          void Notification.requestPermission().then(permission => {
            if (permission === "granted") deliver();
          }).catch(report);
        } catch (error) { report(error); }
      } else deliver();
    }
    for (const key of running.keys()) if (!state.conversations[key]) running.delete(key);
  });
  return () => {
    disposed = true;
    unsubscribe();
    for (const notification of notifications) notification.close();
    notifications.clear();
  };
}

/** Notify for any chat that finishes, including work continuing in the background. */
export function useTurnCompletionSignal(): void {
  useEffect(() => subscribeTurnCompletion(), []);
}
