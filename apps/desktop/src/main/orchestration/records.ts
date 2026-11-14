import { ORCHESTRATION_ENTRY, orchestrationRecordSchema, type Assignment, type OrchestrationMessage, type Relationship } from "../../shared/orchestration.ts";

/** Copied records are history, never authority for the clone/fork's identity. */
export function projectOrchestration(sessionId: string, entries: readonly unknown[], recovering = false) {
  let relationship: Relationship | undefined;
  let assignment: Assignment | undefined;
  let generation = 0;
  const inbox = new Map<string, OrchestrationMessage>();
  const outbox = new Map<string, OrchestrationMessage>();
  const consumed = new Set<string>();
  const operations = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !("customType" in entry) || entry.customType !== ORCHESTRATION_ENTRY || !("data" in entry)) continue;
    const parsed = orchestrationRecordSchema.safeParse(entry.data);
    if (!parsed.success || parsed.data.sessionId !== sessionId) continue;
    const record = parsed.data;
    operations.add(record.operationId);
    if (record.kind === "relationship" && record.relationship.delegate.id === sessionId) relationship = record.relationship;
    if (record.kind === "assignment" && record.assignment.delegate.id === sessionId) assignment = record.assignment;
    if (record.kind === "stop") generation = Math.max(generation, record.generation);
    if (record.kind === "message") {
      if (record.stage === "inbox") inbox.set(record.message.id, record.message);
      if (record.stage === "outbox") outbox.set(record.message.id, record.message);
      if (record.stage === "acknowledged") outbox.delete(record.message.id);
      if (record.stage === "consumed") consumed.add(record.message.id);
    }
  }
  for (const id of consumed) inbox.delete(id);
  if (recovering && assignment && ["preparing", "running", "waiting"].includes(assignment.state)) assignment = { ...assignment, state: "interrupted", reason: "Runtime interrupted; explicit resumption required." };
  return { relationship, assignment, generation, inbox, outbox, consumed, operations };
}
export function assignmentBusy(assignment: Assignment | undefined): boolean {
  return !!assignment && ["preparing", "running", "waiting"].includes(assignment.state);
}
