import { expect, test } from "bun:test";
import { ORCHESTRATION_ENTRY, type Assignment, type Relationship, type OrchestrationMessage } from "../../shared/orchestration.ts";
import { projectOrchestration } from "./records.ts";
const lead = { id: "lead", cwd: "/repo", file: "/lead.jsonl" };
const child = { id: "child", cwd: "/repo", file: "/child.jsonl" };
const relationship: Relationship = { operationId: "spawn", lead, delegate: child, label: "Review", configuration: { provider: "test", model: "model", reasoning: "off", tools: ["read"] }, workspace: { mode: "shared", path: "/repo" } };
const assignment: Assignment = { id: "assignment", delegate: child, taskMessageId: "task", attempt: 1, state: "running", questions: [] };
const entry = (data: unknown) => ({ type: "custom", customType: ORCHESTRATION_ENTRY, data });
const base = { version: 1, sessionId: child.id, operationId: "op" };
test("records recover interrupted work without adopting copied fork ownership", () => {
  const entries = [entry({ ...base, kind: "relationship", relationship }), entry({ ...base, kind: "assignment", assignment })];
  expect(projectOrchestration(child.id, entries, true).assignment?.state).toBe("interrupted");
  expect(projectOrchestration("clone", entries, true).relationship).toBeUndefined();
  expect(projectOrchestration(child.id, entries).assignment?.state).toBe("running");
});
test("unknown versions and malformed records remain inert", () => {
  const entries = [entry({ ...base, version: 2, kind: "relationship", relationship }), entry({ ...base, kind: "assignment", assignment: {} })];
  expect(projectOrchestration(child.id, entries).relationship).toBeUndefined();
  expect(projectOrchestration(child.id, entries).assignment).toBeUndefined();
});
test("consumption is idempotent even if inbox receipt is repeated later", () => {
  const message: OrchestrationMessage = { id: "m", operationId: "op", source: lead, destination: child, kind: "peer", timestamp: new Date().toISOString(), content: "hello" };
  const records = ["inbox", "consumed", "inbox"].map(stage => entry({ ...base, kind: "message", stage, message }));
  expect(projectOrchestration(child.id, records).inbox.size).toBe(0);
});
