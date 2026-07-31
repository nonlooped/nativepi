import { existsSync, watch, type FSWatcher } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent";
import { chatTitle, isAssistant, isUser, textOf } from "../shared/messages.ts";
import type { FileEntry, SessionSearchResult, SessionSummary, UsageDashboard } from "../shared/pi-types.ts";

/**
 * Session discovery and file watching.
 *
 * Locating and summarizing sessions is Pi's job, not NativePi's: `SessionManager`
 * owns the mapping from a project directory to its session directory, and
 * re-deriving that encoding here would silently show an empty sidebar the day Pi
 * changes it. What stays local is the part Pi has no opinion on — watching one
 * file for outside writes, and refusing to delete anything outside the project.
 */

export async function readSession(sessionFile: string): Promise<FileEntry[]> {
  return parseSessionEntries(await readFile(sessionFile, "utf8")) as FileEntry[];
}

async function lastUserPrompt(sessionFile: string): Promise<string> {
  try {
    const contents = await readFile(sessionFile, "utf8");
    let end = contents.length;
    while (end > 0) {
      while (end > 0 && (contents[end - 1] === "\n" || contents[end - 1] === "\r")) end -= 1;
      if (end === 0) break;
      const start = contents.lastIndexOf("\n", end - 1) + 1;
      const line = contents.slice(start, end);
      end = start;
      try {
        const entry = JSON.parse(line) as { type?: unknown; message?: unknown };
        if (entry.type === "message" && isUser(entry.message)) return promptSummary(entry.message.content);
      } catch {
        // Pi's parser also skips malformed lines; keep looking for the latest
        // valid user message instead of losing the whole sidebar row.
      }
    }
    return "";
  } catch {
    // A session can disappear between Pi's directory scan and this read. Keep
    // the remaining list usable; the watcher will remove this row momentarily.
    return "";
  }
}

function promptSummary(content: unknown): string {
  const normalized = textOf(content).replace(/\s+/g, " ").trim();
  if (normalized) {
    const characters = [...normalized];
    return characters.length <= 160 ? normalized : `${characters.slice(0, 159).join("")}…`;
  }

  const images = Array.isArray(content)
    ? content.filter((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "image").length
    : 0;
  return images === 1 ? "Image attachment" : images > 1 ? `${images} image attachments` : "Message without text";
}

export async function listSessions(projectDir: string): Promise<SessionSummary[]> {
  const sessions = await SessionManager.list(projectDir);
  return await Promise.all(
    sessions
      // A session with no messages is a chat the user started and never used; it
      // exists on disk the moment Pi binds to it, so listing it would put a stray
      // entry in the sidebar for every abandoned one.
      .filter((session) => session.messageCount > 0)
      .map(async (session) => ({
        path: session.path,
        id: session.id,
        name: session.name,
        // Pi substitutes a placeholder when a session has no readable user text;
        // an empty string is what lets `chatTitle` fall back to "Untitled chat".
        firstMessage: session.firstMessage === "(no messages)" ? "" : session.firstMessage,
        lastPrompt: await lastUserPrompt(session.path),
        messageCount: session.messageCount,
        created: session.created.toISOString(),
        modified: session.modified.toISOString(),
      })),
  );
}

export async function searchSessions(projectDirs: string[], rawQuery: string): Promise<SessionSearchResult[]> {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query || projectDirs.length === 0) return [];

  const summaries = (await Promise.all(projectDirs.map(async (projectDir) => {
    const sessions = await listSessions(projectDir);
    return sessions.map((session) => ({ projectDir, session, title: chatTitle(session) }));
  }))).flat();
  const results: SessionSearchResult[] = summaries.flatMap(({ projectDir, session, title }) =>
    title.toLocaleLowerCase().includes(query)
      ? [{
          projectDir,
          sessionFile: session.path,
          title,
          modified: session.modified,
          match: "title" as const,
          snippet: title,
        }]
      : [],
  );

  for (const { projectDir, session, title } of summaries) {
    if (results.length >= 50 || title.toLocaleLowerCase().includes(query)) continue;
    const entries = await readSession(session.path).catch(() => []);
    for (const entry of entries) {
      if (entry.type !== "message" || (!isUser(entry.message) && !isAssistant(entry.message))) continue;
      const text = textOf(entry.message.content);
      const index = text.toLocaleLowerCase().indexOf(query);
      if (index === -1) continue;
      results.push({
        projectDir,
        sessionFile: session.path,
        title,
        modified: session.modified,
        match: entry.message.role,
        snippet: searchSnippet(text, index, rawQuery.trim().length),
      });
      break;
    }
  }

  return results
    .toSorted((a, b) => Number(a.match !== "title") - Number(b.match !== "title") || b.modified.localeCompare(a.modified))
    .slice(0, 50);
}

/**
 * Pi records the billed cost alongside every assistant message. Aggregate those
 * records instead of asking a Pi process to open each session, which keeps this
 * read-only and works for chats that are not currently running.
 */
