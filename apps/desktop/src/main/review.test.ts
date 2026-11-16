import { afterEach, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ReviewStore } from "./review.ts";
import { reviewContext, revisionPrompt } from "../shared/review.ts";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "nativepi-review-")); roots.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-b", "main"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
  await writeFile(join(dir, "a.txt"), "base\n"); git("add", "."); git("commit", "-m", "initial");
  await writeFile(join(dir, "a.txt"), "changed\n");
  const storage = join(dir, "metadata");
  return { dir, git, storage, store: new ReviewStore(storage) };
}
const note = { range: { side: "new" as const, start: 1, end: 1 }, body: "Check this behavior" };
test("findings survive reopen, code edits become stale without resolving, state changes persist", async () => {
  const { dir, storage, store } = await fixture();
  const initial = await store.snapshot(dir, "a.txt", "working");
  const saved = await store.update(dir, "a.txt", "working", initial, { notes: [note] });
  expect(saved.findings[0]).toMatchObject({ context: "1: changed", stale: false, state: "open" });
  const reopened = new ReviewStore(storage);
  await writeFile(join(dir, "a.txt"), "shifted\nchanged\n");
  const edited = await reopened.snapshot(dir, "a.txt", "working");
  expect(edited.findings[0]).toMatchObject({ stale: true, state: "open", range: note.range, context: "1: changed" });
  expect(revisionPrompt(edited.findings)).toContain("STALE anchor");
  const resolved = await reopened.update(dir, "a.txt", "working", edited, { id: edited.findings[0]!.id, state: "resolved" });
  expect(resolved.findings[0]!.state).toBe("resolved");
  const dismissed = await reopened.update(dir, "a.txt", "working", resolved, { id: resolved.findings[0]!.id, state: "dismissed" });
  const open = await reopened.update(dir, "a.txt", "working", dismissed, { id: dismissed.findings[0]!.id, state: "open" });
  expect(open.findings[0]!.stale).toBe(true);
});
test("rejects outdated saves, invalid lines and conflicting metadata writers; preserves unknown fields", async () => {
  const { dir, store, storage } = await fixture();
  const initial = await store.snapshot(dir, "a.txt", "working");
  await expect(store.update(dir, "a.txt", "working", initial, { notes: [{ ...note, range: { ...note.range, start: 50, end: 50 } }] })).rejects.toThrow("Select lines");
  const saved = await store.update(dir, "a.txt", "working", initial, { notes: [note] });
  await expect(store.update(dir, "a.txt", "working", initial, { notes: [note] })).rejects.toThrow("changed");
  const file = join(storage, `${saved.scope}.json`);
  const document = JSON.parse(await readFile(file, "utf8")); document.future = { x: 1 }; document.findings[0].future = 2;
  await writeFile(file, JSON.stringify(document));
  await expect(store.update(dir, "a.txt", "working", saved, { id: saved.findings[0]!.id, state: "resolved" })).rejects.toThrow("changed");
  const latest = await store.snapshot(dir, "a.txt", "working");
  await store.update(dir, "a.txt", "working", latest, { id: latest.findings[0]!.id, state: "resolved" });
  const result = JSON.parse(await readFile(file, "utf8")); expect(result.future).toEqual({ x: 1 }); expect(result.findings[0].future).toBe(2);
  await writeFile(join(dir, "a.txt"), "external edit\n");
  await expect(store.update(dir, "a.txt", "working", await store.snapshot(dir, "a.txt", "working").then(s => ({ ...s, fingerprint: latest.fingerprint })), { notes: [note] })).rejects.toThrow("changed");
});
test("branches and worktrees isolate findings and staging invalidates the original side", async () => {
  const { dir, git, store } = await fixture();
  const initial = await store.snapshot(dir, "a.txt", "working");
  await store.update(dir, "a.txt", "working", initial, { notes: [note] });
  git("checkout", "-b", "other");
  expect((await store.snapshot(dir, "a.txt", "working")).findings).toEqual([]);
  git("checkout", "main");
  expect((await store.snapshot(dir, "a.txt", "working")).findings).toHaveLength(1);
  const other = `${dir}-worktree`; roots.push(other); git("worktree", "add", "-b", "worktree", other);
  expect((await store.snapshot(other, "a.txt", "working")).findings).toEqual([]);
  git("add", "a.txt");
  expect((await store.snapshot(dir, "a.txt", "working")).findings[0]!.stale).toBe(true);
});
test("range context distinguishes deletion and addition sides and refuses gaps", () => {
  const patch = "@@ -1,2 +1,2 @@\n-before\n+after\n same\n@@ -20 +20 @@\n-last\n+next";
  expect(reviewContext(patch, { side: "old", start: 1, end: 2 })).toBe("1: before\n2: same");
  expect(reviewContext(patch, { side: "new", start: 1, end: 1 })).toBe("1: after");
  expect(() => reviewContext(patch, { side: "new", start: 2, end: 20 })).toThrow();
});

test("empty re-reviews preserve open findings and keep the Pi evidence reference", async () => {
  const { dir, store, storage } = await fixture();
  const initial = await store.snapshot(dir, "a.txt", "working");
  const saved = await store.update(dir, "a.txt", "working", initial, { notes: [note] });
  const reviewed = await store.update(dir, "a.txt", "working", saved, { notes: [], reviewerSession: "/sessions/review.jsonl", model: "provider/reviewer" });
  expect(reviewed.findings[0]!.state).toBe("open");
  expect((await new ReviewStore(storage).snapshot(dir, "a.txt", "working")).runs).toMatchObject([{ sessionFile: "/sessions/review.jsonl", model: "provider/reviewer" }]);
});

test("simultaneous saves cannot drop or duplicate findings", async () => {
  const { dir, store } = await fixture();
  const initial = await store.snapshot(dir, "a.txt", "working");
  const saves = await Promise.allSettled([store.update(dir, "a.txt", "working", initial, { notes: [note] }), store.update(dir, "a.txt", "working", initial, { notes: [note] })]);
  expect(saves.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect((await store.snapshot(dir, "a.txt", "working")).findings).toHaveLength(1);
});


test("saved feedback can be resolved after the file is removed or becomes too large", async () => {
  const { dir, git, store } = await fixture();
  const saved = await store.update(dir, "a.txt", "working", await store.snapshot(dir, "a.txt", "working"), { notes: [note] });
  git("rm", "-f", "a.txt"); git("commit", "-m", "remove");
  const missing = await store.snapshot(dir, "a.txt", "working");
  expect(missing.findings[0]).toMatchObject({ context: "1: changed", stale: true });
  const resolved = await store.update(dir, "a.txt", "working", missing, { id: saved.findings[0]!.id, state: "resolved" });
  expect(resolved.findings[0]!.state).toBe("resolved");
  await writeFile(join(dir, "a.txt"), "large".repeat(1_000_000));
  const large = await store.snapshot(dir, "a.txt", "working");
  expect(large.patch).toBe("");
  expect(large.findings[0]!.state).toBe("resolved");
  expect((await store.update(dir, "a.txt", "working", large, { id: saved.findings[0]!.id, state: "open" })).findings[0]!.state).toBe("open");
});
