import { z } from "zod";
import {
  delegateConfigurationSchema,
  threadReferenceSchema,
} from "./orchestration.ts";
const text = z.string().trim().min(1).max(500);
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
      repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      target: text.refine((v) => !v.startsWith("-")),
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
