import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { GitBranch, GitDiff, GitStatus } from "../shared/pi-types.ts";


function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
        resolve({ stdout, stderr, code });
      },
    );
  });
}

function labelFor(x: string, y: string): GitStatus["files"][number]["state"] {
  if (x === "?" && y === "?") return "untracked";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  if (x === "R") return "renamed";
  return "modified";
}

export async function gitStatus(projectDir: string): Promise<GitStatus> {
  const inside = await run(["rev-parse", "--is-inside-work-tree"], projectDir);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return { isRepo: false, files: [] };
  }

  const branchRes = await run(["rev-parse", "--abbrev-ref", "HEAD"], projectDir);
  const branch = branchRes.stdout.trim();
  const detached = branch === "HEAD";

  // NUL-delimited porcelain output is unambiguous even with odd filenames.
  const status = await run(["status", "--porcelain=v1", "--untracked-files=all", "-z"], projectDir);
  const files: GitStatus["files"] = [];
  const records = status.stdout.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    const x = record[0] ?? " ";
    const y = record[1] ?? " ";
    let path = record.slice(3);
    // A rename entry is followed by its original path in the next NUL field.
    if (x === "R" || y === "R") i++;
    if (!path) continue;
    files.push({ path, state: labelFor(x, y), staged: x !== " " && x !== "?" });
  }

  return {
    isRepo: true,
    branch: detached ? undefined : branch,
    detached,
    files,
  };
}

export async function gitDiff(projectDir: string, file: string, untracked: boolean): Promise<GitDiff> {
  // `--no-index` diffs an untracked file against nothing so its content shows as
  // added; it exits non-zero by design, which `run` tolerates.
  const args = untracked
    ? ["diff", "--no-color", "--no-index", "--", "/dev/null", file]
    : ["diff", "--no-color", "HEAD", "--", file];
  const res = await run(args, projectDir);
  return { path: file, patch: res.stdout };
}

/** Git's own message is the useful one; ours would only be vaguer. */
function failure(res: { stdout: string; stderr: string }): string {
  return (res.stderr.trim() || res.stdout.trim() || "git failed").split("\n").slice(0, 4).join("\n");
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

export async function gitBranches(projectDir: string): Promise<GitBranch[]> {
  const here = await run(["rev-parse", "--show-toplevel"], projectDir);
  if (here.code !== 0) return [];
  const root = here.stdout.trim();

  // `%(worktreepath)` is empty unless the branch is checked out somewhere, which
  // is exactly the constraint that decides what a row is allowed to do.
  const res = await run(
    ["for-each-ref", "--format=%(refname:short)%00%(worktreepath)%00%(HEAD)", "--sort=-committerdate", "refs/heads"],
    projectDir,
  );
  if (res.code !== 0) return [];

  return res.stdout.split("\n").flatMap((line): GitBranch[] => {
    const [name, worktree, head] = line.trim().split("\0");
    if (!name) return [];
    // The current checkout is reported as a worktree too; only *other* worktrees
    // are worth naming, since those are the ones this checkout cannot take.
    const elsewhere = worktree && !samePath(worktree, root) ? path.normalize(worktree) : undefined;
    return [{ name, current: head === "*", worktree: elsewhere }];
  });
}

export async function gitCheckout(
  projectDir: string,
  branch: string,
  create: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const res = await run(create ? ["checkout", "-b", branch] : ["checkout", branch], projectDir);
  return res.code === 0 ? { ok: true } : { ok: false, error: failure(res) };
}

/**
 * Where a new worktree goes.
 *
 * Beside the repository rather than inside it, so the checkout never has to
 * ignore its own worktrees. `--git-common-dir` resolves to the main repository
 * even when this project *is* a worktree, so every worktree of a repo lands in
 * one place regardless of which one the user was looking at.
 */
async function worktreePathFor(projectDir: string, branch: string): Promise<string | null> {
  const res = await run(["rev-parse", "--path-format=absolute", "--git-common-dir"], projectDir);
  if (res.code !== 0) return null;
  const mainRoot = path.dirname(res.stdout.trim());
  const base = path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}-worktrees`);
  const slug = branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "branch";

  let candidate = path.join(base, slug);
  for (let n = 2; existsSync(candidate); n++) candidate = path.join(base, `${slug}-${n}`);
  return candidate;
}

export async function gitAddWorktree(
  projectDir: string,
  branch: string,
  create: boolean,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const target = await worktreePathFor(projectDir, branch);
  if (!target) return { ok: false, error: "This folder is not a Git repository." };

  const res = await run(
    create ? ["worktree", "add", "-b", branch, target] : ["worktree", "add", target, branch],
    projectDir,
  );
  return res.code === 0 ? { ok: true, path: target } : { ok: false, error: failure(res) };
}
