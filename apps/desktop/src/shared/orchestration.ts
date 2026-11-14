import { z } from "zod";
import { thinkingLevelSchema } from "./pi-values.ts";
import { serviceTierSchema } from "./service-tier.ts";

export const ORCHESTRATION_ENTRY = "nativepi-orchestration";
const id = z.string().min(1).max(500);
const sessionPath = z.string().min(1).max(32767).refine(value => !value.includes("\0"), "Invalid session path");
export const threadReferenceSchema = z.object({ id, cwd: sessionPath, file: sessionPath, title: z.string().optional() });
export type ThreadReference = z.infer<typeof threadReferenceSchema>;
export const delegateConfigurationSchema = z.object({ provider: id, model: id, reasoning: thinkingLevelSchema, tier: serviceTierSchema.optional(), tools: z.array(id).max(1000) });
export const workspaceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("shared"), path: z.string() }),
  z.object({ mode: z.literal("worktree"), path: z.string(), branch: id, base: id, repository: z.string() }),
]);
export const assignmentStateSchema = z.enum(["preparing", "running", "waiting", "completed", "stopped", "failed", "interrupted"]);
export const relationshipSchema = z.object({ operationId: id, sourceToolCallId: id.optional(), lead: threadReferenceSchema, delegate: threadReferenceSchema, label: id, configuration: delegateConfigurationSchema, workspace: workspaceSchema });
export const assignmentSchema = z.object({ id, delegate: threadReferenceSchema, taskMessageId: id, attempt: z.number().int().positive(), state: assignmentStateSchema, questions: z.array(id), resultEntry: id.optional(), reason: z.string().max(4000).optional() });
export const orchestrationMessageSchema = z.object({ id, operationId: id, source: threadReferenceSchema, destination: threadReferenceSchema, kind: z.enum(["task", "follow-up", "progress", "question", "reply", "result", "peer"]), assignmentId: id.optional(), replyTo: id.optional(), timestamp: z.string().datetime(), content: z.string().min(1).max(32000) });
const base = { version: z.literal(1), sessionId: id, operationId: id };
export const orchestrationRecordSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("relationship"), relationship: relationshipSchema }),
  z.object({ ...base, kind: z.literal("assignment"), assignment: assignmentSchema }),
  z.object({ ...base, kind: z.literal("configuration"), configuration: delegateConfigurationSchema }),
  z.object({ ...base, kind: z.literal("intent"), action: id, target: id.optional() }),
  z.object({ ...base, kind: z.literal("operation"), action: id, ref: threadReferenceSchema.optional(), workspace: workspaceSchema.optional(), status: z.enum(["allocated", "accepted", "failed"]), reason: z.string().optional() }),
  z.object({ ...base, kind: z.literal("message"), message: orchestrationMessageSchema, stage: z.enum(["outbox", "inbox", "consumed", "acknowledged", "read"]) }),
  z.object({ ...base, kind: z.literal("stop"), generation: z.number().int().nonnegative() }),
]);
export type OrchestrationRecord = z.infer<typeof orchestrationRecordSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type OrchestrationMessage = z.infer<typeof orchestrationMessageSchema>;
export const orchestrationErrorCodes = ["not_found", "wrong_role", "not_owner", "unsupported_configuration", "unavailable_tool", "busy", "stopped", "external_session_change", "delivery_pending", "startup_failed", "interrupted"] as const;
export class OrchestrationError extends Error {
  readonly code: typeof orchestrationErrorCodes[number];
  constructor(code: typeof orchestrationErrorCodes[number], message: string) { super(message); this.code = code; }
}
export const orchestrationRequestSchema = z.object({ type: z.literal("nativepi_orchestration_request"), requestId: id, operationId: id, action: id, params: z.record(z.string(), z.unknown()) });
export const orchestrationReplySchema = z.object({ type: z.literal("nativepi_orchestration_reply"), requestId: id, result: z.unknown().optional(), error: z.string().optional() });
export const orchestrationCancelSchema = z.object({ type: z.literal("nativepi_orchestration_cancel"), requestId: id });
export const orchestrationHostSchema = z.object({ type: z.literal("nativepi_orchestration_host"), requestId: id, sessionId: id, action: z.enum(["catalog", "append", "configure", "dispatch", "context", "arm"]), payload: z.unknown().optional() });

