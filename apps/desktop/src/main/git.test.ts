import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gitAddWorktree, gitBranches, gitCheckout, gitCommit, gitDiff, gitHunks, gitLog, gitPush, gitRevertFile, gitStageAll, gitStagedDiff, gitStageFile, gitStageHunk, gitStatus, gitSync, gitUnstageAll, gitUnstageFile } from "./git.ts";
/**
* These run against a real repository rather than a mocked `git`.
*
* Everything worth getting wrong here is Git's own rule, not ours: a branch may
* be checked out in exactly one worktree, and `for-each-ref` reports the current
* checkout as a worktree like any other. A mock would happily agree with a wrong
* reading of both.
*/
async function repo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "nativepi-git-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  await writeFile(path.join(dir, "a.txt"), "a\n", "utf8");
  git("add", ".");
  git("commit", "-m", "init");
  return dir;
}
test("branches report the current one, and only worktrees other than this checkout", async () => {
  const dir = await repo();
  expect(await gitCheckout(dir, "feature", true)).toEqual({ ok: true });
  expect((await gitBranches(dir)).find((b) => b.name === "feature")).toEqual({
    name: "feature",
    current: true,
    worktree: undefined,
  });
  expect(await gitCheckout(dir, "main", false)).toEqual({ ok: true });
  // `feature` is not checked out anywhere now, so nothing may claim it is.
  const idle = await gitBranches(dir);
  expect(idle.find((b) => b.name === "feature")?.worktree).toBeUndefined();
  expect(idle.find((b) => b.name === "main")?.current).toBe(true);
  const added = await gitAddWorktree(dir, "feature", false);
  expect(added.ok).toBe(true);
  expect(existsSync(path.join(added.path!, "a.txt"))).toBe(true);
  const held = await gitBranches(dir);
  // The worktree holding `feature` is named; `main`, held by this checkout, is not.
  expect(held.find((b) => b.name === "feature")?.worktree).toBe(added.path);
  expect(held.find((b) => b.name === "main")?.worktree).toBeUndefined();
  // Git refuses a second checkout of the same branch; the message must survive.
  const again = await gitAddWorktree(dir, "feature", false);
  expect(again.ok).toBe(false);
  expect(again.error).toContain("feature");
});
test("a new worktree lands beside the repository, never inside it", async () => {
  const dir = await repo();
  const res = await gitAddWorktree(dir, "feat/one", true);
  expect(res.ok).toBe(true);
  expect(res.path!.startsWith(dir + path.sep)).toBe(false);
  expect(path.basename(res.path!)).toBe("feat-one");
  expect(path.basename(path.dirname(res.path!))).toBe(`${path.basename(dir)}-worktrees`);
  // Created inside the new worktree, so it is the worktree that holds it.
  expect((await gitBranches(dir)).find((b) => b.name === "feat/one")?.worktree).toBe(res.path);
});
test("a new worktree lands beside the checkout when the Git directory is separate", async () => {
  const source = await repo();
  const parent = await mkdtemp(path.join(tmpdir(), "nativepi-separate-git-"));
  const checkout = path.join(parent, "checkout");
  const gitDir = path.join(parent, "metadata");
  execFileSync("git", ["clone", `--separate-git-dir=${gitDir}`, source, checkout], { stdio: "pipe" });
  const res = await gitAddWorktree(checkout, "separate", true);
  expect(res.ok).toBe(true);
  expect(await realpath(path.dirname(res.path!))).toBe(await realpath(path.join(parent, "checkout-worktrees")));
});
test("branch switching refuses to carry uncommitted changes", async () => {
  const dir = await repo();
  expect(await gitCheckout(dir, "feature", true)).toEqual({ ok: true });
  expect(await gitCheckout(dir, "main", false)).toEqual({ ok: true });
  await writeFile(path.join(dir, "a.txt"), "changed\n", "utf8");
  const res = await gitCheckout(dir, "feature", false);
  expect(res.ok).toBe(false);
  expect(res.error).toContain("Commit or stash");
  expect((await gitBranches(dir)).find((branch) => branch.name === "main")?.current).toBe(true);
});
test("a checkout Git refuses returns its reason instead of claiming success", async () => {
  const dir = await repo();
  const res = await gitCheckout(dir, "does-not-exist", false);
  expect(res.ok).toBe(false);
  expect(res.error).toBeTruthy();
});
test("a selected hunk stages without staging its neighbour", async () => {
  const dir = await repo();
  await writeFile(path.join(dir, "a.txt"), "one\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\ntwenty\n", "utf8");
  execFileSync("git", ["add", "a.txt"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "lines"], { cwd: dir });
  await writeFile(path.join(dir, "a.txt"), "first\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\nb\n", "utf8");
  const hunks = await gitHunks(dir, "a.txt", false);
  expect(hunks.length).toBe(2);
  expect(await gitStageHunk(dir, "a.txt", false, hunks[0]!.patch)).toEqual({ ok: true });
  const status = await gitStatus(dir);
  expect(status.files).toEqual([{ path: "a.txt", state: "modified", staged: true, unstaged: true }]);
  expect(execFileSync("git", ["diff", "--cached"], { cwd: dir, encoding: "utf8" })).toContain("first");
  expect(execFileSync("git", ["diff"], { cwd: dir, encoding: "utf8" })).toContain("b");
});
test("a hunk that changed after display is not staged by a stale selection", async () => {
  const dir = await repo();
  await writeFile(path.join(dir, "a.txt"), "first\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\nb\n", "utf8");
  const [first] = await gitHunks(dir, "a.txt", false);
  await writeFile(path.join(dir, "a.txt"), "one\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\nb\n", "utf8");
  expect(await gitStageHunk(dir, "a.txt", false, first!.patch)).toEqual({ ok: false, error: "That change is no longer available. Refresh and try again." });
});
test("repository-relative files stay correct when a nested folder is opened", async () => {
  const dir = await repo();
  const nested = path.join(dir, "sub");
  await mkdir(nested);
  await writeFile(path.join(dir, "same.txt"), "root\n", "utf8");
  await writeFile(path.join(nested, "same.txt"), "nested\n", "utf8");
  const files = (await gitStatus(nested)).files.map((file) => file.path);
  expect(files).toEqual(["same.txt", "sub/same.txt"]);
  expect(await gitStageFile(nested, "same.txt")).toEqual({ ok: true });
  expect(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: dir, encoding: "utf8" }).trim()).toBe("same.txt");
});
test("a file without textual hunks can still be staged", async () => {
  const dir = await repo();
  await writeFile(path.join(dir, "image.bin"), Buffer.from([0, 1, 2, 3]));
  expect(await gitHunks(dir, "image.bin", false)).toEqual([]);
  expect(await gitStageFile(dir, "image.bin")).toEqual({ ok: true });
  expect((await gitStatus(dir)).files).toEqual([{ path: "image.bin", state: "added", staged: true, unstaged: false }]);
});
test("status totals include tracked and untracked text changes", async () => {
  const dir = await repo();
  await writeFile(path.join(dir, "a.txt"), "a\nb\n", "utf8");
  await writeFile(path.join(dir, "new.txt"), "new\n", "utf8");
  expect(await gitStatus(dir)).toMatchObject({ insertions: 2, deletions: 0 });
});
test("concurrent status callers share one repository scan", async () => {
  const dir = await repo();
  await writeFile(path.join(dir, "new.txt"), "one\ntwo\n", "utf8");
  const [first, second] = await Promise.all([gitStatus(dir), gitStatus(dir)]);
  expect(first).toBe(second);
});
test("source-control staging moves individual files or the whole working tree", async () => {
  const dir = await repo();
  await writeFile(path.join(dir, "a.txt"), "changed\n", "utf8");
  await writeFile(path.join(dir, "new.txt"), "new\n", "utf8");
  expect(await gitStageAll(dir)).toEqual({ ok: true });
  expect((await gitStatus(dir)).files.every((file) => file.staged)).toBe(true);
  expect(await gitUnstageFile(dir, "a.txt")).toEqual({ ok: true });
  expect((await gitStatus(dir)).files.find((file) => file.path === "a.txt")).toMatchObject({ staged: false, unstaged: true });
  expect((await gitStatus(dir)).files.find((file) => file.path === "new.txt")?.staged).toBe(true);
  expect(await gitUnstageAll(dir)).toEqual({ ok: true });
  expect((await gitStatus(dir)).files.every((file) => !file.staged && file.unstaged)).toBe(true);
});
test("unstaging also works before a repository has its first commit", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nativepi-unborn-git-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "pipe" });
  await writeFile(path.join(dir, "first.txt"), "first\n", "utf8");
  expect(await gitStageAll(dir)).toEqual({ ok: true });
  expect(await gitUnstageAll(dir)).toEqual({ ok: true });
  expect((await gitStatus(dir)).files).toEqual([{ path: "first.txt", state: "untracked", staged: false, unstaged: true }]);
});
test("staged and unstaged views read their own side of a partially staged file", async () => {
  const dir = await repo();
  await writeFile(path.join(dir, "a.txt"), "staged\n", "utf8");
  await gitStageFile(dir, "a.txt");
  await writeFile(path.join(dir, "a.txt"), "unstaged\n", "utf8");
  expect((await gitDiff(dir, "a.txt", false, true)).patch).toContain("+staged");
  expect((await gitDiff(dir, "a.txt", false, true)).patch).not.toContain("+unstaged");
  expect((await gitDiff(dir, "a.txt", false)).patch).toContain("+unstaged");
  expect(await gitStagedDiff(dir)).toContain("+staged");
  expect(await gitStagedDiff(dir)).not.toContain("+unstaged");
});
test("the commit graph distinguishes local commits from commits on a remote branch", async () => {
  const dir = await repo();
  const remote = await mkdtemp(path.join(tmpdir(), "nativepi-remote-"));
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: dir });
  expect(await gitPush(dir)).toEqual({ ok: true });
  await writeFile(path.join(dir, "a.txt"), "local\n", "utf8");
  execFileSync("git", ["add", "a.txt"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "local change"], { cwd: dir });
  const commits = await gitLog(dir);
  expect(commits[0]).toMatchObject({ subject: "local change", pushed: false });
  expect(commits.find((commit) => commit.subject === "init")).toMatchObject({ pushed: true });
  expect(await gitStatus(dir)).toMatchObject({ upstream: "origin/main", ahead: 1, behind: 0 });
});
test("first push honors Git's configured default remote", async () => {
  const dir = await repo();
  const origin = await mkdtemp(path.join(tmpdir(), "nativepi-origin-"));
  const publish = await mkdtemp(path.join(tmpdir(), "nativepi-publish-"));
  execFileSync("git", ["init", "--bare", origin], { stdio: "pipe" });
  execFileSync("git", ["init", "--bare", publish], { stdio: "pipe" });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: dir });
  execFileSync("git", ["remote", "add", "publish", publish], { cwd: dir });
  execFileSync("git", ["config", "remote.pushDefault", "publish"], { cwd: dir });
  expect(await gitPush(dir)).toEqual({ ok: true });
  expect(execFileSync("git", ["rev-parse", "refs/heads/main"], { cwd: publish, encoding: "utf8" })).toBeTruthy();
  expect(() => execFileSync("git", ["rev-parse", "refs/heads/main"], { cwd: origin, stdio: "pipe" })).toThrow();
});
test("sync fast-forwards from the upstream branch before pushing", async () => {
  const dir = await repo();
  const remote = await mkdtemp(path.join(tmpdir(), "nativepi-sync-remote-"));
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: dir });
  expect(await gitPush(dir)).toEqual({ ok: true });
  const cloneParent = await mkdtemp(path.join(tmpdir(), "nativepi-sync-clone-"));
  const clone = path.join(cloneParent, "checkout");
  execFileSync("git", ["clone", "-b", "main", remote, clone], { stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: clone });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: clone });
  await writeFile(path.join(clone, "remote.txt"), "remote\n", "utf8");
  execFileSync("git", ["add", "remote.txt"], { cwd: clone });
  execFileSync("git", ["commit", "-m", "remote change"], { cwd: clone });
  execFileSync("git", ["push"], { cwd: clone });
  expect(await gitSync(dir)).toEqual({ ok: true });
  expect(existsSync(path.join(dir, "remote.txt"))).toBe(true);
  expect(execFileSync("git", ["log", "-1", "--format=%s"], { cwd: dir, encoding: "utf8" }).trim()).toBe("remote change");
});
test("committing without staged changes is refused", async () => {
  const dir = await repo();
  expect(await gitCommit(dir, "feat: nothing")).toEqual({ ok: false, error: "Stage at least one change before committing." });
});
test("revert discards only unstaged tracked changes", async () => {
  const dir = await repo();
  await writeFile(path.join(dir, "a.txt"), "staged" + String.fromCharCode(10));
  await gitStageFile(dir, "a.txt");
  await writeFile(path.join(dir, "a.txt"), "unstaged" + String.fromCharCode(10));
  await writeFile(path.join(dir, "new.txt"), "untracked" + String.fromCharCode(10));
  expect(await gitRevertFile(dir, "new.txt")).toMatchObject({ ok: false });
  expect(await gitRevertFile(dir, "a.txt")).toEqual({ ok: true });
  expect((await readFile(path.join(dir, "a.txt"), "utf8")).replaceAll(String.fromCharCode(13), "")).toBe("staged" + String.fromCharCode(10));
  expect(await readFile(path.join(dir, "new.txt"), "utf8")).toBe("untracked" + String.fromCharCode(10));
  expect((await gitStatus(dir)).files.find((file) => file.path === "a.txt")).toMatchObject({ staged: true, unstaged: false });
  expect(await gitRevertFile(dir, "a.txt")).toMatchObject({ ok: false });
});
// Windows filenames cannot contain * or :, but brackets still exercise Git glob parsing.
const literalFilenames = process.platform === "win32" ? ["a[1].txt"] : ["a*.txt", "a[1].txt", ":(glob)*.txt"];
for (const selected of literalFilenames) {
  test(`file operations treat ${selected} literally`, async () => {
    const dir = await repo();
    try {
      for (const file of [selected, "a1.txt"])
        await writeFile(path.join(dir, file), "base\n");
      await gitStageAll(dir);
      await gitCommit(dir, "test: names");
      for (const file of [selected, "a1.txt"])
        await writeFile(path.join(dir, file), "changed\n");
      expect((await gitDiff(dir, selected, false)).patch).not.toContain("diff --git a/a1.txt");
      expect(await gitStageFile(dir, selected)).toEqual({ ok: true });
      expect(execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { cwd: dir, encoding: "utf8" })).toBe(selected + "\0");
      expect(await gitUnstageFile(dir, selected)).toEqual({ ok: true });
      expect(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: dir, encoding: "utf8" })).toBe("");
      expect(await gitRevertFile(dir, selected)).toEqual({ ok: true });
      expect(await readFile(path.join(dir, selected), "utf8")).toBe("base\n");
      expect(await readFile(path.join(dir, "a1.txt"), "utf8")).toBe("changed\n");
    }
    finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("untracked line counts survive status expiry and invalidate on rewrites, replacement and deletion", async () => {
  const { spyOn } = await import("bun:test");
  const fs = await import("node:fs");
  const { rename, stat, utimes } = await import("node:fs/promises");
  const dir = await repo();
  const file = path.join(dir, "cached.txt");
  await writeFile(file, "a\nb\n");
  let now = Date.now();
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  const reads = spyOn(fs, "createReadStream");
  const refresh = () => { now += 2000; return gitStatus(dir); };
  const fileReads = () => reads.mock.calls.filter(args => String(args[0]).endsWith("/cached.txt")).length;
  try {
    expect((await refresh()).insertions).toBe(2);
    expect(fileReads()).toBe(1);
    expect((await refresh()).insertions).toBe(2);
    expect(fileReads()).toBe(1);
    const original = await stat(file);
    await writeFile(file, "abcd"); // Same size, restored mtime: ctime must invalidate it.
    await utimes(file, original.atime, original.mtime);
    expect((await refresh()).insertions).toBe(1);
    expect(fileReads()).toBe(2);
    await writeFile(path.join(dir, "replacement"), "\n\n\n\n");
    await rename(path.join(dir, "replacement"), file);
    expect((await refresh()).insertions).toBe(4);
    await rm(file);
    expect((await refresh()).insertions).toBe(0);
    await writeFile(file, "last\n");
    expect((await refresh()).insertions).toBe(1);
  } finally { reads.mockRestore(); clock.mockRestore(); await rm(dir, { recursive: true, force: true }); }
});

