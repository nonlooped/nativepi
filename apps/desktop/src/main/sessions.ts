import { createReadStream, existsSync, watch, type FSWatcher } from "node:fs";
import { open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { SessionManager } from "@earendil-works/pi-coding-agent";
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
const persistedEntrySchema = z.looseObject({ type: z.string(), id: z.string().optional(), timestamp: z.string().optional() });
export function parseSessionEntry(value: unknown): FileEntry | undefined {
  const parsed = persistedEntrySchema.safeParse(value);
  if (!parsed.success)
    return undefined;
  const entry = parsed.data;
  if (entry.type === "message") {
    const message = z.looseObject({ role: z.string(), content: z.union([z.string(), z.array(z.unknown())]) }).safeParse(entry.message);
    if (!message.success)
      return undefined;
  }
  return entry as FileEntry;
}
export async function readSession(sessionFile: string) {
  const entries: FileEntry[] = [];
  for await (const entry of streamSession(sessionFile))
    entries.push(entry);
  return entries;
}
const sidebarFieldsCache = new Map<string, {
  revision: string;
  result: {
    lastPrompt: string;
    providers: string[];
  };
}>();
const sessionListCache = new Map<string, Promise<SessionSummary[]>>();
async function sessionSidebarFields(sessionFile: string): Promise<{
  lastPrompt: string;
  providers: string[];
}> {
  const revision = await stat(sessionFile).then(value => `${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`).catch(() => "missing");
  const cached = sidebarFieldsCache.get(sessionFile);
  if (cached && cached.revision === revision)
    return cached.result;
  const result = await sessionSidebarFieldsUncached(sessionFile);
  // A full scan larger than capacity must not evict entries it has yet to
  // reach. Keep warm hits while still refreshing externally changed files.
  if (sidebarFieldsCache.has(sessionFile) || sidebarFieldsCache.size < 500) {
    sidebarFieldsCache.set(sessionFile, { revision, result });
  }
  return result;
}
async function sessionSidebarFieldsUncached(sessionFile: string): Promise<{
  lastPrompt: string;
  providers: string[];
}> {
  try {
    const contents = await readFile(sessionFile, "utf8");
    let lastPrompt = "";
    const providers: string[] = [];
    const seen = new Set<string>();
    let end = contents.length;
    while (end > 0) {
      while (end > 0 && (contents[end - 1] === "\n" || contents[end - 1] === "\r"))
        end -= 1;
      if (end === 0)
        break;
      const start = contents.lastIndexOf("\n", end - 1) + 1;
      const line = contents.slice(start, end);
      end = start;
      try {
        const entry = parseSessionEntry(JSON.parse(line));
        if (!entry)
          continue;
        if (entry.type === "message") {
          if (!lastPrompt && isUser(entry.message))
            lastPrompt = sessionPromptSummary(entry.message.content);
          if (isAssistant(entry.message) && typeof entry.message.provider === "string") {
            rememberProvider(entry.message.provider, providers, seen);
          }
        }
        else if (entry.type === "model_change" && typeof entry.provider === "string") {
          rememberProvider(entry.provider, providers, seen);
        }
      }
      catch {
        // Pi's parser also skips malformed lines; keep looking for the latest
        // valid user message instead of losing the whole sidebar row.
      }
    }
    return { lastPrompt, providers };
  }
  catch {
    // A session can disappear between Pi's directory scan and this read. Keep
    // the remaining list usable; the watcher will remove this row momentarily.
    return { lastPrompt: "", providers: [] };
  }
}
function rememberProvider(provider: string, providers: string[], seen: Set<string>) {
  if (!provider || seen.has(provider))
    return;
  seen.add(provider);
  providers.push(provider);
}
export function listSessions(projectDir: string): Promise<SessionSummary[]> {
  const cached = sessionListCache.get(projectDir);
  if (cached)
    return cached;
  const listing = listSessionsUncached(projectDir);
  sessionListCache.set(projectDir, listing);
  const release = () => {
    if (sessionListCache.get(projectDir) === listing)
      sessionListCache.delete(projectDir);
  };
  void listing.then(release, release);
  return listing;
}
function safeSessionDate(value: Date, fallback: number): string { return Number.isFinite(value.getTime()) ? value.toISOString() : new Date(fallback).toISOString(); }
async function listSessionsUncached(projectDir: string): Promise<SessionSummary[]> {
  const sessions = await SessionManager.list(projectDir);
  const filtered = sessions.filter((session) => session.messageCount > 0);
  // Process with limited concurrency so 200 files do not open at once (EMFILE)
  // and benefit from the mtime cache above.
  const results: SessionSummary[] = [];
  const concurrency = 10;
  for (let i = 0; i < filtered.length; i += concurrency) {
    const chunk = filtered.slice(i, i + concurrency);
    const mapped = await Promise.all(chunk.map(async (session) => {
      const mtimeMs = await sessionMtime(session.path);
      const { lastPrompt, providers } = await sessionSidebarFields(session.path);
      return {
        path: session.path,
        id: session.id,
        name: session.name,
        firstMessage: session.firstMessage === "(no messages)" ? "" : session.firstMessage,
        lastPrompt,
        providers,
        messageCount: session.messageCount,
        created: safeSessionDate(session.created, mtimeMs),
        modified: safeSessionDate(session.modified, mtimeMs),
      } as SessionSummary;
    }));
    results.push(...mapped);
  }
  return results;
}
export async function searchSessions(projectDirs: string[], rawQuery: string, signal?: AbortSignal): Promise<SessionSearchResult[]> {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query || projectDirs.length === 0)
    return [];
  signal?.throwIfAborted();
  const summaries = (await Promise.all(projectDirs.map(async (projectDir) => {
    const sessions = await listSessions(projectDir);
    return sessions.map((session) => ({ projectDir, session, title: chatTitle(session) }));
  }))).flat();
  const results: SessionSearchResult[] = summaries.flatMap(({ projectDir, session, title }) => title.toLocaleLowerCase().includes(query)
    ? [{
        projectDir,
        sessionFile: session.path,
        title,
        modified: session.modified,
        match: "title" as const,
        snippet: title,
      }]
    : []);
  const candidates = summaries.filter(({ title }) => !title.toLocaleLowerCase().includes(query));
  const concurrency = 4;
  let cursor = 0;
  async function searchNext(): Promise<void> {
    while (results.length < 50) {
      signal?.throwIfAborted();
      const candidate = candidates[cursor++];
      if (!candidate)
        return;
      const { projectDir, session, title } = candidate;
      for await (const entry of streamSession(session.path)) {
        signal?.throwIfAborted();
        if (entry.type !== "message" || (!isUser(entry.message) && !isAssistant(entry.message)))
          continue;
        const text = textOf(entry.message.content);
        const index = text.toLocaleLowerCase().indexOf(query);
        if (index === -1)
          continue;
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
export async function usageDashboard(projects: {
  path: string;
  name: string;
}[]): Promise<UsageDashboard> {
  const daily = new Map<string, {
    cost: number;
    tokens: number;
    sessions: Set<string>;
    models: Map<string, {
      cost: number;
      tokens: number;
    }>;
  }>();
  const perProject = new Map<string, {
    name: string;
    cost: number;
    tokens: number;
  }>();
  const models = new Map<string, {
    cost: number;
    tokens: number;
  }>();
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  const usedSessions = new Set<string>();
  const billedEntries = new Map<string, Set<string>>();
  const sessionRecords = (await Promise.all(projects.map(async (project) => (await listSessions(project.path)).map((session) => ({ project, session }))))).flat();
  const parentByPath = new Map<string, string | undefined>();
  for (const { session } of sessionRecords) {
    const header = await sessionHeader(session.path);
    parentByPath.set(path.resolve(session.path), header?.parentSession);
  }
  function lineageRoot(sessionFile: string, seen = new Set<string>()): string {
    const resolved = path.resolve(sessionFile);
    if (seen.has(resolved))
      return resolved;
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
      if (entry.type !== "message" || !isAssistant(entry.message))
        continue;
      const cost = entry.message.usage?.cost?.total;
      if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)
        continue;
      if (lineageEntries.has(entry.id))
        continue;
      const date = usageDate(entry.message.timestamp, entry.timestamp);
      if (!date)
        continue;
      const tokens = usageNumber(entry.message.usage?.totalTokens);
      const usage = entry.message.usage;
      lineageEntries.add(entry.id);
      usedSessions.add(session.path);
      totals.input += usageNumber(usage?.input);
      totals.output += usageNumber(usage?.output);
      totals.cacheRead += usageNumber(usage?.cacheRead);
      totals.cacheWrite += usageNumber(usage?.cacheWrite);
      totals.total += tokens;
      const dailyTotal = daily.get(date) ?? { cost: 0, tokens: 0, sessions: new Set<string>(), models: new Map<string, {
          cost: number;
          tokens: number;
        }>() };
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
  const byCost = <T extends {
    cost: number;
  }>(a: T, b: T) => b.cost - a.cost;
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
      if (!line.trim())
        continue;
      try {
        const entry = parseSessionEntry(JSON.parse(line));
        if (entry)
          yield entry;
      }
      catch {
        // Match Pi's session parser: a malformed append does not hide the
        // valid billed entries before or after it.
      }
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw error;
  }
  finally {
    lines.close();
    input.destroy();
  }
}
async function sessionHeader(sessionFile: string): Promise<{
  parentSession?: string;
} | undefined> {
  let file;
  try {
    file = await open(sessionFile, "r");
    const buffer = Buffer.allocUnsafe(16 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const lineEnd = buffer.subarray(0, bytesRead).indexOf(0x0a);
    const line = buffer.toString("utf8", 0, lineEnd === -1 ? bytesRead : lineEnd).trim();
    const entry = JSON.parse(line) as {
      type?: unknown;
      parentSession?: unknown;
    };
    return entry.type === "session"
      ? { ...(typeof entry.parentSession === "string" ? { parentSession: entry.parentSession } : {}) }
      : undefined;
  }
  catch {
    return undefined;
  }
  finally {
    await file?.close();
  }
}
function usageNumber(value: unknown): number { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0; }
const usageDateFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
function usageDate(messageTimestamp: number | undefined, entryTimestamp: string): string | null {
  const timestamp = typeof messageTimestamp === "number" ? messageTimestamp : Date.parse(entryTimestamp);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime()))
    return null;
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
      if (parent === directory)
        return;
      directory = parent;
    }
    const watchingSessions = directory === sessionDir;
    try {
      watcher = watch(directory, { persistent: false }, (_event, filename) => {
        if (stopped)
          return;
        watchDirectory();
        if (watchingSessions || existsSync(sessionDir)) {
          const changedSession = watchingSessions && filename ? path.join(sessionDir, filename.toString()) : undefined;
          sessionListCache.delete(projectDir);
          onChange(changedSession);
        }
      });
      watcher.on("error", () => watcher?.close());
    }
    catch {
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
  }
  catch {
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
export function watchSessionFile(sessionFile: string, onChange: (mtimeMs: number) => void, onError: () => void = () => { }): () => void {
  let stopped = false;
  let watcher: FSWatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let recovery: ReturnType<typeof setTimeout> | undefined;
  function retry(): void {
    if (stopped)
      return;
    clearTimeout(recovery);
    recovery = setTimeout(install, 500);
    recovery.unref?.();
  }
  function install(): void {
    if (stopped)
      return;
    watcher?.close();
    let directory = path.dirname(sessionFile);
    while (!existsSync(directory)) {
      const parent = path.dirname(directory);
      if (parent === directory) {
        retry();
        return;
      }
      directory = parent;
    }
    try {
      const current = watch(directory, { persistent: false }, () => {
        if (stopped || watcher !== current)
          return;
        install();
        clearTimeout(timer);
        timer = setTimeout(() => void sessionMtime(sessionFile).then(mtime => {
          if (!stopped)
            onChange(mtime);
        }), 150);
      });
      watcher = current;
      current.on("error", () => {
        current.close();
        if (!stopped && watcher === current) {
          onError();
          retry();
        }
      });
    }
    catch {
      onError();
      retry();
    }
  }
  install();
  return () => { stopped = true; clearTimeout(timer); clearTimeout(recovery); watcher?.close(); };
}
