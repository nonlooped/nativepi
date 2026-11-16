import { spawn } from "node:child_process";
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
  return new Promise(resolve => {
    const child = spawn("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: projectDir, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const files: string[] = [];
    let pending = "", capped = false;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (capped) return;
      pending += chunk;
      let end: number;
      while ((end = pending.indexOf("\0")) !== -1) {
        const file = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (file) files.push(file);
        if (files.length >= maxFiles) { capped = true; pending = ""; child.kill(); break; }
      }
      // Refuse pathological output rather than retaining an unbounded partial path.
      if (pending.length > 1024 * 1024) child.kill();
    });
    child.once("error", () => resolve(null));
    child.once("close", code => resolve(capped || code === 0 ? files : null));
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
