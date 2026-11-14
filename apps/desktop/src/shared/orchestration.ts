import { z } from "zod";
import { thinkingLevelSchema } from "./pi-values.ts";
import { serviceTierSchema } from "./service-tier.ts";

export const ORCHESTRATION_ENTRY = "nativepi-orchestration";
const id = z.string().min(1).max(500);
export const threadReferenceSchema = z.object({ id, cwd: z.string().min(1), file: z.string().min(1) });
export type ThreadReference = z.infer<typeof threadReferenceSchema>;
export const delegateConfigurationSchema = z.object({ provider: id, model: id, reasoning: thinkingLevelSchema, tier: serviceTierSchema.optional(), tools: z.array(id).max(1000) });
export const workspaceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("shared"), path: z.string() }),
  z.object({ mode: z.literal("worktree"), path: z.string(), branch: id, base: id, repository: z.string() }),
]);
export const assignmentStateSchema = z.enum(["preparing", "running", "waiting", "completed", "stopped", "failed", "interrupted"]);
export const relationshipSchema = z.object({ operationId: id, lead: threadReferenceSchema, delegate: threadReferenceSchema, label: id, configuration: delegateConfigurationSchema, workspace: workspaceSchema });
export const assignmentSchema = z.object({ id, delegate: threadReferenceSchema, taskMessageId: id, attempt: z.number().int().positive(), state: assignmentStateSchema, questions: z.array(id), resultEntry: id.optional(), reason: z.string().max(4000).optional() });
export const orchestrationMessageSchema = z.object({ id, operationId: id, source: threadReferenceSchema, destination: threadReferenceSchema, kind: z.enum(["task", "follow-up", "progress", "question", "reply", "result", "peer"]), assignmentId: id.optional(), replyTo: id.optional(), timestamp: z.string().datetime(), content: z.string().min(1).max(32000) });
const base = { version: z.literal(1), sessionId: id, operationId: id };
export const orchestrationRecordSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("relationship"), relationship: relationshipSchema }),
  z.object({ ...base, kind: z.literal("assignment"), assignment: assignmentSchema }),
  z.object({ ...base, kind: z.literal("intent"), action: id, target: id.optional() }),
  z.object({ ...base, kind: z.literal("message"), message: orchestrationMessageSchema, stage: z.enum(["outbox", "inbox", "consumed", "acknowledged"]) }),
  z.object({ ...base, kind: z.literal("stop"), generation: z.number().int().nonnegative() }),
]);
export type OrchestrationRecord = z.infer<typeof orchestrationRecordSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type OrchestrationMessage = z.infer<typeof orchestrationMessageSchema>;
export const orchestrationErrorCodes = ["not_found", "wrong_role", "not_owner", "unsupported_configuration", "unavailable_tool", "busy", "stopped", "external_session_change", "delivery_pending", "startup_failed", "interrupted"] as const;
export class OrchestrationError extends Error {
  constructor(readonly code: typeof orchestrationErrorCodes[number], message: string) { super(message); }
}
export const orchestrationRequestSchema = z.object({ type: z.literal("nativepi_orchestration_request"), requestId: id, operationId: id, action: id, params: z.record(z.string(), z.unknown()) });
export const orchestrationReplySchema = z.object({ type: z.literal("nativepi_orchestration_reply"), requestId: id, result: z.unknown().optional(), error: z.string().optional() });
export const orchestrationCancelSchema = z.object({ type: z.literal("nativepi_orchestration_cancel"), requestId: id });
export const orchestrationHostSchema = z.object({ type: z.literal("nativepi_orchestration_host"), requestId: id, sessionId: id, action: z.enum(["catalog", "append", "configure", "dispatch"]), payload: z.unknown() });
