import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select.tsx";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { reviewJobOptionsSchema, reviewJobSchema, type ReviewJob, type ReviewJobOptions } from "../../shared/review.ts";

export default function ReviewWorkflow({ projectDir, file, verifyIds = [] }: { projectDir: string; file?: string; verifyIds?: string[] }) {
  const lastStatus = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<ReviewJob[]>([]);
  const [saved, setSaved] = useState<ReviewJobOptions>();
  const [options, setOptions] = useState<ReviewJobOptions>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const models = useAppStore(s => s.models);
  const model = useAppStore(s => s.model);
  const running = jobs.some(j => j.status === "running");
  const revision = useAppStore(s => s.gitRevision);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const state = z.object({ jobs: z.array(reviewJobSchema), options: reviewJobOptionsSchema.optional() }).parse(await rpc.request.reviewJobs({ projectDir })); if (alive) { setJobs(state.jobs); setSaved(state.options);
        const status = state.jobs.map(j => `${j.id}:${j.status}`).join();
        if (lastStatus.current !== null && status !== lastStatus.current) window.dispatchEvent(new Event("nativepi-review-updated"));
        lastStatus.current = status; } }
      catch (e) { if (alive) setError(String(e)); }
    };
    void load();
    const interval = open || running ? setInterval(() => void load(), 2500) : undefined;
    return () => { alive = false; if (interval) clearInterval(interval); };
  }, [projectDir, open, running, revision]);
  const latest = jobs.at(-1);
  const value = options ?? reviewJobOptionsSchema.parse({ ...saved, file, scope: file ? "file" : saved?.scope ?? "uncommitted", model: saved?.model || (model ? `${model.provider}/${model.id}` : "unavailable"), verifyIds });
  const change = (patch: Partial<ReviewJobOptions>) => setOptions({ ...value, ...patch });
  return <div className={file ? "" : "space-y-2 border-b p-3"}>
    <Button size="sm" variant={file ? "ghost" : "outline"} className={file ? "" : "w-full"} onClick={() => { setOptions(undefined); setOpen(true); }}>{verifyIds.length ? `Verify ${verifyIds.length} fix${verifyIds.length === 1 ? "" : "es"}` : running ? "Review running…" : file ? "Review file" : "Review changes"}</Button>
    {!file && <p role="status" className="text-xs leading-5 text-muted-foreground">{latest ? latest.message : "Not reviewed. Ask an independent Pi reviewer to investigate your changes."}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{verifyIds.length ? "Verify named findings" : "Review changes"}</DialogTitle><DialogDescription>Independent Pi conversation with repository read and search access. Editing tools and automatic third-party extensions are disabled for this run.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
      {!running && <div className="space-y-4">
        <label className="block space-y-2 text-sm">Scope<ReviewSelect label="Review scope" value={value.scope} values={[['uncommitted','All uncommitted changes'],['staged','Staged changes'],...(file ? [['file','Selected file']] : []),['branch','Branch against base']]} onChange={scope => change({ scope: scope as ReviewJobOptions['scope'] })} /></label>
        {value.scope === "branch" && <Input aria-label="Base branch" value={value.base} onChange={e => change({ base: e.target.value })} />}
        <p className="text-xs text-muted-foreground">{value.scope === "uncommitted" ? "Includes staged, unstaged and untracked files." : value.scope === "branch" ? "Committed changes from the merge base to HEAD. Uncommitted changes excluded." : value.scope === "file" ? `${file} · combined staged and unstaged changes` : "Only changes in the index."}</p>
        <label className="block space-y-2 text-sm">Reviewer model<ReviewSelect label="Reviewer model" value={value.model} values={models.map(m => [`${m.provider}/${m.id}`, m.name || m.id])} onChange={model => change({ model })} /></label>
        <details><summary className="cursor-pointer text-sm">Reasoning, speed and permissions</summary><div className="mt-3 space-y-3">
          <ReviewSelect label="Reviewer reasoning" value={value.reasoning} values={['off','minimal','low','medium','high','xhigh'].map(v => [v,v])} onChange={reasoning => change({ reasoning: reasoning as ReviewJobOptions['reasoning'] })} />
          <ReviewSelect label="Reviewer service tier" value={value.tier} values={[["default","Standard"],["priority","Priority (supported providers only)"]]} onChange={tier => change({ tier: tier as ReviewJobOptions['tier'] })} />
          <label className="flex items-start gap-2 text-xs leading-5"><Checkbox aria-label="Allow shell checks" checked={value.allowChecks} onCheckedChange={checked => change({ allowChecks: !!checked })} />Allow Pi to execute checks through shell. Shell is unsandboxed and can change files or access the network. Without this permission, checks are not run.</label>
        </div></details>
      </div>}
      {latest && <section className="space-y-3 border-t pt-3 text-xs">
        <div className="flex items-center justify-between"><strong className="capitalize">{latest.status}</strong>{latest.sessionFile && <Button size="xs" variant="ghost" onClick={() => void useAppStore.getState().selectChat(latest.sessionFile!, projectDir)}>Reviewer conversation</Button>}</div>
        <p role="status">{latest.inputChanged ? "Review inputs changed since this run. Original results and evidence are retained." : latest.message}</p>
        <p className="text-muted-foreground">{latest.inputs.length} reviewed files · {latest.skipped.length} skipped · {latest.options.model}. {latest.inputChanged ? "Stale evidence: review inputs changed. " : ""}Results refer to captured inputs; inspect current anchors before accepting. Completion does not mean checks passed.</p>
        {!!latest.skipped.length && <details><summary>Skipped inputs</summary><ul className="mt-2 space-y-1">{latest.skipped.map(s => <li key={s}>{s}</li>)}</ul></details>}
        <details><summary>Reviewed inputs and evidence</summary><div className="mt-2 space-y-3">{latest.inputs.map(i => <details key={i.file}><summary>{i.file} · {i.fingerprint.slice(0,12)}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{i.patch}</pre></details>)}</div></details>
        {!latest.checks.length && <p>Checks: not run or no recorded command results.</p>}
        {latest.checks.map((c, i) => <details key={i}><summary>{c.command} · exit {c.exitCode ?? "unknown"}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{c.output}</pre></details>)}
        <p className="text-muted-foreground">Verification fingerprints: {(latest.verificationFiles ?? []).map(f => `${f.file}: ${f.revision.slice(0,12)}`).join(", ") || "none"}.</p>
        <p className="text-muted-foreground">Visual evidence: inspect linked Pi tool results; no browser or native capture is implied by review completion.</p>
        {latest.verifications.map(v => <p key={v.id}><strong>{v.verdict}</strong> · {v.evidence} (finding {v.id.slice(0,8)}; human acceptance pending)</p>)}
        <details><summary>Run history ({jobs.length})</summary>{jobs.slice().reverse().map(j => <p key={j.id} className="mt-2">{j.createdAt} · {j.status} · {j.message}{j.sessionFile && <Button size="xs" variant="ghost" onClick={() => void useAppStore.getState().selectChat(j.sessionFile!, projectDir)}>Open evidence</Button>}</p>)}</details>
      </section>}
      <DialogFooter>{running ? <Button variant="destructive" onClick={() => { void rpc.request.reviewStop({ projectDir }).catch(e => setError(String(e))); }}>Stop review</Button> : <Button disabled={busy || !models.length || value.model === "unavailable"} onClick={() => {
        setBusy(true); setError("");
        void rpc.request.reviewStart({ projectDir, options: { ...value, verifyIds } }).then(job => { setJobs(previous => [...previous, reviewJobSchema.parse(job)]); setBusy(false); }, e => { setError(String(e)); setBusy(false); });
      }}>{busy ? "Starting…" : verifyIds.length ? "Verify fixes" : "Start review"}</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
function ReviewSelect({ label, value, values, onChange }: { label: string; value: string; values: string[][]; onChange: (value: string) => void }) {
  return <Select value={value} onValueChange={v => { if (v) onChange(v); }} items={values.map(([value, label]) => ({ value: value!, label: label! }))}><SelectTrigger className="w-full" aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{values.map(([v,l]) => <SelectItem key={v} value={v!}>{l}</SelectItem>)}</SelectContent></Select>;
}
