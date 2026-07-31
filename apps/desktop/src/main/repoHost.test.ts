import { expect, test } from "bun:test";
import { detectHostFromRemoteUrl, issueNumberFromBranch, parseAheadBehind, parseNameStatus } from "./repoHost.ts";

test("detectHostFromRemoteUrl recognizes github.com over SSH and HTTPS", () => {
  expect(detectHostFromRemoteUrl("git@github.com:owner/repo.git")).toBe("github");
  expect(detectHostFromRemoteUrl("https://github.com/owner/repo.git")).toBe("github");
});

test("detectHostFromRemoteUrl recognizes gitlab.com and self-hosted GitLab", () => {
  expect(detectHostFromRemoteUrl("git@gitlab.com:owner/repo.git")).toBe("gitlab");
  expect(detectHostFromRemoteUrl("https://gitlab.example.corp/owner/repo.git")).toBe("gitlab");
});

test("detectHostFromRemoteUrl returns null for an unrecognized host", () => {
  expect(detectHostFromRemoteUrl("https://git.sr.ht/~owner/repo")).toBeNull();
});

test("detectHostFromRemoteUrl uses only the hostname", () => {
  expect(detectHostFromRemoteUrl("git@gitlab.com:team/github-tools.git")).toBe("gitlab");
  expect(detectHostFromRemoteUrl("https://github.com/team/gitlab-tools.git")).toBe("github");
});

test("issueNumberFromBranch finds a leading issue number", () => {
  expect(issueNumberFromBranch("123-fix-thing")).toBe(123);
});

test("issueNumberFromBranch finds a delimited issue number after a prefix", () => {
  expect(issueNumberFromBranch("issue-123")).toBe(123);
  expect(issueNumberFromBranch("feature/123-fix-thing")).toBe(123);
});

test("issueNumberFromBranch returns null when the branch has no issue number", () => {
  expect(issueNumberFromBranch("main")).toBeNull();
  expect(issueNumberFromBranch("feature/repo-host-context")).toBeNull();
});

test("parseAheadBehind parses rev-list --left-right --count output", () => {
  expect(parseAheadBehind("2\t5")).toEqual({ behindBy: 2, aheadBy: 5 });
});

test("parseAheadBehind returns null for unexpected output", () => {
  expect(parseAheadBehind("")).toBeNull();
  expect(parseAheadBehind("not a number\t5")).toBeNull();
});

test("parseNameStatus parses modified, added, and deleted entries", () => {
  expect(parseNameStatus("M\tfoo.ts\nA\tbar.ts\nD\tbaz.ts")).toEqual([
    { path: "foo.ts", state: "modified" },
    { path: "bar.ts", state: "added" },
    { path: "baz.ts", state: "deleted" },
  ]);
});

test("parseNameStatus parses a rename entry, keeping the new path", () => {
  expect(parseNameStatus("R100\told.ts\tnew.ts")).toEqual([{ path: "new.ts", state: "renamed" }]);
});

test("parseNameStatus ignores blank lines", () => {
  expect(parseNameStatus("M\tfoo.ts\n\n")).toEqual([{ path: "foo.ts", state: "modified" }]);
});
