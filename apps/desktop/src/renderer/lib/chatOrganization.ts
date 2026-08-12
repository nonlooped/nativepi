import type { SessionSummary } from "../../shared/pi-types.ts";
import { chatTitle } from "./transcript.ts";

export interface ChatGroup {
  label: "Pinned" | "Today" | "Yesterday" | "Previous 7 days" | "Older";
  sessions: SessionSummary[];
}

/** How many chats a query actually matched, not counting the open one it always keeps. */
export function countMatches(sessions: SessionSummary[], query: string): number {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return sessions.length;
  return sessions.filter((session) => chatTitle(session).toLocaleLowerCase().includes(normalizedQuery)).length;
}

export function togglePinnedPath(paths: string[], sessionFile: string): string[] {
  return paths.includes(sessionFile)
    ? paths.filter((path) => path !== sessionFile)
    : [...paths, sessionFile];
}

/** Existing chats start finished; only chats created after the feature's first run enter focus automatically. */
export function isChatFinished(
  created: string,
  sessionFile: string,
  focusStartedAt: string,
  finishedAt: string | undefined,
  focusedChats: string[],
) {
  if (focusedChats.includes(sessionFile)) return false;
  return finishedAt !== undefined || Date.parse(created) <= Date.parse(focusStartedAt);
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
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const startOfPreviousSevenDays = new Date(startOfToday);
  startOfPreviousSevenDays.setDate(startOfToday.getDate() - 7);

  const groups: ChatGroup[] = [
    { label: "Pinned", sessions: [] },
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "Previous 7 days", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const session of visible) {
    if (pinned.has(session.path)) {
      groups[0]!.sessions.push(session);
      continue;
    }
    const modified = new Date(session.modified).getTime();
    if (modified >= startOfToday.getTime()) groups[1]!.sessions.push(session);
    else if (modified >= startOfYesterday.getTime()) groups[2]!.sessions.push(session);
    else if (modified >= startOfPreviousSevenDays.getTime()) groups[3]!.sessions.push(session);
    else groups[4]!.sessions.push(session);
  }

  return groups.filter((group) => group.sessions.length > 0);
}
