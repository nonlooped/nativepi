import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GitBranch, GitCommit, GitDiff, GitHunk, GitPrTarget, GitStatus } from "../shared/pi-types.ts";


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

const gitStatusCache = new Map<string, { at: number; status: GitStatus }>();
const GIT_STATUS_TTL_MS = 1500;
function invalidateGitStatusCache(projectDir: string): void {
  gitStatusCache.delete(projectDir);
}

export async function gitStatus(projectDir: string): Promise<GitStatus> {
  const cached = gitStatusCache.get(projectDir);
  if (cached && Date.now() - cached.at < GIT_STATUS_TTL_MS) return cached.status;
  const [porcelain, headRes] = await Promise.all([
    run(["status", "--porcelain=v1", "--branch", "--untracked-files=all", "-z"], projectDir),
    run(["rev-parse", "--short", "HEAD"], projectDir),
  ]);
  if (porcelain.code !== 0) {
    const status: GitStatus = { isRepo: false, files: [], insertions: 0, deletions: 0, ahead: 0, behind: 0 };
    gitStatusCache.set(projectDir, { at: Date.now(), status });
    return status;
  }

  // NUL-delimited porcelain output is unambiguous even with odd filenames.
  const files: GitStatus["files"] = [];
  const records = porcelain.stdout.split("\0");
  const branchStatus = records.shift()?.slice(3) ?? "";
  const relation = branchStatus.split(" [", 1)[0] ?? "";
  const [branchName, upstream] = relation.split("...", 2);
  const detached = branchName === "HEAD (no branch)";
  const ahead = Number(branchStatus.match(/ahead (\d+)/)?.[1]) || 0;
  const behind = Number(branchStatus.match(/behind (\d+)/)?.[1]) || 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    const x = record[0] ?? " ";
    const y = record[1] ?? " ";
    let filePath = record.slice(3);
    let originalPath: string | undefined;
    // A rename entry is followed by its original path in the next NUL field.
    if (x === "R" || y === "R") {
      originalPath = records[i + 1];
      i++;
    }
    if (!filePath) continue;
    files.push({
      path: filePath,
      ...(originalPath ? { originalPath } : {}),
      state: labelFor(x, y),
      staged: x !== " " && x !== "?" ,
      unstaged: y !== " " || x === "?",
    });
  }

  const numstat = await run(["diff", "--numstat", "HEAD"], projectDir);
  let insertions = 0;
  let deletions = 0;
  for (const line of numstat.stdout.split("\n")) {
    const [added, removed] = line.split("\t");
    if (added && added !== "-") insertions += Number(added) || 0;
    if (removed && removed !== "-") deletions += Number(removed) || 0;
  }
  for (const file of files) {
    if (file.state !== "untracked") continue;
    const content = await readFile(path.join(projectDir, file.path));
    if (content.includes(0)) continue;
    const text = content.toString("utf8");
    if (text) insertions += text.split(/\r\n|\r|\n/).length - (/[\r\n]$/.test(text) ? 1 : 0);
  }

  const result: GitStatus = {
    isRepo: true,
    branch: detached ? undefined : branchName?.replace(/^No commits yet on /, "") || undefined,
    detached,
    head: headRes.code === 0 ? headRes.stdout.trim() || undefined : undefined,
    upstream: upstream || undefined,
    ahead,
    behind,
    files,
    insertions,
    deletions,
  };
  gitStatusCache.set(projectDir, { at: Date.now(), status: result });
  return result;
}

export async function gitLog(projectDir: string): Promise<GitCommit[]> {
  const [log, localOnly] = await Promise.all([
    run([
      "log",
      "HEAD",
      "--all",
      "--date-order",
      "--max-count=50",
      "--graph",
      "--decorate=short",
      "--format=%x1e%H%x00%h%x00%P%x00%an%x00%at%x00%s%x00%D",
    ], projectDir),
    run(["rev-list", "--max-count=5000", "HEAD", "--branches", "--not", "--remotes"], projectDir),
  ]);
  if (log.code !== 0) return [];
  const unpushed = new Set(localOnly.stdout.split("\n").filter(Boolean));

  return log.stdout.split("\n").flatMap((line): GitCommit[] => {
    const separator = line.indexOf("\x1e");
    if (separator < 0) return [];
    const graph = line.slice(0, separator).trimEnd();
    const [hash, shortHash, parents = "", author = "", seconds = "", subject = "", decorations = ""] = line
      .slice(separator + 1)
      .split("\0");
    if (!hash) return [];
    return [{
      hash,
      shortHash,
      parents: parents ? parents.split(" ") : [],
      author,
      timestamp: new Date(Number(seconds) * 1000).toISOString(),
      subject,
      refs: decorations ? decorations.split(", ") : [],
      graph,
      pushed: !unpushed.has(hash),
    }];
  });
}

