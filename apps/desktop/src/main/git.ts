import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { GitBranch, GitDiff, GitHunk, GitStatus } from "../shared/pi-types.ts";


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

function runGh(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile("gh", args, { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ stdout, stderr, code });
    });
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
    files.push({ path, state: labelFor(x, y), staged: x !== " " && x !== "?", unstaged: y !== " " || x === "?" });
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

export async function gitHunks(projectDir: string, file: string, untracked: boolean): Promise<GitHunk[]> {
  const res = await run(
    untracked
      ? ["diff", "--no-color", "--unified=0", "--no-index", "--", "/dev/null", file]
      : ["diff", "--no-color", "--unified=0", "--", file],
    projectDir,
  );
  const starts = [...res.stdout.matchAll(/^@@/gm)].map((match) => match.index ?? 0);
  if (starts.length === 0) return [];
  const prefix = res.stdout.slice(0, starts[0]);
  return starts.map((start, index) => ({
    header: res.stdout.slice(start, res.stdout.indexOf("\n", start)).trim(),
    patch: prefix + res.stdout.slice(start, starts[index + 1]),
  }));
}

export async function gitStageHunk(
  projectDir: string,
  file: string,
  untracked: boolean,
  hunk: number,
): Promise<{ ok: boolean; error?: string }> {
  const hunks = await gitHunks(projectDir, file, untracked);
  const selected = hunks[hunk];
  if (!selected) return { ok: false, error: "That change is no longer available. Refresh and try again." };
  const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const child = execFile("git", ["apply", "--cached", "--unidiff-zero", "-"], {
      cwd: projectDir,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ stdout, stderr, code });
    });
    child.stdin?.end(selected.patch);
  });
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}

export async function gitCommit(projectDir: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const staged = await run(["diff", "--cached", "--quiet"], projectDir);
  if (staged.code === 0) return { ok: false, error: "Stage at least one change before committing." };
  const result = await run(["commit", "-m", message], projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}

export async function gitPushAndCreatePr(
  projectDir: string,
  title: string,
  body: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const push = await run(["push", "-u", "origin", "HEAD"], projectDir);
  if (push.code !== 0) return { ok: false, error: failure(push) };
  const base = await runGh(["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], projectDir);
  if (base.code !== 0 || !base.stdout.trim()) return { ok: false, error: failure(base) };
  const pr = await runGh(["pr", "create", "--base", base.stdout.trim(), "--title", title, "--body", body], projectDir);
  return pr.code === 0 ? { ok: true, url: pr.stdout.trim() } : { ok: false, error: failure(pr) };
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
  const status = await run(["status", "--porcelain=v1", "--untracked-files=all"], projectDir);
  if (status.code !== 0) return { ok: false, error: failure(status) };
  if (status.stdout.trim()) {
    return { ok: false, error: "Commit or stash your changes before switching branches." };
  }

  const res = await run(create ? ["checkout", "-b", branch] : ["checkout", branch], projectDir);
  return res.code === 0 ? { ok: true } : { ok: false, error: failure(res) };
}

/**
 * Where a new worktree goes.
 *
 * Beside the repository rather than inside it, so the checkout never has to
 * ignore its own worktrees. A normal repository can use the checkout containing
 * its common `.git`; submodules and separate Git dirs must use the current
 * checkout instead of placing work under hidden metadata.
 */
async function worktreePathFor(projectDir: string, branch: string): Promise<string | null> {
  const [checkout, commonDir] = await Promise.all([
    run(["rev-parse", "--show-toplevel"], projectDir),
    run(["rev-parse", "--path-format=absolute", "--git-common-dir"], projectDir),
  ]);
  if (checkout.code !== 0 || commonDir.code !== 0) return null;
  const common = commonDir.stdout.trim();
  const mainRoot = path.basename(common) === ".git" ? path.dirname(common) : checkout.stdout.trim();
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
