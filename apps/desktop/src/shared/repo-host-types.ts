import { z } from "zod";

/**
 * Repo-host context: the GitHub or GitLab pull request / merge request (or, if
 * neither exists yet, issue) associated with the current branch, read through
 * the user's own `gh`/`glab` CLI authentication. NativePi does not talk to
 * GitHub or GitLab APIs directly and does not own any of this data — it is a
 * read-only presentation of what the CLI already reports.
 */

export type RepoHost = "github" | "gitlab";

export interface RepoHostCheck {
  name: string;
  /** e.g. "success", "failure", "pending", "skipped", "neutral" */
  status: string;
  url?: string;
}

export interface RepoHostComment {
  author?: string;
  body: string;
  createdAt?: string;
  url?: string;
  /** Present for a review rather than a plain comment, e.g. "APPROVED". */
  reviewState?: string;
}

export interface RepoHostLinkedIssue {
  number: number;
  title: string;
  url: string;
}

export interface RepoHostCompareFile {
  path: string;
  state: "modified" | "added" | "deleted" | "renamed";
}

export interface RepoHostCompare {
  baseRef: string;
  aheadBy: number;
  behindBy: number;
  files: RepoHostCompareFile[];
}

export interface RepoHostContext {
  host: RepoHost;
  kind: "pr" | "issue";
  number: number;
  title: string;
  body?: string;
  url: string;
  state: string;
  draft?: boolean;
  author?: string;
  comments: RepoHostComment[];
  checks: RepoHostCheck[];
  linkedIssues: RepoHostLinkedIssue[];
  compare?: RepoHostCompare;
}

export const repoHostContextSchema = z.object({
  host: z.enum(["github", "gitlab"]),
  kind: z.enum(["pr", "issue"]),
  number: z.number().int(),
  title: z.string(),
  body: z.string().optional(),
  url: z.string(),
  state: z.string(),
  draft: z.boolean().optional(),
  author: z.string().optional(),
  comments: z.array(z.object({ author: z.string().optional(), body: z.string(), createdAt: z.string().optional(), url: z.string().optional(), reviewState: z.string().optional() })),
  checks: z.array(z.object({ name: z.string(), status: z.string(), url: z.string().optional() })),
  linkedIssues: z.array(z.object({ number: z.number().int(), title: z.string(), url: z.string() })),
  compare: z.object({ baseRef: z.string(), aheadBy: z.number(), behindBy: z.number(), files: z.array(z.object({ path: z.string(), state: z.enum(["modified", "added", "deleted", "renamed"]) })) }).optional(),
}).passthrough();