export async function gitDiff(projectDir: string, file: string, untracked: boolean, staged = false): Promise<GitDiff> {
  // `--no-index` diffs an untracked file against nothing so its content shows as
  // added; it exits non-zero by design, which `run` tolerates.
  const args = staged
    ? ["diff", "--cached", "--no-color", "--", file]
    : untracked
      ? ["diff", "--no-color", "--no-index", "--", "/dev/null", file]
      : ["diff", "--no-color", "--", file];
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
  patch: string,
): Promise<{ ok: boolean; error?: string }> {
  const hunks = await gitHunks(projectDir, file, untracked);
  const selected = hunks.find((hunk) => hunk.patch === patch);
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
  if (result.code === 0) invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}

export async function gitStageFile(projectDir: string, file: string): Promise<{ ok: boolean; error?: string }> {
  const result = await run(["add", "--", file], projectDir);
  if (result.code === 0) invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}

async function unstage(projectDir: string, files: string[]) {
  const head = await run(["rev-parse", "--verify", "HEAD"], projectDir);
  const result = head.code === 0
    ? await run(["reset", "HEAD", "--", ...files], projectDir)
    : await run(["rm", "-r", "--cached", "--", ...files], projectDir);
  if (result.code === 0) invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}

export async function gitUnstageFile(projectDir: string, file: string, originalPath?: string) {
  const files = originalPath ? [file, originalPath] : [file];
  return await unstage(projectDir, files);
}

export async function gitStageAll(projectDir: string) {
  const result = await run(["add", "-A"], projectDir);
  if (result.code === 0) invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}

export async function gitUnstageAll(projectDir: string) {
  return await unstage(projectDir, ["."]);
}

export async function gitStagedDiff(projectDir: string) {
  const [stat, patch] = await Promise.all([
    run(["diff", "--cached", "--stat", "--no-color"], projectDir),
    run(["diff", "--cached", "--no-color", "--no-ext-diff", "--unified=3"], projectDir),
  ]);
  if (patch.code !== 0) throw new Error(failure(patch));
  const diff = `${stat.stdout.trim()}\n\n${patch.stdout}`.trim();
  const limit = 120_000;
  return diff.length > limit ? `${diff.slice(0, limit)}\n\n[diff truncated]` : diff;
}

export async function gitCommit(projectDir: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const staged = await run(["diff", "--cached", "--quiet"], projectDir);
  if (staged.code === 0) return { ok: false, error: "Stage at least one change before committing." };
  const result = await run(["commit", "-m", message], projectDir);
  if (result.code === 0) invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}

export async function gitPush(projectDir: string) {
  const [branch, upstream] = await Promise.all([
    run(["branch", "--show-current"], projectDir),
    run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], projectDir),
  ]);
  if (!branch.stdout.trim()) return { ok: false, error: "Check out a branch before pushing." };
  const result = upstream.code === 0
    ? await run(["push"], projectDir)
    : await run(["push", "-u", "origin", "HEAD"], projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}

export async function gitSync(projectDir: string) {
  const upstream = await run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], projectDir);
  if (upstream.code !== 0) return await gitPush(projectDir);
  const pull = await run(["pull", "--ff-only"], projectDir);
  if (pull.code !== 0) return { ok: false, error: failure(pull) };
  return await gitPush(projectDir);
}

/**
 * Where a pull request would go, read before the user commits to sending one.
 *
 * `gitPushAndCreatePr` already resolves all three of these, but it resolves them
 * after the click. Naming the branch, the base, and the remote in the dialog is
 * what makes the push a decision rather than a surprise, so the read is split
 * out and done up front. Every field is optional: a repository with no `gh`, no
 * `origin`, or a detached HEAD still has to render.
 */
export async function gitPrTarget(projectDir: string): Promise<GitPrTarget> {
  const [current, remote, base] = await Promise.all([
    run(["branch", "--show-current"], projectDir),
    run(["remote", "get-url", "origin"], projectDir),
    runGh(["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], projectDir),
  ]);

  const branch = current.stdout.trim() || undefined;
  const target: GitPrTarget = {
    branch,
    remote: remote.code === 0 ? remote.stdout.trim() || undefined : undefined,
    base: base.code === 0 ? base.stdout.trim() || undefined : undefined,
  };

  if (!branch) target.blocker = "You are not on a branch. Check one out before opening a pull request.";
  else if (!target.remote) target.blocker = "This repository has no “origin” remote to push to.";
  else if (!target.base) target.blocker = "GitHub CLI could not read this repository. Check that `gh` is installed and authenticated.";
  else if (branch === target.base) target.blocker = `You are on ${base.stdout.trim()}, the base branch. Create a branch before opening a pull request.`;

  return target;
}

export async function gitPushAndCreatePr(
  projectDir: string,
  title: string,
  body: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const base = await runGh(["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], projectDir);
  if (base.code !== 0 || !base.stdout.trim()) return { ok: false, error: failure(base) };
  const current = await run(["branch", "--show-current"], projectDir);
  if (current.code !== 0 || !current.stdout.trim()) return { ok: false, error: "Check out a branch before opening a pull request." };
  if (current.stdout.trim() === base.stdout.trim()) return { ok: false, error: "Create a branch before opening a pull request." };
  const push = await run(["push", "-u", "origin", "HEAD"], projectDir);
  if (push.code !== 0) return { ok: false, error: failure(push) };
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
  if (res.code === 0) invalidateGitStatusCache(projectDir);
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
