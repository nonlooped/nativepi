import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const DEFAULT_MAX_CONCURRENCY = 6;
export const MAX_CONFIGURED_CONCURRENCY = 32;
export const concurrencySchema = z.number().int().min(1).max(MAX_CONFIGURED_CONCURRENCY);
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export const thinkingLevelSchema = z.enum(THINKING_LEVELS);
export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;
export const SUBAGENT_TOOL_NAMES = ["subagent_spawn", "subagent_status", "subagent_list", "subagent_wait", "subagent_cancel"] as const;

export const subagentSettingsSchema = z.object({
  userMaxConcurrency: concurrencySchema,
  effectiveMaxConcurrency: concurrencySchema,
  projectMaxConcurrency: concurrencySchema.nullable(),
});
export type SubagentSettings = z.infer<typeof subagentSettingsSchema>;

export const subagentStatusSchema = z.enum([
  "queued",
  "running",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
]);
export type SubagentStatus = z.infer<typeof subagentStatusSchema>;

const subagentUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  totalTokens: z.number(),
  cost: z.number(),
});

const conversationBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("thinking"), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    id: z.string(),
    name: z.string(),
    status: z.enum(["running", "completed", "failed", "cancelled"]),
    arguments: z.string().optional(),
    result: z.string().optional(),
  }),
]);
export type SubagentConversationBlock = z.infer<typeof conversationBlockSchema>;

const conversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.array(conversationBlockSchema),
  timestamp: z.number().optional(),
  error: z.string().optional(),
});
export type SubagentConversationMessage = z.infer<typeof conversationMessageSchema>;

export const subagentSummarySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  prompt: z.string(),
  status: subagentStatusSchema,
  model: z.string(),
  thinkingLevel: z.string(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  error: z.string().optional(),
  turns: z.number().int().nonnegative(),
  toolCount: z.number().int().nonnegative(),
  usage: subagentUsageSchema,
});
export type SubagentSummary = z.infer<typeof subagentSummarySchema>;

export const subagentOverviewSchema = z.object({
  settings: subagentSettingsSchema,
  jobs: z.array(subagentSummarySchema),
});
export type SubagentOverview = z.infer<typeof subagentOverviewSchema>;

export const subagentDetailSchema = subagentSummarySchema.extend({
  fullOutputFile: z.string().optional(),
  conversation: z.array(conversationMessageSchema),
});
export type SubagentDetail = z.infer<typeof subagentDetailSchema>;

const idParamsSchema = z.object({ id: z.string() });

export const subagentsProtocol = defineProtocol({
  methods: {
    overview: { result: subagentOverviewSchema },
    detail: { params: idParamsSchema, result: subagentDetailSchema },
    cancel: { params: idParamsSchema, result: subagentDetailSchema },
    setMaxConcurrency: {
      params: z.object({ maxConcurrency: concurrencySchema }),
      result: subagentOverviewSchema,
    },
  },
  events: { changed: subagentOverviewSchema },
});
