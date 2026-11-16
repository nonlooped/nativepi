import { expect, test } from "bun:test";
import { parseGithubEvents } from "./github.ts";
import { githubPullRequestSchema, automationTriggerSchema } from "../../shared/automations.ts";
const trigger = {
  kind: "github" as const,
  repository: "owner/repo",
  target: "4",
  failedChecks: true,
  reviews: true,
};
const failed = {
  databaseId: 42,
  name: "typecheck",
  conclusion: "FAILURE",
  completedAt: "2026-11-16T00:00:00Z",
  detailsUrl: "https://github.com/owner/repo/actions/runs/42",
};
const pr = {
  number: 4,
  headRefOid: "exact-head",
  url: "https://github.com/owner/repo/pull/4",
  statusCheckRollup: [
    failed,
    { name: "pending", conclusion: "", state: "PENDING" },
  ],
  reviews: [
    {
      id: "review-1",
      body: "Fix the parser",
      state: "CHANGES_REQUESTED",
      submittedAt: "2026-11-16T00:00:00Z",
      commit: { oid: "reviewed-head" },
    },
  ],
};
test("GitHub events carry exact revision/check/review context and only relevant failures", () => {
  const events = parseGithubEvents(trigger, pr);
  expect(events).toHaveLength(2);
  expect(JSON.parse(events[0]!.context)).toMatchObject({
    commit: "exact-head",
    check: failed,
  });
  expect(JSON.parse(events[1]!.context).review).toMatchObject({
    body: "Fix the parser",
    commit: { oid: "reviewed-head" },
  });
  expect(
    parseGithubEvents(trigger, { ...pr, headRefOid: "new-head" })[0]!.key,
  ).not.toBe(events[0]!.key);
  expect(
    parseGithubEvents(trigger, {
      ...pr,
      statusCheckRollup: [{ ...failed, completedAt: "2026-11-16T01:00:00Z" }],
    })[0]!.key,
  ).not.toBe(events[0]!.key);
  expect(parseGithubEvents({ ...trigger, reviews: false }, pr)).toHaveLength(1);
  expect(() =>
    parseGithubEvents(trigger, { ...pr, headRefOid: null }),
  ).toThrow();
});
test("GitHub pull request links normalize familiar URLs while unsupported URLs cannot become branch watches", () => {
  expect(githubPullRequestSchema.parse("https://github.com/team/project/pull/42?tab=files#note")).toEqual({ repository: "team/project", target: "42" });
  expect(githubPullRequestSchema.safeParse("https://example.com/team/project/pull/42").success).toBe(false);
  expect(githubPullRequestSchema.safeParse("https://github.com/team/project/issues/42").success).toBe(false);
  expect(automationTriggerSchema.safeParse({ ...trigger, target: "https://example.com/wrong" }).success).toBe(false);
});
