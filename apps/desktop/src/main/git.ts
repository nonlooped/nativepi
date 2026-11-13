import { runRepositoryCommand } from "./repoCommand.ts";
import { execFile } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { stat } from "node:fs/promises";
import { MAX_DIFF_PREVIEW_BYTES } from "../shared/diff-preview.ts";
import type { GitBranch, GitCommit, GitDiff, GitHunk, GitPrTarget, GitStatus } from "../shared/pi-types.ts";
function run(args: string[], cwd: string) {
  return runRepositoryCommand("git", ["--literal-pathspecs", ...args], cwd, 32 * 1024 * 1024);
}
function labelFor(x: string, y: string): GitStatus["files"][number]["state"] {
  if (x === "?" && y === "?")
    return "untracked";
  if (x === "A" || y === "A")
    return "added";
  if (x === "D" || y === "D")
    return "deleted";
  if (x === "R")
    return "renamed";
  return "modified";
}
const gitStatusCache = new Map<string, {
  at: number;
  status: GitStatus;
}>();
const gitStatusRequests = new Map<string, Promise<GitStatus>>();
const GIT_STATUS_TTL_MS = 1500;
function invalidateGitStatusCache(projectDir: string): void {
  gitStatusCache.delete(projectDir);
  gitStatusRequests.delete(projectDir);
}
export function gitStatus(projectDir: string): Promise<GitStatus> {
  const cached = gitStatusCache.get(projectDir);
  if (cached && Date.now() - cached.at < GIT_STATUS_TTL_MS)
    return Promise.resolve(cached.status);
  const current = gitStatusRequests.get(projectDir);
  if (current)
    return current;
  const request = readGitStatus(projectDir).then((status) => {
    if (gitStatusRequests.get(projectDir) === request) {
      gitStatusCache.set(projectDir, { at: Date.now(), status });
    }
    return status;
  });
  gitStatusRequests.set(projectDir, request);
  void request.finally(() => {
    if (gitStatusRequests.get(projectDir) === request)
      gitStatusRequests.delete(projectDir);
  });
  return request;
}
// Keep counts across the short status TTL, but only for still-untracked paths.
type LineCount = { revision: string; count: number };
const untrackedCounts = new Map<string, Map<string, LineCount>>();
const MAX_CACHED_LINE_COUNTS = 2000;
async function fileRevision(file: string): Promise<string | undefined> {
  const value = await stat(file).catch(() => undefined);
  return value && `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
}
async function cachedLineCount(file: string, cache: Map<string, LineCount>): Promise<number> {
  const revision = await fileRevision(file);
  const cached = cache.get(file);
  if (revision !== undefined && cached?.revision === revision) return cached.count;
  const count = await textLineCount(file);
  // Don't retain a count assembled while another process was changing the file.
  if (revision !== undefined && revision === await fileRevision(file)) {
    if (cache.has(file) || cache.size < MAX_CACHED_LINE_COUNTS) cache.set(file, { revision, count });
  } else cache.delete(file);
  return count;
}
async function textLineCount(file: string): Promise<number> {
  let breaks = 0;
  let hasContent = false;
  let lastWasBreak = false;
  let pendingCr = false;
  try {
    for await (const chunk of createReadStream(file)) {
      if (chunk.includes(0))
        return 0;
      for (const byte of chunk) {
        hasContent = true;
        if (byte === 10) {
          breaks += 1;
          pendingCr = false;
          lastWasBreak = true;
        }
        else if (byte === 13) {
          if (pendingCr)
            breaks += 1;
          pendingCr = true;
          lastWasBreak = true;
        }
        else {
          if (pendingCr)
            breaks += 1;
          pendingCr = false;
          lastWasBreak = false;
        }
      }
    }
  }
  catch {
    return 0;
  }
  if (pendingCr)
    breaks += 1;
  return hasContent ? breaks + (lastWasBreak ? 0 : 1) : 0;
}
async function readGitStatus(projectDir: string): Promise<GitStatus> {
  const root = (await run(["rev-parse", "--show-toplevel"], projectDir)).stdout.trim() || projectDir;
  const [porcelain, headRes] = await Promise.all([
    run(["status", "--porcelain=v1", "--branch", "--untracked-files=all", "-z"], root),
    run(["rev-parse", "--short", "HEAD"], root),
  ]);
  if (porcelain.code !== 0) {
    return { isRepo: false, files: [], insertions: 0, deletions: 0, ahead: 0, behind: 0 };
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
    if (!record)
      continue;
    const x = record[0] ?? " ";
    const y = record[1] ?? " ";
    let filePath = record.slice(3);
    let originalPath: string | undefined;
    // A rename entry is followed by its original path in the next NUL field.
    if (x === "R" || y === "R") {
      originalPath = records[i + 1];
      i++;
    }
    if (!filePath)
      continue;
    files.push({
      path: filePath,
      ...(originalPath ? { originalPath } : {}),
      state: labelFor(x, y),
      staged: x !== " " && x !== "?",
      unstaged: y !== " " || x === "?",
    });
  }
  const numstat = await run(["diff", "--numstat", "HEAD"], root);
  let insertions = 0;
  let deletions = 0;
  for (const line of numstat.stdout.split("\n")) {
    const [added, removed] = line.split("\t");
    if (added && added !== "-")
      insertions += Number(added) || 0;
    if (removed && removed !== "-")
      deletions += Number(removed) || 0;
  }
  const untracked = files.filter((file) => file.state === "untracked");
  const countsCache = untrackedCounts.get(root) ?? new Map<string, LineCount>();
  const paths = new Set(untracked.map(file => path.join(root, file.path)));
  for (const file of countsCache.keys()) if (!paths.has(file)) countsCache.delete(file);
  if (paths.size) untrackedCounts.set(root, countsCache);
  else untrackedCounts.delete(root);
  for (let index = 0; index < untracked.length; index += 4) {
    const counts = await Promise.all(untracked.slice(index, index + 4).map((file) => cachedLineCount(path.join(root, file.path), countsCache)));
    insertions += counts.reduce((total, count) => total + count, 0);
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
  if (log.code !== 0)
    return [];
  const unpushed = new Set(localOnly.stdout.split("\n").filter(Boolean));
  return log.stdout.split("\n").flatMap((line): GitCommit[] => {
    const separator = line.indexOf("\x1e");
    if (separator < 0)
      return [];
    const graph = line.slice(0, separator).trimEnd();
    const [hash, shortHash, parents = "", author = "", seconds = "", subject = "", decorations = ""] = line
      .slice(separator + 1)
      .split("\0");
    if (!hash)
      return [];
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
export async function gitDiff(projectDir: string, file: string, untracked: boolean, staged = false, maxBytes = 32 * 1024 * 1024): Promise<GitDiff> {
  return readGitDiff(projectDir, file, untracked, staged, maxBytes);
}
async function readGitDiff(projectDir: string, file: string, untracked: boolean, staged: boolean, maxBytes: number, zeroContext = false): Promise<GitDiff> {
  const repository = await run(["rev-parse", "--show-toplevel"], projectDir);
  if (repository.code !== 0) throw new Error(repository.stderr.trim() || "Could not read this repository.");
  const root = repository.stdout.trim();
  const selected = path.relative(root, path.resolve(root, file));
  if (path.isAbsolute(selected) || selected === ".." || selected.startsWith(`..${path.sep}`)) throw new Error("File is outside this repository.");
  const tracked = await run(["ls-files", "--error-unmatch", "--", selected], root);
  if (tracked.code !== 0 && tracked.code !== 1) throw new Error(tracked.stderr.trim() || "Could not inspect this file.");
  const isNew = !staged && (untracked || tracked.code === 1);
  const args = staged
    ? ["diff", "--cached", "--no-color", "--no-ext-diff", "--no-textconv", "--", selected]
    : isNew
      ? ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-index", "--", "/dev/null", selected]
      : ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--", selected];
  if (zeroContext) args.splice(1, 0, "--unified=0");
  const output = await new Promise<string>((resolve, reject) => {
    execFile("git", ["--literal-pathspecs", ...args], { cwd: root, maxBuffer: maxBytes, windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
      if (error && !(isNew && error.code === 1 && stdout.length > 0)) {
        reject(Object.assign(new Error(stderr.trim() || error.message), { code: error.code }));
      } else resolve(stdout);
    });
  });
  return { path: file, patch: output };
}

export async function gitHunks(projectDir: string, file: string, untracked: boolean): Promise<GitHunk[]> {
  // Share preview path validation, timeout and byte limit. Overflow rejects the
  // request rather than turning a truncated patch into a stageable hunk.
  const { patch } = await readGitDiff(projectDir, file, untracked, false, MAX_DIFF_PREVIEW_BYTES, true);
  const starts = [...patch.matchAll(/^@@/gm)].map((match) => match.index ?? 0);
  if (starts.length === 0)
    return [];
  const prefix = patch.slice(0, starts[0]);
  return starts.map((start, index) => ({
    header: patch.slice(start, patch.indexOf("\n", start)).trim(),
    patch: prefix + patch.slice(start, starts[index + 1]),
  }));
}
export async function gitStageHunk(projectDir: string, file: string, untracked: boolean, patch: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const root = (await run(["rev-parse", "--show-toplevel"], projectDir)).stdout.trim() || projectDir;
  const hunks = await gitHunks(root, file, untracked);
  const selected = hunks.find((hunk) => hunk.patch === patch);
  if (!selected)
    return { ok: false, error: "That change is no longer available. Refresh and try again." };
  const result = await new Promise<{
    stdout: string;
    stderr: string;
    code: number;
  }>((resolve) => {
    const child = execFile("git", ["apply", "--cached", "--unidiff-zero", "-"], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      const code = err && typeof (err as {
        code?: unknown;
      }).code === "number" ? (err as {
        code: number;
      }).code : err ? 1 : 0;
      resolve({ stdout, stderr, code });
    });
    child.stdin?.end(selected.patch);
  });
  if (result.code === 0)
    invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}
export async function gitRevertFile(projectDir: string, file: string) {
  const rootResult = await run(["rev-parse", "--show-toplevel"], projectDir);
  if (rootResult.code !== 0)
    return { ok: false, error: failure(rootResult) };
  const root = rootResult.stdout.trim();
  const status = await run(["status", "--porcelain=v1", "-z", "--", file], root);
  if (status.code !== 0)
    return { ok: false, error: failure(status) };
  if (!status.stdout || status.stdout.startsWith("??") || status.stdout[1] === " ")
    return { ok: false, error: "No tracked working-tree changes to revert." };
  const result = await run(["restore", "--worktree", "--", file], root);
  if (result.code === 0)
    invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}
export async function gitStageFile(projectDir: string, file: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const root = (await run(["rev-parse", "--show-toplevel"], projectDir)).stdout.trim() || projectDir;
  const result = await run(["add", "--", file], root);
  if (result.code === 0)
    invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}
async function unstage(projectDir: string, files: string[]) {
  const root = (await run(["rev-parse", "--show-toplevel"], projectDir)).stdout.trim() || projectDir;
  const head = await run(["rev-parse", "--verify", "HEAD"], root);
  const result = head.code === 0
    ? await run(["reset", "HEAD", "--", ...files], root)
    : await run(["rm", "-r", "--cached", "--", ...files], root);
  if (result.code === 0)
    invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}
export async function gitUnstageFile(projectDir: string, file: string, originalPath?: string) {
  const files = originalPath ? [file, originalPath] : [file];
  return await unstage(projectDir, files);
}
export async function gitStageAll(projectDir: string) {
  const result = await run(["add", "-A"], projectDir);
  if (result.code === 0)
    invalidateGitStatusCache(projectDir);
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
  if (patch.code !== 0)
    throw new Error(failure(patch));
  const diff = `${stat.stdout.trim()}\n\n${patch.stdout}`.trim();
  const limit = 120000;
  return diff.length > limit ? `${diff.slice(0, limit)}\n\n[diff truncated]` : diff;
}
export async function gitCommit(projectDir: string, message: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const staged = await run(["diff", "--cached", "--quiet"], projectDir);
  if (staged.code === 0)
    return { ok: false, error: "Stage at least one change before committing." };
  const result = await run(["commit", "-m", message], projectDir);
  if (result.code === 0)
    invalidateGitStatusCache(projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}
export async function gitPush(projectDir: string) {
  const [branch, upstream] = await Promise.all([
    run(["branch", "--show-current"], projectDir),
    run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], projectDir),
  ]);
  if (!branch.stdout.trim())
    return { ok: false, error: "Check out a branch before pushing." };
  let args = ["push"];
  if (upstream.code !== 0) {
    const name = branch.stdout.trim();
    const configured = await run(["config", "--get", `branch.${name}.pushRemote`], projectDir);
    const pushDefault = configured.stdout.trim() || (await run(["config", "--get", "remote.pushDefault"], projectDir)).stdout.trim();
    const branchRemote = pushDefault || (await run(["config", "--get", `branch.${name}.remote`], projectDir)).stdout.trim();
    args = ["push", "-u", branchRemote || "origin", "HEAD"];
  }
  const result = await run(args, projectDir);
  return result.code === 0 ? { ok: true } : { ok: false, error: failure(result) };
}
export async function gitSync(projectDir: string) {
  const upstream = await run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], projectDir);
  if (upstream.code !== 0)
    return await gitPush(projectDir);
  const pull = await run(["pull", "--ff-only"], projectDir);
  if (pull.code !== 0)
    return { ok: false, error: failure(pull) };
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
    runRepositoryCommand("gh", ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], projectDir),
  ]);
  const branch = current.stdout.trim() || undefined;
  const target: GitPrTarget = {
    branch,
    remote: remote.code === 0 ? remote.stdout.trim() || undefined : undefined,
    base: base.code === 0 ? base.stdout.trim() || undefined : undefined,
  };
  if (!branch)
    target.blocker = "You are not on a branch. Check one out before opening a pull request.";
  else if (!target.remote)
    target.blocker = "This repository has no “origin” remote to push to.";
  else if (!target.base)
    target.blocker = "GitHub CLI could not read this repository. Check that `gh` is installed and authenticated.";
  else if (branch === target.base)
    target.blocker = `You are on ${base.stdout.trim()}, the base branch. Create a branch before opening a pull request.`;
  return target;
}
export async function gitPushAndCreatePr(projectDir: string, title: string, body: string, expectedTarget?: GitPrTarget): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const target = await gitPrTarget(projectDir);
  if (target.blocker)
    return { ok: false, error: target.blocker };
  if (expectedTarget && ["branch", "base", "remote"].some(key => target[key as keyof GitPrTarget] !== expectedTarget[key as keyof GitPrTarget]))
    return { ok: false, error: "The pull request target changed. Review the branch and remote again before pushing." };
  const push = await run(["push", "-u", "origin", "HEAD"], projectDir);
  if (push.code !== 0)
    return { ok: false, error: failure(push) };
  const pr = await runRepositoryCommand("gh", ["pr", "create", "--base", target.base!, "--title", title, "--body", body], projectDir);
  return pr.code === 0 ? { ok: true, url: pr.stdout.trim() } : { ok: false, error: failure(pr) };
}
/** Git's own message is the useful one; ours would only be vaguer. */
function failure(res: {
  stdout: string;
  stderr: string;
}): string {
  return (res.stderr.trim() || res.stdout.trim() || "git failed").split("\n").slice(0, 4).join("\n");
}
function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}
export async function gitBranches(projectDir: string): Promise<GitBranch[]> {
  const here = await run(["rev-parse", "--show-toplevel"], projectDir);
  if (here.code !== 0)
    return [];
  const root = here.stdout.trim();
  // `%(worktreepath)` is empty unless the branch is checked out somewhere, which
  // is exactly the constraint that decides what a row is allowed to do.
  const res = await run(["for-each-ref", "--format=%(refname:short)%00%(worktreepath)%00%(HEAD)", "--sort=-committerdate", "refs/heads"], projectDir);
  if (res.code !== 0)
    return [];
  return res.stdout.split("\n").flatMap((line): GitBranch[] => {
    const [name, worktree, head] = line.trim().split("\0");
    if (!name)
      return [];
    // The current checkout is reported as a worktree too; only *other* worktrees
    // are worth naming, since those are the ones this checkout cannot take.
    const elsewhere = worktree && !samePath(worktree, root) ? path.normalize(worktree) : undefined;
    return [{ name, current: head === "*", worktree: elsewhere }];
  });
}
export async function gitCheckout(projectDir: string, branch: string, create: boolean): Promise<{
  ok: boolean;
  error?: string;
}> {
  const status = await run(["status", "--porcelain=v1", "--untracked-files=all"], projectDir);
  if (status.code !== 0)
    return { ok: false, error: failure(status) };
  if (status.stdout.trim()) {
    return { ok: false, error: "Commit or stash your changes before switching branches." };
  }
  const res = await run(create ? ["checkout", "-b", branch] : ["checkout", branch], projectDir);
  if (res.code === 0)
    invalidateGitStatusCache(projectDir);
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
  if (checkout.code !== 0 || commonDir.code !== 0)
    return null;
  const common = commonDir.stdout.trim();
  const mainRoot = path.basename(common) === ".git" ? path.dirname(common) : checkout.stdout.trim();
  const base = path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}-worktrees`);
  const slug = branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "branch";
  let candidate = path.join(base, slug);
  for (let n = 2; existsSync(candidate); n++)
    candidate = path.join(base, `${slug}-${n}`);
  return candidate;
}
export async function gitAddWorktree(projectDir: string, branch: string, create: boolean): Promise<{
  ok: boolean;
  path?: string;
  error?: string;
}> {
  const target = await worktreePathFor(projectDir, branch);
  if (!target)
    return { ok: false, error: "This folder is not a Git repository." };
  const res = await run(create ? ["worktree", "add", "-b", branch, target] : ["worktree", "add", target, branch], projectDir);
  return res.code === 0 ? { ok: true, path: target } : { ok: false, error: failure(res) };
}
