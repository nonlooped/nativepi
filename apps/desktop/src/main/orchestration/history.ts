import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { readSession, searchSnippet } from "../sessions.ts";
import { textOf } from "../../shared/messages.ts";
import type { ThreadReference } from "../../shared/orchestration.ts";

/** Pi discovery only; never scan arbitrary directories or start a runtime. */
export async function discoverThreads(chatRoot: string, knownDirectories: string[] = []): Promise<ThreadReference[]> {
  const lists = await Promise.all([SessionManager.listAll(), ...knownDirectories.map(directory => SessionManager.listAll(directory))]);
  const seen = new Set<string>();
  return lists.flat().filter(info => resolve(info.cwd) !== resolve(chatRoot) && !seen.has(info.id) && !!seen.add(info.id))
    .map(info => ({ id: info.id, cwd: resolve(info.cwd), file: resolve(info.path), title: info.name }));
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
