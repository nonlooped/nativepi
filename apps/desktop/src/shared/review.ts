import { z } from "zod";
export const reviewRangeSchema = z.object({ side: z.enum(["old", "new"]), start: z.number().int().positive(), end: z.number().int().positive() }).refine(v => v.end >= v.start && v.end - v.start < 200, "Choose up to 200 lines on one side.");
export const reviewNoteSchema = z.object({ range: reviewRangeSchema, body: z.string().trim().min(1).max(10000) });
export const findingSchema = reviewNoteSchema.extend({ id: z.string(), file: z.string(), mode: z.enum(["working", "staged"]), state: z.enum(["open", "resolved", "dismissed"]), fingerprint: z.string(), context: z.string(), diffContext: z.string().optional(), createdAt: z.string(), reviewerSession: z.string().optional(), model: z.string().optional() }).passthrough();
export type ReviewRange = z.infer<typeof reviewRangeSchema>;
export type Finding = z.infer<typeof findingSchema>;
export const reviewRunSchema = z.object({ file: z.string(), mode: z.enum(["working", "staged"]), fingerprint: z.string(), sessionFile: z.string(), model: z.string(), createdAt: z.string() }).passthrough();
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