test("status skips large untracked files and bounds the aggregate counting work", async () => {
  const { spyOn } = await import("bun:test");
  const fs = await import("node:fs");
  const dir = await repo();
  const reads = spyOn(fs, "createReadStream");
  let now = Date.now();
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  try {
    await writeFile(path.join(dir, "large.log"), "line\n".repeat(300_000));
    await writeFile(path.join(dir, "small.txt"), "one\ntwo\n");
    expect(await gitStatus(dir)).toMatchObject({ insertions: 2, lineCountsIncomplete: true });
    expect(reads.mock.calls.some(args => String(args[0]).endsWith("large.log"))).toBe(false);
    await rm(path.join(dir, "large.log"));
    await Promise.all(Array.from({ length: 10 }, (_, i) => writeFile(path.join(dir, `part-${i}.txt`), "\n".repeat(1024 * 1024))));
    reads.mockClear();
    now += 2000;
    expect((await gitStatus(dir)).lineCountsIncomplete).toBe(true);
    expect(reads.mock.calls.length).toBeLessThanOrEqual(8);
    // Budget misses are retried; cached counts do not consume the next budget.
    now += 2000;
    expect(await gitStatus(dir)).toMatchObject({ insertions: 10 * 1024 * 1024 + 2 });
    expect((await gitStatus(dir)).lineCountsIncomplete).toBeUndefined();
  } finally { reads.mockRestore(); clock.mockRestore(); await rm(dir, { recursive: true, force: true }); }
});

