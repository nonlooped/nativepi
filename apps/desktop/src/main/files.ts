import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * A ceiling, not a page size. The `@` menu never shows more than a screenful,
 * so the only thing a larger list buys is a slower first keystroke; a repository
 * big enough to hit this is one where fuzzy matching, not exhaustiveness, is
 * what finds the file.
 */
const MAX_FILES = 20000;

/** Directories that are never what someone means by `@`, in a repo or out of one. */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "out",
  "target",
  "release",
  ".cache",
  "coverage",
]);

/**
 * Every file in the project, as forward-slashed paths relative to its root.
 *
 * Git is asked first and answers best: it already knows what is ignored, so a
 * repository's menu matches the files that actually belong to it. Outside a
 * repository there is nothing to ask, and the walk below falls back to a fixed
 * list of directories that are noise everywhere.
 */
export async function listProjectFiles(projectDir: string): Promise<string[]> {
  const tracked = await gitFiles(projectDir, MAX_FILES);
  if (tracked) return tracked;
  const walked = await walk(projectDir, MAX_FILES);
  return walked.sort((a, b) => a.localeCompare(b));
}

function gitFiles(projectDir: string, maxFiles: number): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: projectDir, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        // Not a repository, or no git at all: both mean "walk it yourself".
        if (err) return resolve(null);
        resolve(stdout.split("\0").filter(Boolean).slice(0, maxFiles));
      },
    );
  });
}

async function walk(root: string, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];

  while (queue.length > 0 && files.length < maxFiles) {
    const dir = queue.shift() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // An unreadable directory costs its own contents, nothing else.
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.isDirectory()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= maxFiles) break;
      files.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
    }
  }

  return files;
}
