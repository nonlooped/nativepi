import { createReadStream, existsSync, watch, type FSWatcher } from "node:fs";
import { open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent";
import { chatTitle, isAssistant, isUser, sessionPromptSummary, textOf } from "../shared/messages.ts";
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

// Cache lastPrompt/providers by mtime so repeated listSessions (Sidebar mount + sessionsChanged)
// does not re-read every file when only one changed.
const sidebarFieldsCache = new Map<string, { mtimeMs: number; result: { lastPrompt: string; providers: string[] } }>();
const sessionListCache = new Map<string, Promise<SessionSummary[]>>();

async function sessionSidebarFields(sessionFile: string, knownMtimeMs?: number): Promise<{ lastPrompt: string; providers: string[] }> {
  const mtimeMs = knownMtimeMs ?? (await sessionMtime(sessionFile));
  const cached = sidebarFieldsCache.get(sessionFile);
  if (cached && cached.mtimeMs === mtimeMs) return cached.result;
  const result = await sessionSidebarFieldsUncached(sessionFile);
  sidebarFieldsCache.set(sessionFile, { mtimeMs, result });
  // Bound growth: a machine with thousands of sessions should not keep them all.
  if (sidebarFieldsCache.size > 500) {
    const first = sidebarFieldsCache.keys().next().value as string | undefined;
    if (first) sidebarFieldsCache.delete(first);
  }
  return result;
}

async function sessionSidebarFieldsUncached(sessionFile: string): Promise<{ lastPrompt: string; providers: string[] }> {
  try {
    const contents = await readFile(sessionFile, "utf8");
    let lastPrompt = "";
    const providers: string[] = [];
    const seen = new Set<string>();
    let end = contents.length;
    while (end > 0) {
      while (end > 0 && (contents[end - 1] === "\n" || contents[end - 1] === "\r")) end -= 1;
      if (end === 0) break;
      const start = contents.lastIndexOf("\n", end - 1) + 1;
      const line = contents.slice(start, end);
      end = start;
      try {
        const entry = JSON.parse(line) as { type?: unknown; message?: unknown; provider?: unknown };
        if (entry.type === "message") {
          if (!lastPrompt && isUser(entry.message)) lastPrompt = sessionPromptSummary(entry.message.content);
          if (isAssistant(entry.message) && typeof entry.message.provider === "string") {
            rememberProvider(entry.message.provider, providers, seen);
          }
        } else if (entry.type === "model_change" && typeof entry.provider === "string") {
          rememberProvider(entry.provider, providers, seen);
        }
      } catch {
        // Pi's parser also skips malformed lines; keep looking for the latest
        // valid user message instead of losing the whole sidebar row.
      }
    }
    return { lastPrompt, providers };
  } catch {
    // A session can disappear between Pi's directory scan and this read. Keep
    // the remaining list usable; the watcher will remove this row momentarily.
    return { lastPrompt: "", providers: [] };
  }
}

function rememberProvider(provider: string, providers: string[], seen: Set<string>) {
  if (!provider || seen.has(provider)) return;
  seen.add(provider);
  providers.push(provider);
}

export function listSessions(projectDir: string): Promise<SessionSummary[]> {
  const cached = sessionListCache.get(projectDir);
  if (cached) return cached;
  const listing = listSessionsUncached(projectDir);
  sessionListCache.set(projectDir, listing);
  void listing.catch(() => {
    if (sessionListCache.get(projectDir) === listing) sessionListCache.delete(projectDir);
  });
  return listing;
}

async function listSessionsUncached(projectDir: string): Promise<SessionSummary[]> {
  const sessions = await SessionManager.list(projectDir);
  const filtered = sessions.filter((session) => session.messageCount > 0);
  // Process with limited concurrency so 200 files do not open at once (EMFILE)
  // and benefit from the mtime cache above.
  const results: SessionSummary[] = [];
  const concurrency = 10;
  for (let i = 0; i < filtered.length; i += concurrency) {
    const chunk = filtered.slice(i, i + concurrency);
    const mapped = await Promise.all(
      chunk.map(async (session) => {
        const mtimeMs = session.modified.getTime();
        const { lastPrompt, providers } = await sessionSidebarFields(session.path, mtimeMs);
        return {
          path: session.path,
          id: session.id,
          name: session.name,
          firstMessage: session.firstMessage === "(no messages)" ? "" : session.firstMessage,
          lastPrompt,
          providers,
          messageCount: session.messageCount,
          created: session.created.toISOString(),
          modified: session.modified.toISOString(),
        } as SessionSummary;
      }),
    );
    results.push(...mapped);
  }
  return results;
}

export async function searchSessions(projectDirs: string[], rawQuery: string, signal?: AbortSignal): Promise<SessionSearchResult[]> {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query || projectDirs.length === 0) return [];

  signal?.throwIfAborted();
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

  const candidates = summaries.filter(({ title }) => !title.toLocaleLowerCase().includes(query));
  const concurrency = 4;
  let cursor = 0;
  async function searchNext(): Promise<void> {
    while (results.length < 50) {
      signal?.throwIfAborted();
      const candidate = candidates[cursor++];
      if (!candidate) return;
      const { projectDir, session, title } = candidate;
      const entries = await readSession(session.path).catch(() => []);
      signal?.throwIfAborted();
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
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => searchNext()));

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
  const daily = new Map<string, { cost: number; tokens: number; sessions: Set<string>; models: Map<string, { cost: number; tokens: number }> }>();
  const perProject = new Map<string, { name: string; cost: number; tokens: number }>();
  const models = new Map<string, { cost: number; tokens: number }>();
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  const usedSessions = new Set<string>();
  const billedEntries = new Map<string, Set<string>>();
  const sessionRecords = (await Promise.all(projects.map(async (project) =>
    (await listSessions(project.path)).map((session) => ({ project, session })),
  ))).flat();
  const parentByPath = new Map<string, string | undefined>();
  for (const { session } of sessionRecords) {
    const header = await sessionHeader(session.path);
    parentByPath.set(path.resolve(session.path), header?.parentSession);
  }

  function lineageRoot(sessionFile: string, seen = new Set<string>()): string {
    const resolved = path.resolve(sessionFile);
    if (seen.has(resolved)) return resolved;
    seen.add(resolved);
    const parentSession = parentByPath.get(resolved);
    return parentSession && parentByPath.has(path.resolve(parentSession))
      ? lineageRoot(parentSession, seen)
      : resolved;
  }

  for (const { project, session } of sessionRecords) {
    const root = lineageRoot(session.path);
    const lineageEntries = billedEntries.get(root) ?? new Set<string>();
    billedEntries.set(root, lineageEntries);
    for await (const entry of streamSession(session.path)) {
      if (entry.type !== "message" || !isAssistant(entry.message)) continue;
      const cost = entry.message.usage?.cost?.total;
      if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) continue;
      if (lineageEntries.has(entry.id)) continue;

      const date = usageDate(entry.message.timestamp, entry.timestamp);
      if (!date) continue;
      const tokens = entry.message.usage?.totalTokens ?? 0;
      const usage = entry.message.usage;
      lineageEntries.add(entry.id);
      usedSessions.add(session.path);
      totals.input += usage?.input ?? 0;
      totals.output += usage?.output ?? 0;
      totals.cacheRead += usage?.cacheRead ?? 0;
      totals.cacheWrite += usage?.cacheWrite ?? 0;
      totals.total += tokens;
      const dailyTotal = daily.get(date) ?? { cost: 0, tokens: 0, sessions: new Set<string>(), models: new Map<string, { cost: number; tokens: number }>() };
      dailyTotal.cost += cost;
      dailyTotal.tokens += tokens;
      dailyTotal.sessions.add(session.path);
      const projectTotal = perProject.get(project.path) ?? { name: project.name, cost: 0, tokens: 0 };
      projectTotal.cost += cost;
      projectTotal.tokens += tokens;
      perProject.set(project.path, projectTotal);
      const model = entry.message.provider && entry.message.model
        ? `${entry.message.provider}/${entry.message.model}`
        : entry.message.model ?? "Unknown model";
      const prev = dailyTotal.models.get(model) ?? { cost: 0, tokens: 0 };
      dailyTotal.models.set(model, { cost: prev.cost + cost, tokens: prev.tokens + tokens });
      daily.set(date, dailyTotal);
      const mPrev = models.get(model) ?? { cost: 0, tokens: 0 };
      models.set(model, { cost: mPrev.cost + cost, tokens: mPrev.tokens + tokens });
    }
  }

  const byCost = <T extends { cost: number }>(a: T, b: T) => b.cost - a.cost;
  const projectTotals = [...perProject.entries()]
    .map(([path, value]) => ({ path, ...value }))
    .toSorted(byCost);
  const modelTotals = [...models.entries()]
    .map(([name, value]) => ({ name, cost: value.cost, tokens: value.tokens }))
    .toSorted(byCost);
  const dailyTotals = [...daily.entries()]
    .map(([date, value]) => ({
      date,
      cost: value.cost,
      tokens: value.tokens,
      sessions: value.sessions.size,
      models: [...value.models.entries()].map(([name, value]) => ({ name, cost: value.cost, tokens: value.tokens })).toSorted(byCost),
    }))
    .toSorted((a, b) => a.date.localeCompare(b.date));

  return {
    totalCost: projectTotals.reduce((total, project) => total + project.cost, 0),
    sessions: usedSessions.size,
    daily: dailyTotals,
    projects: projectTotals,
    models: modelTotals,
    tokens: totals,
  };
}

