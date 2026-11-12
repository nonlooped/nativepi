import { afterEach, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { readProjectDiffPreview } from "./diffPreview.ts";
import { MAX_DIFF_PREVIEW_BYTES } from "../shared/diff-preview.ts";
const roots: string[] = [];
async function project() { const root = await mkdtemp(join(tmpdir(), "nativepi-reader-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
test("refuses paths outside the project", async () => {
  const root = await project();
  await expect(readProjectDiffPreview(root, "../secret", "working")).rejects.toThrow();
});
test("reads working, staged, untracked and deleted changes, propagating Git failures", async () => {
  const root = await project();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
  await writeFile(join(root, "a.txt"), "base\n"); git("add", "."); git("commit", "-m", "initial");
  await writeFile(join(root, "a.txt"), "staged\n"); git("add", ".");
  await writeFile(join(root, "a.txt"), "working\n");
  const staged = await readProjectDiffPreview(root, "a.txt", "staged");
  const working = await readProjectDiffPreview(root, "a.txt", "working");
  expect(staged.kind === "diff" && staged.patch).toContain("+staged");
  expect(working.kind === "diff" && working.patch).toContain("+working");
  await writeFile(join(root, "new [1].txt"), "new\n");
  const added = await readProjectDiffPreview(root, "new [1].txt", "working");
  expect(added.kind === "diff" && added.patch).toContain("+new");
  await rm(join(root, "a.txt"));
  const deleted = await readProjectDiffPreview(root, "a.txt", "working");
  expect(deleted.kind === "diff" && deleted.patch).toContain("-staged");
  await expect(readProjectDiffPreview(await project(), "file", "working")).rejects.toThrow();
});
test("bounds Git output without treating truncated output as a valid patch", async () => {
  const root = await project(); execFileSync("git", ["init"], { cwd: root, stdio: "pipe" });
  await writeFile(join(root, "large.txt"), "x".repeat(MAX_DIFF_PREVIEW_BYTES + 1));
  expect((await readProjectDiffPreview(root, "large.txt", "working")).kind).toBe("large");
});
