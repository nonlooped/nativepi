import type { AutomationInput } from "../../shared/automations.ts";
/** Scan UTC minutes through Intl: nonexistent wall times are skipped; repeated
 * DST minutes dispatch once per local date (the next search begins after it). */
export function nextOccurrence(
  trigger: AutomationInput["trigger"],
  after: number,
): number | null {
  if (trigger.kind === "github") return null;
  if (trigger.kind === "once")
    return Date.parse(trigger.at) > after ? Date.parse(trigger.at) : null;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: trigger.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = (n: number) =>
    Object.fromEntries(fmt.formatToParts(n).map((p) => [p.type, p.value]));
  const previous = parts(after),
    date = `${previous.year}-${previous.month}-${previous.day}`;
  for (
    let n = Math.floor(after / 60000) * 60000 + 60000;
    n <= after + 9 * 86400000;
    n += 60000
  ) {
    const p = parts(n);
    if (`${p.hour}:${p.minute}` !== trigger.time) continue;
    if (
      trigger.kind === "weekly" &&
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday!) !==
        trigger.weekday
    )
      continue;
    if (
      `${p.year}-${p.month}-${p.day}` === date &&
      `${previous.hour}:${previous.minute}` >= trigger.time
    )
      continue;
    return n;
  }
  throw new Error("No schedule occurrence in the next nine days");
}
