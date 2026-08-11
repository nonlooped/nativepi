import { execFile } from "node:child_process";
import type {
  RepoHost,
  RepoHostCheck,
  RepoHostCompare,
  RepoHostCompareFile,
  RepoHostComment,
  RepoHostContext,
  RepoHostLinkedIssue,
} from "../shared/repo-host-types.ts";
import { repoHostContextSchema } from "../shared/repo-host-types.ts";

function run(cmd: string, args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      const code = err && typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ stdout, code });
    });
  });
}

/** github.com and self-hosted GitHub Enterprise both surface "github" somewhere in the remote host name; same idea for GitLab. */
export function detectHostFromRemoteUrl(remoteUrl: string): RepoHost | null {
  const remote = remoteUrl.trim();
  const host = (remote.match(/^[^@\s]+@([^:/\s]+)[:/]/)?.[1] ?? remote.match(/^[a-z]+:\/\/([^/:\s]+)/i)?.[1] ?? "").toLowerCase();
  if (host.includes("github")) return "github";
  if (host.includes("gitlab")) return "gitlab";
  return null;
}

async function detectHost(projectDir: string): Promise<RepoHost | null> {
  const remote = await run("git", ["remote", "get-url", "origin"], projectDir);
  if (remote.code !== 0) return null;
  return detectHostFromRemoteUrl(remote.stdout.trim());
}

/**
 * A bare issue has no CLI lookup by branch, unlike a PR/MR. The closest signal
 * a branch name gives is a leading or delimited issue number, the convention
 * `gh`/`glab` branch-creation helpers and most teams already follow (e.g.
 * `123-fix-thing`, `issue-123`, `feature/123-fix-thing`).
 */
export function issueNumberFromBranch(branch: string): number | null {
  const match = branch.match(/(?:^|[/_-])(\d+)(?:[/_-]|$)/);
  return match ? Number(match[1]) : null;
}

function safeJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** `git rev-list --left-right --count base...HEAD` prints "<behind>\t<ahead>". */
export function parseAheadBehind(output: string): { aheadBy: number; behindBy: number } | null {
  const parts = output.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const behindBy = Number(parts[0]);
  const aheadBy = Number(parts[1]);
  if (!Number.isFinite(behindBy) || !Number.isFinite(aheadBy)) return null;
  return { aheadBy, behindBy };
}

const NAME_STATUS: Record<string, RepoHostCompareFile["state"]> = { M: "modified", A: "added", D: "deleted", R: "renamed" };

/** `git diff --name-status base HEAD`: one `"X\tpath"` (or `"R100\told\tnew"`) line per file. */
export function parseNameStatus(output: string): RepoHostCompareFile[] {
  const files: RepoHostCompareFile[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const [code, ...paths] = line.split("\t");
    const state = NAME_STATUS[(code ?? "").slice(0, 1)] ?? "modified";
    const path = paths[paths.length - 1];
    if (path) files.push({ path, state });
  }
  return files;
}

async function resolveBaseRef(projectDir: string, baseBranch: string): Promise<string | null> {
  for (const candidate of [`origin/${baseBranch}`, baseBranch]) {
    const res = await run("git", ["rev-parse", "--verify", "--quiet", candidate], projectDir);
    if (res.code === 0) return candidate;
  }
  return null;
}

/** Never fetches: a base branch NativePi has not already fetched is quietly left out rather than making a network call on the user's behalf. */
async function compareToBase(projectDir: string, baseBranch: string): Promise<RepoHostCompare | undefined> {
  const baseRef = await resolveBaseRef(projectDir, baseBranch);
  if (!baseRef) return undefined;
  const [counts, diff] = await Promise.all([
    run("git", ["rev-list", "--left-right", "--count", `${baseRef}...HEAD`], projectDir),
    run("git", ["diff", "--no-color", "--name-status", `${baseRef}...HEAD`], projectDir),
  ]);
  const aheadBehind = counts.code === 0 ? parseAheadBehind(counts.stdout) : null;
  if (!aheadBehind) return undefined;
  return { baseRef: baseBranch, ...aheadBehind, files: diff.code === 0 ? parseNameStatus(diff.stdout) : [] };
}

