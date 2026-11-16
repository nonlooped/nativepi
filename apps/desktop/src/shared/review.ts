import { z } from "zod";
export const reviewRangeSchema = z.object({ side: z.enum(["old", "new"]), start: z.number().int().positive(), end: z.number().int().positive() }).refine(v => v.end >= v.start && v.end - v.start < 200, "Choose up to 200 lines on one side.");
export const reviewNoteSchema = z.object({ range: reviewRangeSchema, body: z.string().trim().min(1).max(10000) });
export const findingSchema = reviewNoteSchema.extend({ id: z.string(), file: z.string(), mode: z.enum(["working", "staged"]), state: z.enum(["open", "resolved", "dismissed"]), fingerprint: z.string(), context: z.string(), diffContext: z.string().optional(), createdAt: z.string(), reviewerSession: z.string().optional(), model: z.string().optional() }).passthrough();
export type ReviewRange = z.infer<typeof reviewRangeSchema>;
export type Finding = z.infer<typeof findingSchema>;
export const reviewRunSchema = z.object({ file: z.string(), mode: z.enum(["working", "staged"]), fingerprint: z.string(), sessionFile: z.string(), model: z.string(), createdAt: z.string() }).passthrough();
export const reviewJobOptionsSchema = z.object({
  scope: z.enum(["uncommitted", "staged", "file", "branch"]).default("uncommitted"),
  file: z.string().optional(), base: z.string().max(200).default("main"), model: z.string().min(1),
  reasoning: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).default("high"),
  tier: z.enum(["default", "priority"]).default("default"),
  allowChecks: z.boolean().default(false), verifyIds: z.array(z.string()).max(100).default([]),
});
export type ReviewJobOptions = z.infer<typeof reviewJobOptionsSchema>;
export const reviewInputSchema = z.object({ file: z.string(), mode: z.enum(["working", "staged"]), patch: z.string(), fingerprint: z.string() });
export const reviewJobSchema = z.object({
  id: z.string(), options: reviewJobOptionsSchema, status: z.enum(["running", "completed", "failed", "interrupted"]),
  inputChanged: z.boolean().optional(), createdAt: z.string(), finishedAt: z.string().optional(), message: z.string(),
  inputs: z.array(reviewInputSchema), skipped: z.array(z.string()), sessionFile: z.string().optional(), count: z.number().optional(),
  verificationFiles: z.array(z.object({ file: z.string(), revision: z.string() })).default([]),
  checks: z.array(z.object({ command: z.string(), exitCode: z.number().int().nullable(), output: z.string() })).default([]),
  verifications: z.array(z.object({ id: z.string(), verdict: z.enum(["fixed", "persists", "uncertain"]), evidence: z.string() })).default([]),
}).passthrough();
export type ReviewJob = z.infer<typeof reviewJobSchema>;
export const reviewSnapshotSchema = z.object({ scope: z.string(), revision: z.string(), fingerprint: z.string(), patch: z.string(), runs: z.array(reviewRunSchema).default([]), findings: z.array(findingSchema.extend({ stale: z.boolean() })) });
export type ReviewSnapshot = z.infer<typeof reviewSnapshotSchema>;
/** Lines present in the diff, never inferred from a range's numeric endpoints. */
export function reviewLines(patch: string, side: ReviewRange["side"]) {
  const lines = new Map<number, string>();
  let old = 0, next = 0, active = false;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { old = Number(hunk[1]); next = Number(hunk[2]); active = true; continue; }
    if (!active || !/^[ +\-]/.test(line)) continue;
    if (line[0] !== "+") { if (side === "old") lines.set(old, line.slice(1)); old++; }
    if (line[0] !== "-") { if (side === "new") lines.set(next, line.slice(1)); next++; }
  }
  return lines;
}
export function reviewContext(patch: string, range: ReviewRange) {
  const lines = reviewLines(patch, range.side);
  const selected: string[] = [];
  for (let n = range.start; n <= range.end; n++) {
    if (!lines.has(n)) throw new Error("Select lines present on one side of this diff.");
    selected.push(`${n}: ${lines.get(n)}`);
  }
  return selected.join("\n");
}
export function revisionPrompt(findings: ReviewSnapshot["findings"]) {
  return ["Revise the code for these review findings. Verify each concern against the current files; stale anchors refer to the original code below. Report evidence and tests. Do not claim findings resolved on the user's behalf.", ...findings.map(f => `\n${f.file} (${f.mode}, ${f.range.side} side, lines ${f.range.start}-${f.range.end}; ${f.stale ? "STALE anchor — inspect current code" : "current anchor"})\n${f.body}\nOriginal code:\n${f.context}${f.diffContext ? `\nDiff context:\n${f.diffContext}` : ""}`)].join("\n");
}

export function reviewDiffContext(patch: string, range: ReviewRange) {
  const chunks = patch.split(/(?=^@@ )/m).filter(chunk => chunk.startsWith("@@ "));
  return chunks.filter(chunk => {
    const lines = reviewLines(chunk, range.side);
    return lines.has(range.start) || lines.has(range.end);
  }).map(chunk => chunk.length > 16000 ? chunk.slice(0, 16000) + "\n[Diff context truncated; selected code is preserved above]" : chunk).join("\n");
}

/** A complete single-file patch for the retained hunk excerpt. */
export function reviewEvidencePatch(finding: Pick<Finding, "diffContext" | "context" | "range">) {
  const { range } = finding;
  const count = range.end - range.start + 1;
  const selected = finding.context.split("\n").map(line => line.replace(/^\d+: /, ""));
  const fallback = range.side === "new"
    ? `@@ -0,0 +${range.start},${count} @@\n${selected.map(line => "+" + line).join("\n")}\n`
    : `@@ -${range.start},${count} +0,0 @@\n${selected.map(line => "-" + line).join("\n")}\n`;
  return "diff --git a/review b/review\n--- a/review\n+++ b/review\n" +
    (finding.diffContext && !finding.diffContext.includes("[Diff context truncated") ? finding.diffContext : fallback);
}
