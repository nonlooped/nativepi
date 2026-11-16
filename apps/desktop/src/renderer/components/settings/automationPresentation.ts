import type {
  AutomationInput,
  AutomationRun,
} from "../../../shared/automations.ts";
export function triggerLabel(trigger: AutomationInput["trigger"]) {
  if (trigger.kind === "github")
    return `${trigger.repository} · ${/^\d+$/.test(trigger.target) ? `PR #${trigger.target}` : trigger.target}`;
  if (trigger.kind === "once")
    return `Once · ${new Date(trigger.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  const day =
    trigger.kind === "weekly"
      ? [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ][trigger.weekday]
      : "Daily";
  return `${day} at ${trigger.time} · ${trigger.timezone}`;
}
export const runLabels: Record<AutomationRun["status"], string> = {
  preparing: "Preparing",
  dispatched: "Running",
  "needs-review": "Needs review",
  failed: "Failed",
  skipped: "Skipped",
  stopped: "Stopped",
  interrupted: "Interrupted",
};
