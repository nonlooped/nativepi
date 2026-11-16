import { readWorkspaceFile } from "./workspaceFiles.ts";
import { getRepoHostContext } from "./repoHost.ts";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { reviewJobSchema, reviewJobOptionsSchema, type ReviewJob, type ReviewJobOptions } from "../shared/review.ts";
import { ReviewStore } from "./review.ts";
import { runRepositoryCommand } from "./repoCommand.ts";
import { runCodeReviewer } from "./codeReviewer.ts";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const journalSchema = z.object({ jobs: z.array(reviewJobSchema), options: reviewJobOptionsSchema.optional() }).passthrough();
/** UI metadata only. Pi owns all model/tool transcripts. One job per canonical checkout. */
export class ReviewJobs {
  private active = new Map<string, { job: ReviewJob; abort: AbortController }>();
  constructor(private directory: string, private reviews: ReviewStore, private reviewer = runCodeReviewer) {}
  private path(root: string) { return join(this.directory, `${hash(root)}.json`); }
  private async load(root: string) {
    const raw = await readFile(this.path(root), "utf8").catch(e => { if (e.code === "ENOENT") return ""; throw e; });
    return { raw, document: raw ? journalSchema.parse(JSON.parse(raw)) : { jobs: [] as ReviewJob[], options: undefined } };
  }
  private async save(root: string, job: ReviewJob) {
    await mkdir(this.directory, { recursive: true });
    const { raw, document } = await this.load(root);
    document.jobs = [...document.jobs.filter(j => j.id !== job.id), { ...document.jobs.find(j => j.id === job.id), ...job }].slice(-50);
    document.options = job.options;
    const temp = `${this.path(root)}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(document), { mode: 0o600 });
    if ((await this.load(root)).raw !== raw) throw new Error("Review journal changed externally; results remain in the reviewer conversation.");
    await rename(temp, this.path(root));
  }
  async state(projectDir: string) {
    const root = await realpath(projectDir);
    const { document } = await this.load(root);
    const active = this.active.get(root)?.job;
    const latest = document.jobs.at(-1);
    if (latest && latest.status !== "running") {
      const current = { ...latest, inputs: [], skipped: [] };
      try { await this.collect(root, current); latest.inputChanged = JSON.stringify(current.inputs) !== JSON.stringify(latest.inputs);
        for (const f of latest.verificationFiles) {
          const revision = await readWorkspaceFile(root, f.file).then(r => r.revision).catch(() => "unavailable");
          if (revision !== f.revision) latest.inputChanged = true;
        } }
      catch { latest.inputChanged = true; }
    }
    return { options: document.options, jobs: document.jobs.map(j => active?.id === j.id ? active : j.status === "running" ? { ...j, status: "interrupted" as const, message: "App stopped before this review completed. It will not resume automatically." } : j) };
  }
  async stop(projectDir: string) {
    const root = await realpath(projectDir);
    const active = this.active.get(root);
    active?.abort.abort();
    return { ok: true };
  }
  async start(projectDir: string, supplied: ReviewJobOptions) {
    const root = await realpath(projectDir);
    if (this.active.has(root)) throw new Error("A review is already running in this checkout.");
    const options = reviewJobOptionsSchema.parse(supplied);
    const job: ReviewJob = { id: randomUUID(), options, status: "running", createdAt: new Date().toISOString(), message: "Collecting review inputs…", inputs: [], skipped: [], checks: [], verifications: [], verificationFiles: [] };
    const abort = new AbortController();
    this.active.set(root, { job, abort });
    try {
      await this.collect(root, job);
      if (!job.inputs.length && !options.verifyIds.length) throw new Error("No supported textual changes in this scope.");
      abort.signal.throwIfAborted();
      await this.save(root, job);
    } catch (error) { this.active.delete(root); throw error; }
    // Execution belongs to the host, never a mounted renderer or pending request.
    void this.execute(root, job, abort).finally(() => this.active.delete(root));
    return job;
  }
  private async git(root: string, args: string[]) {
    const result = await runRepositoryCommand("git", args, root);
    if (result.code) throw new Error(result.stderr);
    return result.stdout;
  }
  private async collect(root: string, job: ReviewJob) {
    const o = job.options;
    let base: string | undefined;
    if (o.scope === "branch") {
      const commit = (await this.git(root, ["rev-parse", "--verify", "--end-of-options", `${o.base}^{commit}`])).trim();
      base = (await this.git(root, ["merge-base", "HEAD", commit])).trim();
    }
    const args = o.scope === "staged" ? ["--cached"] : base ? [base, "HEAD"] : ["HEAD"];
    let files = o.scope === "file" ? [o.file ?? ""] : (await this.git(root, ["diff", "--name-only", "-z", ...args, "--"])).split("\0").filter(Boolean);
    if (o.scope === "uncommitted") files = [...new Set([...files, ...(await this.git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean)])];
    let size = 0;
    for (const file of files) {
      if (!file) continue;
      if (job.inputs.length >= 100 || size >= 240000) { job.skipped.push(`${file}: review input limit`); continue; }
      try {
        let patch = await this.git(root, ["--literal-pathspecs", "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--unified=5", ...args, "--", file]);
        if (!patch && !base && o.scope !== "staged") patch = await this.reviews.patch(root, file, "working");
        if (!/^@@ /m.test(patch) || patch.includes("\0")) { job.skipped.push(`${file}: binary, unsupported or no textual changes`); continue; }
        if (patch.length > 80000 || size + patch.length > 240000) { job.skipped.push(`${file}: oversized diff (not truncated)`); continue; }
        job.inputs.push({ file, mode: o.scope === "staged" ? "staged" : "working", patch, fingerprint: hash(patch) }); size += patch.length;
      } catch (error) { job.skipped.push(`${file}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  private async execute(root: string, job: ReviewJob, abort: AbortController) {
    try {
      abort.signal.throwIfAborted();
      const snapshot = await this.reviews.snapshot(root, undefined, "working");
      const issues = job.options.verifyIds.map(id => { const f = snapshot.findings.find(f => f.id === id); if (!f) throw new Error("Selected finding no longer exists."); return { id, file: f.file, body: f.body, originalEvidence: f.context }; });
      for (const file of new Set(issues.map(i => i.file))) {
        const revision = await readWorkspaceFile(root, file).then(r => r.revision).catch(() => "unavailable");
        job.verificationFiles.push({ file, revision });
      }
      job.message = `Pi is investigating ${job.inputs.length} files${issues.length ? ` and verifying ${issues.length} named issues` : ""}.`;
      await this.save(root, job);
      const context = await getRepoHostContext(root).catch(() => null);
      abort.signal.throwIfAborted();
      const result = await this.reviewer(root, job.inputs.map(i => `FILE ${JSON.stringify(i.file)}\n${i.patch}`).join("\n\n"), job.options.model, abort.signal, job.options, job.inputs, JSON.stringify({ namedIssues: issues, existingPullRequestContext: context }), async path => { job.sessionFile = path; });
      job.sessionFile = result.reviewerSession; job.checks = result.checks; job.verifications = result.verifications;
      abort.signal.throwIfAborted();
      for (const input of job.inputs) {
        const notes = result.notes.filter(n => n.file === input.file);
        // Merge onto the latest metadata. Captured immutable inputs survive subsequent edits.
        for (let attempt = 0; ; attempt++) {
          try {
            await this.reviews.update(root, input.file, input.mode, { ...snapshot, fingerprint: input.fingerprint }, { notes, capturedPatch: input.patch, reviewerSession: result.reviewerSession, model: job.options.model });
            break;
          } catch (error) { if (attempt >= 4 || !/update is in progress|changed externally/.test(String(error))) throw error; await new Promise(resolve => setTimeout(resolve, 25)); }
        }
      }
      job.count = result.notes.length; job.status = "completed";
      job.message = result.notes.length ? `Completed with ${result.notes.length} finding${result.notes.length === 1 ? "" : "s"}. Human acceptance is separate.` : "Completed without new findings. Earlier concerns remain unchanged.";
    } catch (error) {
      job.status = abort.signal.aborted ? "interrupted" : "failed";
      job.message = error instanceof Error ? error.message : String(error);
    } finally {
      job.finishedAt = new Date().toISOString();
      await this.save(root, job).catch(error => { job.status = "failed"; job.message = String(error); });
    }
  }
}
