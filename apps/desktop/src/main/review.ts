import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { findingSchema, reviewRunSchema, reviewContext, reviewDiffContext, type Finding, type ReviewSnapshot } from "../shared/review.ts";
import { readProjectDiffPreview } from "./diffPreview.ts";
import { runRepositoryCommand } from "./repoCommand.ts";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const documentSchema = z.object({ version: z.literal(1), runs: z.array(reviewRunSchema).default([]), findings: z.array(findingSchema).max(2000) }).passthrough();
const updating = new Set<string>();
export class ReviewStore {
  constructor(private directory: string) {}
  private async scope(projectDir: string) {
    const root = await realpath(projectDir);
    const git = async (args: string[]) => { const r = await runRepositoryCommand("git", args, root); if (r.code) throw new Error(r.stderr); return r.stdout.trim(); };
    const branch = await git(["symbolic-ref", "--short", "HEAD"]).catch(() => "HEAD");
    const head = await git(["rev-parse", "HEAD"]).catch(() => "unborn");
    const gitDir = await git(["rev-parse", "--absolute-git-dir"]);
    return { root, head, scope: digest(JSON.stringify([root, gitDir, branch === "HEAD" ? head : branch])) };
  }
  private async load(scope: string) {
    const raw = await readFile(join(this.directory, `${scope}.json`), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
    return { revision: digest(raw), document: raw ? documentSchema.parse(JSON.parse(raw)) : { version: 1 as const, runs: [], findings: [] as Finding[] } };
  }
  async snapshot(projectDir: string, file: string | undefined, mode: "working" | "staged"): Promise<ReviewSnapshot> {
    const s = await this.scope(projectDir);
    const stored = await this.load(s.scope);
    const fingerprints = new Map<string, Promise<string>>();
    const fingerprint = (file: string, mode: "working" | "staged") => {
      const key = JSON.stringify([file, mode]);
      let pending = fingerprints.get(key);
      if (!pending) { pending = this.patch(s.root, file, mode).then(patch => digest(s.head + patch)).catch(() => "unavailable"); fingerprints.set(key, pending); }
      return pending;
    };
    const currentPatch = file ? await this.patch(s.root, file, mode) : "";
    if (file) fingerprints.set(JSON.stringify([file, mode]), Promise.resolve(digest(s.head + currentPatch)));
    const findings: ReviewSnapshot["findings"] = [];
    // Bound Git subprocess concurrency even for a large persisted review.
    for (const f of stored.document.findings) findings.push({ ...f, stale: f.fingerprint !== await fingerprint(f.file, f.mode) });
    return { runs: stored.document.runs, patch: currentPatch, scope: s.scope, revision: stored.revision, fingerprint: file ? await fingerprint(file, mode) : "", findings };
  }
  async patch(projectDir: string, file: string, mode: "working" | "staged") {
    const preview = await readProjectDiffPreview(projectDir, file, mode);
    if (preview.kind !== "diff") throw new Error("This diff is too large to review.");
    return preview.patch;
  }
  async update(projectDir: string, file: string, mode: "working" | "staged", expected: Pick<ReviewSnapshot, "scope" | "revision" | "fingerprint">, change: { notes?: { range: Finding["range"]; body: string }[]; id?: string; state?: Finding["state"]; reviewerSession?: string; model?: string }) {
    await mkdir(this.directory, { recursive: true });
    const lock = join(this.directory, expected.scope);
    if (updating.has(lock)) throw new Error("Another review update is in progress. Reload and retry.");
    updating.add(lock);
    try {
      const current = await this.snapshot(projectDir, file, mode);
      if (current.scope !== expected.scope || current.revision !== expected.revision || (change.notes && current.fingerprint !== expected.fingerprint)) throw new Error("The review or code changed. Reload before saving feedback.");
      const stored = await this.load(current.scope);
      if (stored.revision !== expected.revision) throw new Error("The review changed externally. Reload before saving.");
      if (change.notes) {
        const patch = await this.patch(projectDir, file, mode);
        const scope = await this.scope(projectDir);
        if (digest(scope.head + patch) !== expected.fingerprint || scope.scope !== expected.scope) throw new Error("The code changed. Reload before saving feedback.");
        stored.document.findings.push(...change.notes.map(note => ({ ...note, context: reviewContext(patch, note.range), diffContext: reviewDiffContext(patch, note.range), id: randomUUID(), file, mode, fingerprint: expected.fingerprint, state: "open" as const, createdAt: new Date().toISOString(), reviewerSession: change.reviewerSession, model: change.model })));
      } else {
        const finding = stored.document.findings.find(f => f.id === change.id);
        if (!finding || !change.state) throw new Error("Finding not found.");
        finding.state = change.state;
      }
      if (change.reviewerSession && change.model) {
        stored.document.runs.push({ file, mode, fingerprint: expected.fingerprint, sessionFile: change.reviewerSession, model: change.model, createdAt: new Date().toISOString() });
        stored.document.runs = stored.document.runs.slice(-100);
      }
      documentSchema.parse(stored.document);
      const temporary = join(this.directory, `${current.scope}.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(stored.document), { mode: 0o600 });
      if ((await this.load(current.scope)).revision !== stored.revision || (await this.scope(projectDir)).scope !== expected.scope) {
        await rm(temporary, { force: true });
        throw new Error("The review changed externally. Reload before saving.");
      }
      await rename(temporary, join(this.directory, `${current.scope}.json`));
      return await this.snapshot(projectDir, file, mode);
    } finally { updating.delete(lock); }
  }
}
