import { watch, type FSWatcher } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent";
import type { FileEntry, SessionSummary } from "../shared/pi-types.ts";

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

export async function listSessions(projectDir: string): Promise<SessionSummary[]> {
  const sessions = await SessionManager.list(projectDir);
  return sessions
    // A session with no messages is a chat the user started and never used; it
    // exists on disk the moment Pi binds to it, so listing it would put a stray
    // entry in the sidebar for every abandoned one.
    .filter((session) => session.messageCount > 0)
    .map((session) => ({
      path: session.path,
      id: session.id,
      name: session.name,
      // Pi substitutes a placeholder when a session has no readable user text;
      // an empty string is what lets `chatTitle` fall back to "Untitled chat".
      firstMessage: session.firstMessage === "(no messages)" ? "" : session.firstMessage,
      messageCount: session.messageCount,
      created: session.created.toISOString(),
      modified: session.modified.toISOString(),
    }));
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
    try {
      watcher = watch(sessionDir, { persistent: false }, notify);
      watcher.on("error", () => watcher?.close());
      return;
    } catch {
      // A project with no chats has no directory yet. Its parent is created by
      // Pi, so watching it catches the first chat without polling.
    }
    try {
      const parent = path.dirname(sessionDir);
      const name = path.basename(sessionDir);
      watcher = watch(parent, { persistent: false }, (_event, filename) => {
        if (filename?.toString() !== name || stopped) return;
        notify();
        watcher?.close();
        watchDirectory();
      });
      watcher.on("error", () => watcher?.close());
    } catch {
      // Pi has not created its session root yet. The submit path still sends a
      // notification, and a later sidebar mount retries this watcher.
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
