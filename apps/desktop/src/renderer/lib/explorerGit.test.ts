import { expect, test } from "bun:test";
import type { GitChangedFile } from "../../shared/pi-types.ts";
import { buildGitOverlay } from "./explorerGit.ts";

const changed = (path: string, over: Partial<GitChangedFile> = {}): GitChangedFile => ({
  path,
  state: "modified",
  staged: false,
  unstaged: true,
  ...over,
});

test("a file is staged only when nothing is left unstaged", () => {
  const overlay = buildGitOverlay([
    changed("a.ts", { staged: true, unstaged: false }),
    changed("b.ts", { staged: true, unstaged: true }),
    changed("c.ts"),
  ]);
  expect(overlay.file.get("a.ts")).toBe("staged");
  expect(overlay.file.get("b.ts")).toBe("modified");
  expect(overlay.file.get("c.ts")).toBe("modified");
});

test("deleted and untracked outrank the staging flags", () => {
  const overlay = buildGitOverlay([
    changed("gone.ts", { state: "deleted", staged: true, unstaged: false }),
    changed("new.ts", { state: "untracked" }),
  ]);
  expect(overlay.file.get("gone.ts")).toBe("deleted");
  expect(overlay.file.get("new.ts")).toBe("untracked");
});

test("every folder above a change takes its tone", () => {
  const overlay = buildGitOverlay([changed("src/lib/store/git.ts", { state: "untracked" })]);
  expect(overlay.dir.get("src")).toBe("untracked");
  expect(overlay.dir.get("src/lib")).toBe("untracked");
  expect(overlay.dir.get("src/lib/store")).toBe("untracked");
  expect(overlay.dir.has("src/lib/store/git.ts")).toBe(false);
});

test("a folder whose descendants disagree falls back to modified", () => {
  const overlay = buildGitOverlay([
    changed("src/a.ts", { state: "untracked" }),
    changed("src/b.ts", { staged: true, unstaged: false }),
  ]);
  expect(overlay.dir.get("src")).toBe("modified");
});

test("a clean project colours nothing", () => {
  const overlay = buildGitOverlay([]);
  expect(overlay.file.size).toBe(0);
  expect(overlay.dir.size).toBe(0);
});
