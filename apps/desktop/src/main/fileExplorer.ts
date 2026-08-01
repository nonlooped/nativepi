import { watch, type FSWatcher } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ExplorerEntry } from "../shared/pi-types.ts";

/**
 * Names the explorer never lists, matching Visual Studio Code's default
 * `files.exclude`.
 *
 * Git-ignored entries are deliberately absent from this set: the explorer shows
 * them. Nothing here is a size decision either — `node_modules` lists fine,
 * because one `readdir` of it costs the same as one `readdir` of anywhere else.
 * The only thing being kept out is plumbing nobody opens on purpose.
 */
const HIDDEN = new Set([".git", ".svn", ".hg", ".DS_Store", "Thumbs.db"]);

/**
 * One directory's immediate children, and nothing below them.
 *
 * This is the whole backend of the file explorer. It never recurses, never
 * builds a tree, and never reads a file's contents — a folder costs exactly one
 * `readdir` when the user opens it, and unopened folders cost nothing at all.
 * Symlinks are the sole exception: they are the only entries `readdir` cannot
 * classify on its own, so each one is `stat`ed to find out what it points at.
 *
 * Throws if `dir` escapes the project or cannot be read; the caller decides what
 * to show for that.
 */
export async function readProjectDirectory(projectDir: string, dir: string): Promise<ExplorerEntry[]> {
  const target = await containedDir(projectDir, dir);
  if (!target) throw new Error("That folder is outside this project.");

  const dirents = await readdir(target, { withFileTypes: true });
  const prefix = dir === "" ? "" : `${dir.replace(/\/+$/, "")}/`;

  const entries = await Promise.all(
    dirents.map(async (dirent): Promise<ExplorerEntry | null> => {
      if (HIDDEN.has(dirent.name)) return null;
      const kind = await entryKind(dirent, target);
      return kind ? { name: dirent.name, path: `${prefix}${dirent.name}`, kind } : null;
    }),
  );

  return entries.filter((entry): entry is ExplorerEntry => entry !== null).sort(byFoldersThenName);
}

/**
 * Watch one folder for entries appearing, disappearing, or being renamed.
 *
 * Not recursive, and deliberately so: the explorer only ever shows the folders
 * the user has opened, so watching exactly those keeps the cost of the pane
 * proportional to what is on screen rather than to the size of the repository.
 * A recursive watch of a project root would walk `node_modules` and `target` to
 * install itself, which is the one thing this pane has always refused to do.
 *
 * `onChange` is coalesced on a short timer, because a single save can arrive as
 * several events and a `git checkout` as hundreds.
 */
export async function watchProjectDirectory(
  projectDir: string,
  dir: string,
  onChange: () => void,
): Promise<() => void> {
  const target = await containedDir(projectDir, dir);
  if (!target) return () => {};

  let watcher: FSWatcher;
  try {
    watcher = watch(target, { persistent: false });
  } catch {
    // Gone between the containment check and the watch, or a path this platform
    // cannot watch. The folder still lists; it just will not refresh itself.
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  watcher.on("change", () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  });
  // A watched folder that is deleted ends its watcher this way. The parent's
  // watcher reports the same deletion, and that is the one that removes the row.
  watcher.on("error", () => watcher.close());

  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}

/** Folders above files, then natural order, so `file10` sorts after `file2`. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function byFoldersThenName(a: ExplorerEntry, b: ExplorerEntry): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return collator.compare(a.name, b.name);
}

/**
 * `null` for anything that is neither a file nor a folder — sockets, FIFOs, and
 * symlinks whose target no longer exists. A row for one of those would only ever
 * disappoint whoever clicked it.
 */
async function entryKind(
  dirent: { name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean },
  parent: string,
): Promise<"dir" | "file" | null> {
  if (dirent.isDirectory()) return "dir";
  if (dirent.isFile()) return "file";
  if (!dirent.isSymbolicLink()) return null;
  try {
    const info = await stat(join(parent, dirent.name));
    return info.isDirectory() ? "dir" : info.isFile() ? "file" : null;
  } catch {
    return null;
  }
}

/**
 * `dir` resolved under `projectDir`, or `null` if it points anywhere else.
 *
 * `realpath` on both sides is what makes a symlinked folder safe to expand: the
 * comparison is between where the paths actually land, not what they spell.
 */
async function containedDir(projectDir: string, dir: string): Promise<string | null> {
  let root: string;
  let resolved: string;
  try {
    [root, resolved] = await Promise.all([realpath(projectDir), realpath(resolve(projectDir, dir))]);
  } catch {
    return null;
  }
  const rel = relative(root, resolved);
  if (rel === "") return resolved;
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return null;
  return resolved;
}
