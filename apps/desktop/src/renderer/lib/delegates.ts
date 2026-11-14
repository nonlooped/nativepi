import type { ThreadSnapshot } from "../../shared/orchestration.ts";

export function delegateStatus(thread: ThreadSnapshot["delegates"][number]): string {
  const state = thread.assignment?.state ?? thread.status;
  const labels = { preparing: "Preparing", running: "Running", waiting: "Waiting for lead", completed: "Completed", stopped: "Stopped", failed: "Failed", interrupted: "Interrupted" };
  return state ? labels[state] : thread.running ? "Running" : "Preparing";
}
