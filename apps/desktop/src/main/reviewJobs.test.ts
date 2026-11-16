import { afterEach, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ReviewJobs } from "./reviewJobs.ts";
import { ReviewStore } from "./review.ts";
import { reviewJobOptionsSchema } from "../shared/review.ts";
import type { runCodeReviewer } from "./codeReviewer.ts";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true }))); });
async function fixture(reviewer: typeof runCodeReviewer) {
  const root = await mkdtemp(join(tmpdir(), "nativepi-review-jobs-")); roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-b", "main"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
  await writeFile(join(root, "a.txt"), "base\n"); git("add", "."); git("commit", "-m", "initial");
  await writeFile(join(root, "a.txt"), "staged\n"); git("add", "a.txt"); await writeFile(join(root, "a.txt"), "working\n");
  await writeFile(join(root, "b.txt"), "untracked\n");
  const reviews = new ReviewStore(join(root, ".git", "reviews"));
  const directory = join(root, ".git", "review-jobs");
  return { root, reviews, jobs: new ReviewJobs(directory, reviews, reviewer), directory };
}
const options = reviewJobOptionsSchema.parse({ model: "provider/reviewer" });
async function settled(jobs: ReviewJobs, root: string) {
  for (let i = 0; i < 100; i++) { const state = await jobs.state(root); if (state.jobs.at(-1)?.status !== "running") return state.jobs.at(-1)!; await new Promise(r => setTimeout(r, 10)); }
  throw new Error("Job did not settle");
}
test("host job captures combined multi-file inputs, prevents duplicates and survives renderer departure", async () => {
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof runCodeReviewer>>>();
  const { root, jobs, directory, reviews } = await fixture(async () => pending.promise);
  const started = await jobs.start(root, options);
  expect(started.inputs.map(i => i.file)).toEqual(["a.txt", "b.txt"]);
  expect(started.inputs[0]!.patch).toContain("+working");
  expect(started.inputs[0]!.patch).not.toContain("+staged");
  await expect(jobs.start(root, options)).rejects.toThrow("already running");
  expect((await new ReviewJobs(directory, reviews).state(root)).jobs[0]!.status).toBe("interrupted");
  pending.resolve({ notes: [{ file: "a.txt", range: { side: "new", start: 1, end: 1 }, body: "Concern" }], reviewerSession: "/sessions/review.jsonl", checks: [{ command: "bun test", exitCode: 1, output: "failed" }], verifications: [] });
  const done = await settled(jobs, root);
  expect(done.status).toBe("completed"); expect(done.checks[0]!.exitCode).toBe(1);
  expect((await reviews.snapshot(root, "a.txt", "working")).findings[0]!.body).toBe("Concern");
  await writeFile(join(root, "a.txt"), "later\n");
  expect((await jobs.state(root)).jobs[0]!.inputChanged).toBe(true);
});
test("Stop cancels host execution and records interruption without fabricated completion", async () => {
  const { root, jobs } = await fixture(async (_root, _diff, _model, signal) => new Promise((_resolve, reject) => { signal!.addEventListener("abort", () => reject(new Error("Review cancelled")), { once: true }); }));
  await jobs.start(root, options);
  // Wait for the reviewer to enter before cancelling; host collection remains abortable too.
  await new Promise(r => setTimeout(r, 50));
  await jobs.stop(root);
  const result = await settled(jobs, root);
  expect(result.status).toBe("interrupted"); expect(result.count).toBeUndefined();
});
test("reviewer failures retain captured input and honest error state", async () => {
  const { root, jobs } = await fixture(async () => { throw new Error("Provider unavailable"); });
  await jobs.start(root, { ...options, scope: "staged" });
  const result = await settled(jobs, root);
  expect(result.status).toBe("failed"); expect(result.message).toBe("Provider unavailable");
  expect(result.inputs).toHaveLength(1); expect(result.inputs[0]!.patch).toContain("+staged");
});
test("verification with no remaining diff retains named verdicts and detects stale fresh evidence", async () => {
  const { root, jobs, reviews } = await fixture(async (_root, _diff, _model, _signal, options, _inputs, issues) => {
    expect(issues).toContain("Original concern");
    return { notes: [], reviewerSession: "/sessions/verify.jsonl", checks: [], verifications: [{ id: options!.verifyIds[0]!, verdict: "fixed", evidence: "Current a.txt contains the corrected working value" }] };
  });
  const before = await reviews.snapshot(root, "a.txt", "working");
  const saved = await reviews.update(root, "a.txt", "working", before, { notes: [{ range: { side: "new", start: 1, end: 1 }, body: "Original concern" }] });
  execFileSync("git", ["add", "a.txt"], { cwd: root }); execFileSync("git", ["commit", "-m", "fix"], { cwd: root });
  await jobs.start(root, { ...options, scope: "file", file: "a.txt", verifyIds: [saved.findings[0]!.id] });
  const result = await settled(jobs, root);
  expect(result.status).toBe("completed"); expect(result.verifications[0]!.verdict).toBe("fixed");
  expect(result.verificationFiles[0]!.revision).toMatch(/^[a-f0-9]{64}$/);
  expect((await reviews.snapshot(root, "a.txt", "working")).findings[0]!.state).toBe("open");
  expect((await jobs.state(root)).jobs[0]!.inputChanged).toBe(false);
  await writeFile(join(root, "a.txt"), "regression\n");
  expect((await jobs.state(root)).jobs[0]!.inputChanged).toBe(true);
});
