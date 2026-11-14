import { ORCHESTRATION_ENTRY, orchestrationRecordSchema, type Assignment, type OrchestrationMessage, type Relationship, type OrchestrationRecord } from "../../shared/orchestration.ts";

/** Copied records are history, never authority for the clone/fork's identity. */
export function projectOrchestration(sessionId: string, entries: readonly unknown[], recovering = false) {
  let unavailableRole = false;
  let relationship: Relationship | undefined;
  let assignment: Assignment | undefined;
  const assignments = new Map<string, Assignment>();
  let generation = 0;
  const inbox = new Map<string, OrchestrationMessage>();
  const outbox = new Map<string, OrchestrationMessage>();
  const consumed = new Set<string>();
  const readMessages = new Set<string>();
  const operations = new Set<string>();
  const results = new Map<string, Extract<OrchestrationRecord, { kind: "operation" }>>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !("customType" in entry) || entry.customType !== ORCHESTRATION_ENTRY || !("data" in entry)) continue;
    const parsed = orchestrationRecordSchema.safeParse(entry.data);
    if (!parsed.success) {
      const raw = entry.data as { kind?: unknown; sessionId?: unknown; relationship?: { delegate?: { id?: unknown } } } | undefined;
      if (raw?.kind === "relationship" && raw.sessionId === sessionId && raw.relationship?.delegate?.id === sessionId) unavailableRole = true;
      continue;
    }
    if (parsed.data.sessionId !== sessionId) continue;
    const record = parsed.data;
    operations.add(record.operationId);
    if (record.kind === "operation") results.set(record.operationId, record);
    if (record.kind === "relationship" && record.relationship.delegate.id === sessionId) relationship = record.relationship;
    if (record.kind === "assignment" && record.assignment.delegate.id === sessionId) { assignment = record.assignment; assignments.set(assignment.id, assignment); }
    if (record.kind === "stop") generation = Math.max(generation, record.generation);
    if (record.kind === "message") {
      if (record.stage === "inbox") inbox.set(record.message.id, record.message);
      if (record.stage === "outbox") outbox.set(record.message.id, record.message);
      if (record.stage === "acknowledged") outbox.delete(record.message.id);
      if (record.stage === "read") readMessages.add(record.message.id);
      if (record.stage === "consumed") consumed.add(record.message.id);
    }
  }
  for (const id of consumed) inbox.delete(id);
  if (recovering && assignment && ["preparing", "running", "waiting"].includes(assignment.state)) assignment = { ...assignment, state: "interrupted", reason: "Runtime interrupted; explicit resumption required." };
  if (assignment) assignments.set(assignment.id, assignment);
  return { unavailableRole, relationship, assignment, assignments, generation, inbox, outbox, consumed, readMessages, operations, results };
}
export function assignmentBusy(assignment: Assignment | undefined): boolean {
  return !!assignment && ["preparing", "running", "waiting"].includes(assignment.state);
}
