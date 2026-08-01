import type { SessionSummary } from "../../shared/pi-types.ts";
import { chatTitle } from "./transcript.ts";

const RECENT_WINDOW_MS = 3 * 60 * 60 * 1000;

export interface ChatGroup {
  label: "Pinned" | "Recent" | "Today" | "This week" | "Older";
  sessions: SessionSummary[];
}

export function togglePinnedPath(paths: string[], sessionFile: string): string[] {
  return paths.includes(sessionFile)
    ? paths.filter((path) => path !== sessionFile)
    : [...paths, sessionFile];
}

export function groupChats(
  sessions: SessionSummary[],
  pinnedChats: string[],
  query: string,
  activeSessionFile: string | null,
  now: number,
): ChatGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = normalizedQuery
    ? sessions.filter(
        (session) =>
          session.path === activeSessionFile ||
          chatTitle(session).toLocaleLowerCase().includes(normalizedQuery),
      )
    : sessions;
  const pinned = new Set(pinnedChats);
  const recentCutoff = now - RECENT_WINDOW_MS;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));

  const groups: ChatGroup[] = [
    { label: "Pinned", sessions: [] },
    { label: "Recent", sessions: [] },
    { label: "Today", sessions: [] },
    { label: "This week", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const session of visible) {
    if (pinned.has(session.path)) {
      groups[0]!.sessions.push(session);
      continue;
    }
    const modified = new Date(session.modified).getTime();
    if (modified >= recentCutoff) groups[1]!.sessions.push(session);
    else if (modified >= startOfToday.getTime()) groups[2]!.sessions.push(session);
    else if (modified >= startOfWeek.getTime()) groups[3]!.sessions.push(session);
    else groups[4]!.sessions.push(session);
  }

  return groups.filter((group) => group.sessions.length > 0);
}
