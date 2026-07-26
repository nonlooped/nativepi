import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gitAddWorktree, gitBranches, gitCheckout } from "./git.ts";

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
  expect(path.dirname(res.path!)).toBe(path.join(parent, "checkout-worktrees"));
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
