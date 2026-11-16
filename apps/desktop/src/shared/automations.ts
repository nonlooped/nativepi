import { z } from "zod";
import {
  delegateConfigurationSchema,
  threadReferenceSchema,
} from "./orchestration.ts";
const text = z.string().trim().min(1).max(500);
export const githubConnectionSchema = z.object({ state: z.enum(["ready", "sign-in", "missing", "unavailable"]), account: z.string().max(100).optional() });
export type GithubConnection = z.infer<typeof githubConnectionSchema>;
export const githubPullRequestSchema = z.string().url().transform((value, context) => {
  const url = new URL(value);
  const match = /^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)\/?$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || !match) {
    context.addIssue({ code: "custom", message: "Paste a GitHub pull request link, such as https://github.com/owner/repository/pull/42." });
    return z.NEVER;
  }
  return { repository: `${match[1]}/${match[2]}`, target: match[3]! };
});
export const automationTriggerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("once"),
    at: z.string().datetime({ offset: true }),
  }),
  z.object({
    kind: z.literal("daily"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: text.refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
  }),
  z.object({
    kind: z.literal("weekly"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: text.refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    weekday: z.number().int().min(0).max(6),
  }),
  z
    .object({
      kind: z.literal("github"),
      repository: z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/),
      target: text.refine((v) => !v.startsWith("-") && !v.includes("://")),
      failedChecks: z.boolean(),
      reviews: z.boolean(),
    })
    .refine((v) => v.failedChecks || v.reviews, "Select at least one event"),
]);
export const automationInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: text,
    prompt: z.string().trim().min(1).max(24000),
    enabled: z.boolean(),
    project: z
      .string()
      .min(1)
      .max(32767)
      .refine((v) => !v.includes("\0"))
      .nullable(),
    workspace: z.enum(["shared", "worktree"]),
    configuration: delegateConfigurationSchema,
    trigger: automationTriggerSchema,
  })
  .refine(
    (v) => v.workspace !== "worktree" || v.project !== null,
    "Worktrees require a project",
  );
export const automationSchema = z.object({
  input: automationInputSchema,
  id: z.string().uuid(),
  next: z.number().nullable(),
  seen: z.array(z.string()).max(2000),
  initialized: z.boolean(),
  failures: z.number().int().nonnegative(),
  pollFailures: z.number().int().nonnegative().optional(),
  lastPoll: z.number(),
});
export const automationRunSchema = z.object({
  id: z.string().uuid(),
  automationId: z.string().uuid(),
  name: z.string(),
  started: z.number(),
  ended: z.number().optional(),
  status: z.enum([
    "preparing",
    "dispatched",
    "needs-review",
    "failed",
    "skipped",
    "stopped",
    "interrupted",
  ]),
  detail: z.string(),
  context: z.string(),
  workspace: z.string().optional(),
  ref: threadReferenceSchema.optional(),
});
export const automationStateSchema = z.object({
  version: z.literal(1),
  automations: z.array(automationSchema).max(100),
  runs: z.array(automationRunSchema).max(1000),
});
export type AutomationInput = z.infer<typeof automationInputSchema>;
export type Automation = z.infer<typeof automationSchema>;
export type AutomationRun = z.infer<typeof automationRunSchema>;
export type AutomationState = z.infer<typeof automationStateSchema>;

export const automationToolsSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(500),
      description: z.string().max(32000).optional(),
    }),
  )
  .max(1000);
export type AutomationTool = z.infer<typeof automationToolsSchema>[number];
