import { expect, test } from "bun:test";
import type { SessionSummary } from "../../shared/pi-types.ts";
import { countMatches, groupChats, togglePinnedPath } from "./chatOrganization.ts";

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

test("groups chats by calendar date rather than an hour threshold", () => {
  const sessions = [
    session("today-late", "Today late", new Date(2026, 6, 30, 10)),
    session("today-early", "Today early", new Date(2026, 6, 30, 1)),
    session("yesterday", "Yesterday", new Date(2026, 6, 29, 9)),
    session("week", "Week", new Date(2026, 6, 28, 9)),
    session("old", "Old", new Date(2026, 5, 1, 9)),
  ];

  expect(groupChats(sessions, ["old"], "", null, NOW).map((group) => ({
    label: group.label,
    paths: group.sessions.map((chat) => chat.path),
  }))).toEqual([
    { label: "Pinned", paths: ["old"] },
    { label: "Today", paths: ["today-late", "today-early"] },
    { label: "Yesterday", paths: ["yesterday"] },
    { label: "Previous 7 days", paths: ["week"] },
  ]);
});

test("uses midnight as the Today boundary", () => {
  const sessions = [
    session("today", "Today", new Date(2026, 6, 30, 0)),
    session("yesterday", "Yesterday", new Date(2026, 6, 29, 23, 59, 59)),
  ];

  expect(groupChats(sessions, [], "", null, NOW).map((group) => ({
    label: group.label,
    paths: group.sessions.map((chat) => chat.path),
  }))).toEqual([
    { label: "Today", paths: ["today"] },
    { label: "Yesterday", paths: ["yesterday"] },
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

test("counts matches without the open chat the list always keeps", () => {
  const sessions = [
    session("a", "Refactor the parser", new Date(2026, 6, 30, 10)),
    session("b", "Fix the composer", new Date(2026, 6, 30, 9)),
  ];

  expect(countMatches(sessions, "parser")).toBe(1);
  expect(countMatches(sessions, "")).toBe(2);
  // The active chat survives the filter for continuity, but it is not a match,
  // and counting the rows on screen reported "1 result" for a query that found
  // nothing.
  expect(countMatches(sessions, "nothing here")).toBe(0);
  const groups = groupChats(sessions, [], "nothing here", "a", NOW);
  expect(groups.flatMap((group) => group.sessions.map((s) => s.path))).toEqual(["a"]);
});