interface GhPr {
  number: number;
  title: string;
  body?: string;
  url: string;
  state: string;
  isDraft?: boolean;
  author?: { login?: string };
  baseRefName?: string;
  comments?: { author?: { login?: string }; body: string; createdAt?: string; url?: string }[];
  reviews?: { author?: { login?: string }; body?: string; state?: string; submittedAt?: string }[];
  statusCheckRollup?: { name?: string; context?: string; workflowName?: string; conclusion?: string; state?: string; url?: string; detailsUrl?: string; targetUrl?: string }[];
  closingIssuesReferences?: { number: number; title: string; url: string }[];
}

const GH_PR_FIELDS =
  "number,title,body,url,state,isDraft,author,baseRefName,comments,reviews,statusCheckRollup,closingIssuesReferences";

function ghChecks(pr: GhPr): RepoHostCheck[] {
  return (pr.statusCheckRollup ?? []).map((check) => ({
    name: check.name ?? check.context ?? check.workflowName ?? "check",
    status: check.conclusion ?? check.state ?? "pending",
    url: check.detailsUrl ?? check.targetUrl ?? check.url,
  }));
}

function ghComments(pr: GhPr): RepoHostComment[] {
  const comments: RepoHostComment[] = (pr.comments ?? []).map((c) => ({
    author: c.author?.login,
    body: c.body,
    createdAt: c.createdAt,
    url: c.url,
  }));
  const reviews: RepoHostComment[] = (pr.reviews ?? [])
    .filter((r) => r.body || r.state)
    .map((r) => ({ author: r.author?.login, body: r.body ?? "", createdAt: r.submittedAt, reviewState: r.state }));
  return [...reviews, ...comments].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

async function githubPr(projectDir: string): Promise<RepoHostContext | null> {
  const res = await run("gh", ["pr", "view", "--json", GH_PR_FIELDS], projectDir);
  if (res.code !== 0) return null;
  const pr = safeJson<GhPr>(res.stdout);
  if (!pr) return null;
  return repoHostContextSchema.safeParse({
    host: "github",
    kind: "pr",
    number: pr.number,
    title: pr.title,
    body: pr.body,
    url: pr.url,
    state: pr.state,
    draft: pr.isDraft,
    author: pr.author?.login,
    comments: ghComments(pr),
    checks: ghChecks(pr),
    linkedIssues: (pr.closingIssuesReferences ?? []) as RepoHostLinkedIssue[],
    compare: pr.baseRefName ? await compareToBase(projectDir, pr.baseRefName) : undefined,
  }).data ?? null;
}

interface GhIssue {
  number: number;
  title: string;
  body?: string;
  url: string;
  state: string;
  author?: { login?: string };
  comments?: { author?: { login?: string }; body: string; createdAt?: string; url?: string }[];
}

async function githubIssue(projectDir: string, number: number): Promise<RepoHostContext | null> {
  const res = await run("gh", ["issue", "view", String(number), "--json", "number,title,body,url,state,author,comments"], projectDir);
  if (res.code !== 0) return null;
  const issue = safeJson<GhIssue>(res.stdout);
  if (!issue) return null;
  return repoHostContextSchema.safeParse({
    host: "github",
    kind: "issue",
    number: issue.number,
    title: issue.title,
    body: issue.body,
    url: issue.url,
    state: issue.state,
    author: issue.author?.login,
    comments: (issue.comments ?? []).map((c) => ({ author: c.author?.login, body: c.body, createdAt: c.createdAt, url: c.url })),
    checks: [],
    linkedIssues: [],
  }).data ?? null;
}

interface GlabMr {
  iid: number;
  title: string;
  description?: string;
  web_url: string;
  state: string;
  draft?: boolean;
  author?: { username?: string };
  target_branch?: string;
  head_pipeline?: { status?: string; detailed_status?: { text?: string }; web_url?: string };
}

interface GlabNote {
  author?: { username?: string };
  body: string;
  created_at?: string;
}

async function gitlabMr(projectDir: string): Promise<RepoHostContext | null> {
  const res = await run("glab", ["mr", "view", "--output", "json"], projectDir);
  if (res.code !== 0) return null;
  const mr = safeJson<GlabMr>(res.stdout);
  if (!mr) return null;

  const notes = await run("glab", ["api", `projects/:id/merge_requests/${mr.iid}/notes`], projectDir);
  const rawNotes = notes.code === 0 ? (safeJson<GlabNote[]>(notes.stdout) ?? []) : [];

  return repoHostContextSchema.safeParse({
    host: "gitlab",
    kind: "pr",
    number: mr.iid,
    title: mr.title,
    body: mr.description,
    url: mr.web_url,
    state: mr.state,
    draft: mr.draft,
    author: mr.author?.username,
    comments: rawNotes.map((n) => ({ author: n.author?.username, body: n.body, createdAt: n.created_at })),
    checks: mr.head_pipeline
      ? [{ name: "pipeline", status: mr.head_pipeline.status ?? mr.head_pipeline.detailed_status?.text ?? "pending", url: mr.head_pipeline.web_url }]
      : [],
    linkedIssues: [],
    compare: mr.target_branch ? await compareToBase(projectDir, mr.target_branch) : undefined,
  }).data ?? null;
}

interface GlabIssue {
  iid: number;
  title: string;
  description?: string;
  web_url: string;
  state: string;
  author?: { username?: string };
}

async function gitlabIssue(projectDir: string, number: number): Promise<RepoHostContext | null> {
  const res = await run("glab", ["issue", "view", String(number), "--output", "json"], projectDir);
  if (res.code !== 0) return null;
  const issue = safeJson<GlabIssue>(res.stdout);
  if (!issue) return null;
  return repoHostContextSchema.safeParse({
    host: "gitlab",
    kind: "issue",
    number: issue.iid,
    title: issue.title,
    body: issue.description,
    url: issue.web_url,
    state: issue.state,
    author: issue.author?.username,
    comments: [],
    checks: [],
    linkedIssues: [],
  }).data ?? null;
}

/**
 * The PR/MR NativePi presents is only ever what the user's own `gh`/`glab`
 * already resolves for the current branch. When neither CLI finds one, a
 * branch-name issue number is tried as a fallback; anything short of that
 * (no CLI installed, not authenticated, no match) is quietly `null` rather
 * than an error state, matching how the Changes pane treats "not a repo".
 */
async function loadRepoHostContext(projectDir: string, branch: string): Promise<RepoHostContext | null> {
  const host = await detectHost(projectDir);
  if (!host) return null;

  if (host === "github") {
    const pr = await githubPr(projectDir);
    if (pr) return pr;
    const issueNumber = issueNumberFromBranch(branch);
    return issueNumber ? await githubIssue(projectDir, issueNumber) : null;
  }

  const mr = await gitlabMr(projectDir);
  if (mr) return mr;
  const issueNumber = issueNumberFromBranch(branch);
  return issueNumber ? await gitlabIssue(projectDir, issueNumber) : null;
}

const repoHostCache = new Map<string, { revision: string; at: number; context: Promise<RepoHostContext | null> }>();
const REPO_HOST_TTL_MS = 30_000;

export async function getRepoHostContext(projectDir: string): Promise<RepoHostContext | null> {
  const revision = await run("git", ["rev-parse", "HEAD", "--abbrev-ref", "HEAD"], projectDir);
  if (revision.code !== 0) return null;
  const key = revision.stdout.trim();
  const cached = repoHostCache.get(projectDir);
  if (cached?.revision === key && Date.now() - cached.at < REPO_HOST_TTL_MS) return cached.context;
  const branch = key.split(/\r?\n/).at(-1) ?? "";
  const context = loadRepoHostContext(projectDir, branch);
  repoHostCache.set(projectDir, { revision: key, at: Date.now(), context });
  if (repoHostCache.size > 20) repoHostCache.delete(repoHostCache.keys().next().value as string);
  return context;
}
