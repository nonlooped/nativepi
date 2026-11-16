import { z } from "zod";
import { runRepositoryCommand } from "../repoCommand.ts";
import type { AutomationInput, GithubConnection } from "../../shared/automations.ts";
export async function githubConnection(cwd: string): Promise<GithubConnection> {
  const installed = await runRepositoryCommand("gh", ["--version"], cwd, 4096, 10000);
  if (installed.code) return { state: /ENOENT|not found|not recognized/i.test(installed.stderr) ? "missing" : "unavailable" };
  const account = await runRepositoryCommand("gh", ["api", "user", "--hostname", "github.com", "--jq", ".login"], cwd, 4096, 15000);
  if (!account.code && /^[a-z\d](?:[a-z\d-]{0,98}[a-z\d])?$/i.test(account.stdout.trim())) return { state: "ready", account: account.stdout.trim() };
  return { state: /auth login|not logged|401|403|token|credentials/i.test(account.stderr) ? "sign-in" : "unavailable" };
}
const prSchema = z.object({
  number: z.number(),
  headRefOid: z.string(),
  url: z.string(),
  statusCheckRollup: z
    .array(
      z
        .object({
          databaseId: z.number().optional(),
          name: z.string().optional(),
          context: z.string().optional(),
          conclusion: z.string().optional(),
          state: z.string().optional(),
          completedAt: z.string().optional(),
          detailsUrl: z.string().optional(),
          targetUrl: z.string().optional(),
        })
        .passthrough(),
    )
    .nullable(),
  reviews: z.array(
    z
      .object({
        id: z.string(),
        body: z.string(),
        state: z.string(),
        submittedAt: z.string().nullable(),
        commit: z.object({ oid: z.string() }).nullable(),
      })
      .passthrough(),
  ),
});
export type HostEvent = { key: string; context: string };
export async function githubEvents(
  trigger: Extract<AutomationInput["trigger"], { kind: "github" }>,
  cwd: string,
): Promise<HostEvent[]> {
  const result = await runRepositoryCommand(
    "gh",
    [
      "pr",
      "view",
      trigger.target,
      "--repo",
      trigger.repository,
      "--json",
      "number,headRefOid,url,statusCheckRollup,reviews",
    ],
    cwd,
    2 * 1024 * 1024,
    30000,
  );
  if (result.code) throw new Error(result.stderr || "GitHub watch unavailable");
  return parseGithubEvents(trigger, JSON.parse(result.stdout));
}

export function parseGithubEvents(
  trigger: Extract<AutomationInput["trigger"], { kind: "github" }>,
  raw: unknown,
): HostEvent[] {
  const pr = prSchema.parse(raw);
  const events: HostEvent[] = [];
  for (const check of pr.statusCheckRollup ?? [])
    if (
      trigger.failedChecks &&
      [
        "FAILURE",
        "ERROR",
        "TIMED_OUT",
        "ACTION_REQUIRED",
        "STARTUP_FAILURE",
      ].includes(check.conclusion ?? check.state ?? "")
    ) {
      const context = JSON.stringify({
        repository: trigger.repository,
        pr: pr.number,
        url: pr.url,
        commit: pr.headRefOid,
        check,
      });
      events.push({
        key: `check:${pr.headRefOid}:${check.databaseId ?? check.detailsUrl ?? check.targetUrl ?? check.name ?? check.context}:${check.completedAt ?? ""}:${check.conclusion ?? check.state}`,
        context,
      });
    }
  for (const review of pr.reviews.slice(-1000))
    if (
      trigger.reviews &&
      review.state !== "PENDING" &&
      (review.body || review.state === "CHANGES_REQUESTED")
    )
      events.push({
        key: `review:${review.id}:${review.submittedAt}`,
        context: JSON.stringify({
          repository: trigger.repository,
          pr: pr.number,
          url: pr.url,
          commit: pr.headRefOid,
          review,
        }),
      });
  return events;
}
