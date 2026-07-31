import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import path from "node:path";
import type { FilePreview } from "../shared/pi-types.ts";

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
  const tracked = await gitFiles(projectDir);
  if (tracked) return tracked;
  const walked = await walk(projectDir);
  return walked.sort((a, b) => a.localeCompare(b));
}

function gitFiles(projectDir: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: projectDir, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        // Not a repository, or no git at all: both mean "walk it yourself".
        if (err) return resolve(null);
        resolve(stdout.split("\0").filter(Boolean).slice(0, MAX_FILES));
      },
    );
  });
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];

  while (queue.length > 0 && files.length < MAX_FILES) {
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
      if (files.length >= MAX_FILES) break;
      files.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
    }
  }

  return files;
}

const MAX_TEXT_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 8_000_000;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

const MARKDOWN_EXTS = new Set([".md", ".markdown", ".mdx"]);

/** A path resolved and confirmed to stay inside `projectDir`, or `null` if it doesn't. */
function containedPath(projectDir: string, file: string): string | null {
  const target = resolve(projectDir, file);
  const rel = relative(projectDir, target);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return null;
  return target;
}

/**
 * A read-only preview of one project file.
 *
 * Images are read whole and returned as a data URL; everything else is sniffed
 * for a null byte in its first few KB, which is enough to tell prose and code
 * from the compiled and media files a project also contains.
 */
export async function readFilePreview(projectDir: string, file: string): Promise<FilePreview | { error: string }> {
  const targetPath = containedPath(projectDir, file);
  if (!targetPath) return { error: "The file is outside this project." };

  let info;
  try {
    info = await stat(targetPath);
  } catch {
    return { error: "That file could not be found." };
  }
  if (!info.isFile()) return { error: "That is not a file." };

  const ext = path.extname(targetPath).toLowerCase();
  const base = { path: file, size: info.size, mtimeMs: info.mtimeMs };

  const imageMime = IMAGE_MIME_BY_EXT[ext];
  if (imageMime) {
    if (info.size > MAX_IMAGE_BYTES) return { ...base, kind: "too-large" };
    const bytes = await readFile(targetPath);
    return { ...base, kind: "image", dataUrl: `data:${imageMime};base64,${bytes.toString("base64")}` };
  }

  if (info.size > MAX_TEXT_BYTES) return { ...base, kind: "too-large" };

  const bytes = await readFile(targetPath);
  if (bytes.subarray(0, 8000).includes(0)) return { ...base, kind: "binary" };

  return { ...base, kind: MARKDOWN_EXTS.has(ext) ? "markdown" : "text", content: bytes.toString("utf8") };
}