test("oversized hunks reject instead of returning truncated patches, while whole-file staging remains available", async () => {
  const { MAX_DIFF_PREVIEW_BYTES } = await import("../shared/diff-preview.ts");
  const dir = await repo();
  try {
    await writeFile(path.join(dir, "large.txt"), "row\n".repeat(MAX_DIFF_PREVIEW_BYTES));
    await expect(gitHunks(dir, "large.txt", true)).rejects.toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
    expect(await gitStageFile(dir, "large.txt")).toEqual({ ok: true });
    await writeFile(path.join(dir, "large.txt"), "changed\n".repeat(MAX_DIFF_PREVIEW_BYTES));
    await expect(gitHunks(dir, "large.txt", false)).rejects.toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
    await expect(gitHunks(dir, "../outside", true)).rejects.toThrow("outside");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("history searches literal commit messages and respects the requested page size", async () => {
  const dir = await repo();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("commit", "--allow-empty", "-m", "fix: literal [state]");
  git("commit", "--allow-empty", "-m", "fix: state");
  expect((await gitLog(dir, "[STATE]")).map(commit => commit.subject)).toEqual(["fix: literal [state]"]);
  expect((await gitLog(dir, "", 1)).length).toBe(1);
  expect((await gitLog(dir, "", 3)).length).toBe(3);
  await rm(dir, { recursive: true, force: true });
});

test("historical diffs support root commits and renames with literal unusual paths", async () => {
  const { gitCommitDetails, gitCommitDiff } = await import("./git.ts");
  const dir = await repo();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const first = git("rev-parse", "HEAD").trim();
  expect((await gitCommitDetails(dir, first)).files).toEqual([{ path: "a.txt", state: "A" }]);
  expect((await gitCommitDiff(dir, first, "a.txt")).patch).toContain("+a");
  const name = "a [1]\t文件.txt";
  git("mv", "a.txt", name);
  git("commit", "-m", "rename", "-m", "Keep the complete message.");
  const hash = git("rev-parse", "HEAD").trim();
  const detail = await gitCommitDetails(dir, hash);
  expect(detail.message).toBe("rename\n\nKeep the complete message.");
  expect(detail.files).toEqual([{ path: name, originalPath: "a.txt", state: "R" }]);
  expect((await gitCommitDiff(dir, hash, name)).patch).toContain("rename from a.txt");
  await expect(gitCommitDiff(dir, hash, "../outside")).rejects.toThrow("not part");
  await expect(gitCommitDetails(dir, "--all")).rejects.toThrow("Invalid commit");
  await expect(gitCommitDetails(dir, "a".repeat(40))).rejects.toThrow("no longer available");
  await rm(dir, { recursive: true, force: true });
});

test("merge history inspects files and diffs against the first parent", async () => {
  const { gitCommitDetails, gitCommitDiff } = await import("./git.ts");
  const dir = await repo();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("checkout", "-b", "feature");
  await writeFile(path.join(dir, "feature.txt"), "feature\n");
  git("add", "."); git("commit", "-m", "feature");
  git("checkout", "main");
  await writeFile(path.join(dir, "main.txt"), "main\n");
  git("add", "."); git("commit", "-m", "main");
  git("merge", "--no-ff", "feature", "-m", "merge feature");
  const hash = git("rev-parse", "HEAD").trim();
  expect((await gitCommitDetails(dir, hash)).files).toEqual([{ path: "feature.txt", state: "A" }]);
  expect((await gitCommitDiff(dir, hash, "feature.txt")).patch).toContain("+feature");
  await rm(dir, { recursive: true, force: true });
});