export async function usageDashboard(projects: { path: string; name: string }[]): Promise<UsageDashboard> {
  const daily = new Map<string, number>();
  const perProject = new Map<string, { name: string; cost: number }>();
  const models = new Map<string, number>();
  const usedSessions = new Set<string>();
  const billedEntries = new Set<string>();
  const sessionRecords = (await Promise.all(projects.map(async (project) =>
    Promise.all((await listSessions(project.path)).map(async (session) => ({ project, session, entries: await readSession(session.path) }))),
  ))).flat();
  const recordsByPath = new Map(sessionRecords.map((record) => [path.resolve(record.session.path), record]));

  function lineageRoot(sessionFile: string, seen = new Set<string>()): string {
    const resolved = path.resolve(sessionFile);
    if (seen.has(resolved)) return resolved;
    seen.add(resolved);
    const header = recordsByPath.get(resolved)?.entries.find((entry) => entry.type === "session");
    const parentSession = header?.type === "session" && typeof header.parentSession === "string" ? header.parentSession : undefined;
    return parentSession && recordsByPath.has(path.resolve(parentSession))
      ? lineageRoot(parentSession, seen)
      : resolved;
  }

  for (const { project, session, entries } of sessionRecords) {
    const root = lineageRoot(session.path);
    for (const entry of entries) {
      if (entry.type !== "message" || !isAssistant(entry.message)) continue;
      const cost = entry.message.usage?.cost?.total;
      if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) continue;
      const billedEntry = `${root}\0${entry.id}`;
      if (billedEntries.has(billedEntry)) continue;

      const date = usageDate(entry.message.timestamp, entry.timestamp);
      if (!date) continue;
      billedEntries.add(billedEntry);
      usedSessions.add(session.path);
      daily.set(date, (daily.get(date) ?? 0) + cost);
      const projectTotal = perProject.get(project.path) ?? { name: project.name, cost: 0 };
      projectTotal.cost += cost;
      perProject.set(project.path, projectTotal);
      const model = entry.message.provider && entry.message.model
        ? `${entry.message.provider}/${entry.message.model}`
        : entry.message.model ?? "Unknown model";
      models.set(model, (models.get(model) ?? 0) + cost);
    }
  }

  const byCost = <T extends { cost: number }>(a: T, b: T) => b.cost - a.cost;
  const projectTotals = [...perProject.entries()]
    .map(([path, value]) => ({ path, ...value }))
    .toSorted(byCost);
  const modelTotals = [...models.entries()]
    .map(([name, cost]) => ({ name, cost }))
    .toSorted(byCost);
  const dailyTotals = [...daily.entries()]
    .map(([date, cost]) => ({ date, cost }))
    .toSorted((a, b) => a.date.localeCompare(b.date));

  return {
    totalCost: projectTotals.reduce((total, project) => total + project.cost, 0),
    sessions: usedSessions.size,
    daily: dailyTotals,
    projects: projectTotals,
    models: modelTotals,
  };
}

function usageDate(messageTimestamp: number | undefined, entryTimestamp: string): string | null {
  const timestamp = typeof messageTimestamp === "number" ? messageTimestamp : Date.parse(entryTimestamp);
  if (!Number.isFinite(timestamp)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function searchSnippet(text: string, matchIndex: number, matchLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const prefixLength = text.slice(0, matchIndex).replace(/\s+/g, " ").trimStart().length;
  const start = Math.max(0, prefixLength - 64);
  const end = Math.min(compact.length, prefixLength + matchLength + 96);
  return `${start > 0 ? "…" : ""}${compact.slice(start, end).trim()}${end < compact.length ? "…" : ""}`;
}

export async function deleteSession(projectDir: string, sessionFile: string): Promise<void> {
  // Refuse anything that is not one of this project's own sessions: the renderer
  // supplies this path, and a delete is not recoverable. Membership is checked
  // against Pi's own listing rather than against a path shape we would other-
  // wise have to keep in sync with Pi forever.
  const resolved = path.resolve(sessionFile);
  const sessions = await SessionManager.list(projectDir);
  if (!sessions.some((session) => path.resolve(session.path) === resolved)) {
    throw new Error("That chat does not belong to this project.");
  }
  await rm(resolved, { force: true });
}

/**
 * Watch a project's session directory, including the point where it is first
 * created. Pi owns the directory layout; `SessionManager.create` gives us its
 * computed default rather than duplicating its path encoding.
 */
export function watchProjectSessions(projectDir: string, onChange: () => void): () => void {
  const sessionDir = SessionManager.create(projectDir).getSessionDir();
  let watcher: FSWatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const notify = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  };
  const watchDirectory = () => {
    watcher?.close();
    let directory = sessionDir;
    while (!existsSync(directory)) {
      const parent = path.dirname(directory);
      if (parent === directory) return;
      directory = parent;
    }
    const watchingSessions = directory === sessionDir;
    try {
      watcher = watch(directory, { persistent: false }, () => {
        if (stopped) return;
        watchDirectory();
        if (watchingSessions || existsSync(sessionDir)) notify();
      });
      watcher.on("error", () => watcher?.close());
    } catch {
      // The nearest existing ancestor disappeared between the existence check
      // and installing its watcher. The next sidebar mount retries it.
    }
  };
  watchDirectory();
  return () => {
    stopped = true;
    clearTimeout(timer);
    watcher?.close();
  };
}

export async function sessionMtime(sessionFile: string): Promise<number> {
  try {
    return (await stat(sessionFile)).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Watch one session file for writes.
 *
 * Pi rewrites the file through its own process, so `onChange` fires for our own
 * turns too; attribution is the caller's job (it knows whether its Pi is busy).
 * Coalesced on a short timer because a single append can emit several events.
 */
export function watchSessionFile(sessionFile: string, onChange: (mtimeMs: number) => void): () => void {
  let watcher: FSWatcher;
  try {
    watcher = watch(sessionFile, { persistent: false });
  } catch {
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  watcher.on("change", () => {
    clearTimeout(timer);
    timer = setTimeout(() => void sessionMtime(sessionFile).then(onChange), 150);
  });
  watcher.on("error", () => watcher.close());
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}
