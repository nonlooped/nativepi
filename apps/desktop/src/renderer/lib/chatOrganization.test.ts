import { expect, test } from "bun:test";
import type { SessionSummary } from "../../shared/pi-types.ts";
import { groupChats, togglePinnedPath } from "./chatOrganization.ts";

const NOW = new Date(2026, 6, 30, 12).getTime();

function session(path: string, title: string, modified: Date): SessionSummary {
  return {
    path,
    id: path,
    firstMessage: title,
    lastPrompt: `Latest prompt in ${title}`,
    providers: [],
    messageCount: 2,
    created: modified.toISOString(),
    modified: modified.toISOString(),
  };
}

test("groups pinned chats, then recent chats, then today's older chats", () => {
  const sessions = [
    session("recent", "Recent", new Date(2026, 6, 30, 10)),
    session("today", "Today", new Date(2026, 6, 30, 8)),
    session("week", "Week", new Date(2026, 6, 28, 9)),
    session("old", "Old", new Date(2026, 5, 1, 9)),
  ];

  expect(groupChats(sessions, ["old"], "", null, NOW).map((group) => ({
    label: group.label,
    paths: group.sessions.map((chat) => chat.path),
  }))).toEqual([
    { label: "Pinned", paths: ["old"] },
    { label: "Recent", paths: ["recent"] },
    { label: "Today", paths: ["today"] },
    { label: "This week", paths: ["week"] },
  ]);
});

test("keeps chats at the three-hour boundary in Recent", () => {
  const sessions = [
    session("at-boundary", "At boundary", new Date(2026, 6, 30, 9)),
    session("outside", "Outside", new Date(2026, 6, 30, 8, 59, 59)),
  ];

  expect(groupChats(sessions, [], "", null, NOW).map((group) => ({
    label: group.label,
    paths: group.sessions.map((chat) => chat.path),
  }))).toEqual([
    { label: "Recent", paths: ["at-boundary"] },
    { label: "Today", paths: ["outside"] },
  ]);
});

test("filtering by title keeps the selected chat visible as an orientation anchor", () => {
  const sessions = [
    session("matching", "Release planning", new Date(2026, 6, 30, 9)),
    session("selected", "Database cleanup", new Date(2026, 5, 1, 9)),
    session("hidden", "Typography", new Date(2026, 5, 1, 8)),
  ];

  const groups = groupChats(sessions, [], "release", "selected", NOW);
  expect(groups.flatMap((group) => group.sessions.map((chat) => chat.path))).toEqual(["matching", "selected"]);
});

test("pinning is reversible and does not reorder the stored paths", () => {
  expect(togglePinnedPath(["one"], "two")).toEqual(["one", "two"]);
  expect(togglePinnedPath(["one", "two"], "one")).toEqual(["two"]);
});