async function* streamSession(sessionFile: string): AsyncGenerator<FileEntry> {
  const input = createReadStream(sessionFile, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as FileEntry;
      } catch {
        // Match Pi's session parser: a malformed append does not hide the
        // valid billed entries before or after it.
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

async function sessionHeader(sessionFile: string): Promise<{ parentSession?: string } | undefined> {
  let file;
  try {
    file = await open(sessionFile, "r");
    const buffer = Buffer.allocUnsafe(16 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const lineEnd = buffer.subarray(0, bytesRead).indexOf(0x0a);
    const line = buffer.toString("utf8", 0, lineEnd === -1 ? bytesRead : lineEnd).trim();
    const entry = JSON.parse(line) as { type?: unknown; parentSession?: unknown };
    return entry.type === "session"
      ? { ...(typeof entry.parentSession === "string" ? { parentSession: entry.parentSession } : {}) }
      : undefined;
  } catch {
    return undefined;
  } finally {
    await file?.close();
  }
}

const usageDateFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

function usageDate(messageTimestamp: number | undefined, entryTimestamp: string): string | null {
  const timestamp = typeof messageTimestamp === "number" ? messageTimestamp : Date.parse(entryTimestamp);
  if (!Number.isFinite(timestamp)) return null;
  const parts = usageDateFormatter.formatToParts(timestamp);
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
  sessionListCache.delete(projectDir);
  sidebarFieldsCache.delete(resolved);
  sidebarFieldsCache.delete(sessionFile);
}

/**
 * Watch a project's session directory, including the point where it is first
 * created. Pi owns the directory layout; `SessionManager.create` gives us its
 * computed default rather than duplicating its path encoding.
 */
export function watchProjectSessions(projectDir: string, onChange: (sessionFile?: string) => void): () => void {
  const sessionDir = SessionManager.create(projectDir).getSessionDir();
  let watcher: FSWatcher | undefined;
  let stopped = false;
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
      watcher = watch(directory, { persistent: false }, (_event, filename) => {
        if (stopped) return;
        watchDirectory();
        if (watchingSessions || existsSync(sessionDir)) {
          const changedSession = watchingSessions && filename ? path.join(sessionDir, filename.toString()) : undefined;
          sessionListCache.delete(projectDir);
          onChange(changedSession);
        }
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
    watcher?.close();
    sessionListCache.delete(projectDir);
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
