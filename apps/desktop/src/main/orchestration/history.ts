import { readdir, stat, realpath } from "node:fs/promises";
import { getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent";
import { join, resolve } from "node:path";
import { readSession, searchSnippet } from "../sessions.ts";
import { textOf } from "../../shared/messages.ts";
import type { ThreadReference } from "../../shared/orchestration.ts";

export async function sameDirectory(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([realpath(left).catch(() => resolve(left)), realpath(right).catch(() => resolve(right))]);
  return a === b;
}

type DiscoveredThread = { ref: ThreadReference; modified: number };
const discoveryCache = new Map<string, { revision: string; refs: DiscoveredThread[] }>();
const discoveryPending = new Map<string, Promise<DiscoveredThread[]>>();
async function directoryRevision(directory: string): Promise<string> {
  const names = (await readdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; })).filter(name => name.endsWith(".jsonl")).sort();
  const revisions: string[] = [];
  for (let index = 0; index < names.length; index += 16) {
    revisions.push(...await Promise.all(names.slice(index, index + 16).map(async name => {
      const value = await stat(join(directory, name)).catch(() => undefined);
      return `${name}:${value ? `${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}` : "missing"}`;
    })));
  }
  return JSON.stringify(revisions);
}
async function discoverDirectory(directory: string): Promise<DiscoveredThread[]> {
  const pending = discoveryPending.get(directory);
  if (pending) return pending;
  const task = (async () => {
    const before = await directoryRevision(directory);
    const cached = discoveryCache.get(directory);
    if (cached?.revision === before) return cached.refs;
    const refs = (await SessionManager.listAll(directory)).map(info => ({ ref: { id: info.id, cwd: resolve(info.cwd), file: resolve(info.path), title: info.name }, modified: info.modified.getTime() }));
    const after = await directoryRevision(directory);
    // Never cache a partial scan or one taken across a concurrent append.
    if (before === after && refs.length === JSON.parse(after).length) {
      discoveryCache.delete(directory);
      discoveryCache.set(directory, { revision: after, refs });
      if (discoveryCache.size > 100) discoveryCache.delete(discoveryCache.keys().next().value!);
    }
    return refs;
  })();
  discoveryPending.set(directory, task);
  try { return await task; } finally { discoveryPending.delete(directory); }
}
/** Pi discovery only, with bounded concurrency and revision-validated directory results. */
export async function discoverThreads(chatRoot: string, knownDirectories: string[] = []): Promise<ThreadReference[]> {
  const root = join(getAgentDir(), "sessions");
  const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  const directories = new Set(await Promise.all([...entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => join(root, entry.name)), ...knownDirectories].map(directory => realpath(directory).catch(() => resolve(directory)))));
  const seen = new Set<string>();
  const candidates: DiscoveredThread[] = [];
  const paths = [...directories];
  for (let index = 0; index < paths.length; index += 4) {
    const lists = await Promise.all(paths.slice(index, index + 4).map(directory => discoverDirectory(directory).catch(() => [])));
    for (const item of lists.flat()) if (!seen.has(item.ref.id)) { seen.add(item.ref.id); candidates.push(item); }
  }
  const refs = candidates.sort((a, b) => b.modified - a.modified || a.ref.file.localeCompare(b.ref.file)).map(item => item.ref);
  const chat = await Promise.all(refs.map(ref => sameDirectory(ref.cwd, chatRoot)));
  return refs.filter((_, index) => !chat[index]);
}
export async function readThread(ref: ThreadReference, options: { cursor?: number; limit?: number; leafId?: string; includeTools?: boolean; includeThinking?: boolean }) {
  let entries = await readSession(ref.file);
  if (options.leafId) {
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    const ancestry = new Set<string>();
    let current: string | null | undefined = options.leafId;
    while (current && !ancestry.has(current)) {
      const entry = byId.get(current);
      if (!entry) throw new Error("not_found: Branch entry unavailable");
      ancestry.add(current); current = typeof ("parentId" in entry ? entry.parentId : undefined) === "string" ? ("parentId" in entry ? entry.parentId : undefined) : undefined;
    }
    entries = entries.filter(entry => entry.type === "session" || (entry.id && ancestry.has(entry.id)));
  }
  const start = options.cursor ?? 0, limit = options.limit ?? 25;
  const page: unknown[] = [];
  let bytes = 0, index = start;
  for (; index < entries.length && page.length < limit; index++) {
    const entry = entries[index]!;
    let value: unknown = entry;
    if (entry.type === "message" && "message" in entry && entry.message && typeof entry.message === "object") {
      const message = entry.message as Record<string, unknown>;
      if (message.role === "toolResult" && !options.includeTools) continue;
      value = { ...entry, message: { ...message, content: Array.isArray(message.content) ? message.content.filter(part => part && typeof part === "object" && part.type !== "image" && (options.includeThinking || part.type !== "thinking") && (options.includeTools || part.type !== "toolCall")) : message.content } };
    }
    if (entry.type === "custom_message" && Array.isArray(entry.content)) {
      value = { ...entry, content: entry.content.filter((part: unknown) => part && typeof part === "object" && "type" in part && part.type !== "image" && (options.includeThinking || part.type !== "thinking")) };
    }
    let encoded = JSON.stringify(value);
    if (encoded.length > 24000) { value = { id: entry.id, parentId: ("parentId" in entry ? entry.parentId : undefined), type: entry.type, truncated: true, excerpt: encoded.slice(0, 16000) }; encoded = JSON.stringify(value); }
    if (bytes + encoded.length > 100000) break;
    bytes += encoded.length; page.push(value);
  }
  return { ref, entries: page, nextCursor: index < entries.length ? index : null, branches: options.leafId ? "Selected leaf ancestry" : "All branches in append order; parentId preserves attribution", imagesOmitted: true };
}
export async function searchThreads(refs: ThreadReference[], query: string, cursor = 0, limit = 25) {
  const matches: { ref: ThreadReference; entryId?: string; parentId?: unknown; role: string; excerpt: string }[] = [];
  const needle = query.trim().toLocaleLowerCase();
  for (const ref of refs) {
    const entries = await readSession(ref.file).catch(() => []);
    for (const entry of entries) {
      let text = "", role = "title";
      if (entry.type === "session_info" && typeof entry.name === "string") text = entry.name;
      if (entry.type === "message" && "message" in entry && entry.message && typeof entry.message === "object") {
        const message = entry.message as { role?: string; content?: unknown };
        if (message.role !== "user" && message.role !== "assistant") continue;
        role = message.role; text = textOf(message.content);
      }
      const offset = text.toLocaleLowerCase().indexOf(needle);
      if (offset >= 0) matches.push({ ref, entryId: entry.id, parentId: ("parentId" in entry ? entry.parentId : undefined), role, excerpt: searchSnippet(text, offset, query.length) });
    }
  }
  return { matches: matches.slice(cursor, cursor + limit), nextCursor: cursor + limit < matches.length ? cursor + limit : null };
}