const page = { cursor: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() };
const target = { threadId: id };
const config = delegateConfigurationSchema;
export const orchestrationOperations = {
  orchestration_catalog: z.object({ cwd: z.string().min(1).optional() }),
  delegate_spawn: z.object({ label: id, task: z.string().min(1).max(32000), configuration: config, workspace: z.object({ mode: z.enum(["shared", "worktree"]), branch: id.optional(), base: id.optional() }).optional() }),
  delegate_message: z.object({ delegateId: id, content: z.string().min(1).max(32000), replyTo: id.optional(), resume: z.boolean().optional() }),
  delegate_inspect: z.object({ delegateIds: z.array(id).optional() }),
  delegate_wait: z.object({ delegateIds: z.array(id).min(1), assignmentIds: z.record(id, id).optional(), all: z.boolean().optional(), timeout: z.number().int().min(0).max(3600000).optional() }),
  delegate_stop: z.object({ delegateId: id }),
  lead_message: z.object({ content: z.string().min(1).max(32000), needsReply: z.boolean() }),
  thread_list: z.object({ ...page, cwd: z.string().optional(), state: z.enum(["focus", "finished"]).optional() }),
  thread_search: z.object({ ...page, query: z.string().trim().min(1).max(500), cwd: z.string().optional() }),
  thread_read: z.object({ ...target, ...page, leafId: id.optional(), includeTools: z.boolean().optional(), includeThinking: z.boolean().optional() }),
  thread_create: z.object({ title: id, cwd: z.string().min(1).optional(), configuration: config, prompt: z.string().min(1).max(32000).optional(), start: z.boolean().optional() }),
  thread_message: z.object({ ...target, content: z.string().min(1).max(32000) }),
  thread_inbox: z.object({ ...page }),
  thread_wake: z.object({ ...target, messageIds: z.array(id).min(1).max(100) }),
  thread_stop: z.object(target), thread_finish: z.object(target), thread_delete: z.object(target),
} as const;
export type OrchestrationAction = keyof typeof orchestrationOperations;
export const delegateSummarySchema = z.object({ startupError: z.string().optional(), status: assignmentStateSchema.optional(), available: z.boolean().optional(), roleUnavailable: z.boolean().optional(), ref: threadReferenceSchema, relationship: relationshipSchema.optional(), assignment: assignmentSchema.optional(), running: z.boolean() });
export const threadSnapshotSchema = delegateSummarySchema.extend({ readMessageIds: z.array(z.string()), reports: z.array(orchestrationMessageSchema), inbox: z.array(orchestrationMessageSchema), pendingDelivery: z.array(orchestrationMessageSchema), delegates: z.array(delegateSummarySchema), busy: z.boolean() });
export const orchestrationSnapshotSchema = z.object({ revision: z.number().int().nonnegative(), threads: z.array(threadSnapshotSchema) });
export type OrchestrationSnapshot = z.infer<typeof orchestrationSnapshotSchema>;
export type ThreadSnapshot = z.infer<typeof threadSnapshotSchema>;
export const organizationSnapshotSchema = z.object({ revision: z.number().int().nonnegative(), pinnedChats: z.array(z.string()), focusedChats: z.array(z.string()), finishedChats: z.record(z.string(), z.string()), focusStartedAt: z.string().optional() });
export type OrganizationSnapshot = z.infer<typeof organizationSnapshotSchema>;

export const orchestrationOutcomeSchema = z.object({ type: z.literal("nativepi_orchestration_outcome"), sessionId: id, assignmentId: id, attempt: z.number().int().positive(), taskMessageId: id, aborted: z.boolean(), resultEntry: id.optional(), stopReason: z.string().optional(), reason: z.string().optional() });

export const orchestrationSuppliedSchema = z.object({ type: z.literal("nativepi_orchestration_supplied"), sessionId: id, messageId: id });
export const orchestrationRuntimeSchema = z.object({ type: z.literal("nativepi_orchestration_runtime"), sessionId: id, running: z.boolean() });
