import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select.tsx";
import ModelSelector from "./ModelSelector.tsx";
import SettingsDetails from "./settings/SettingsDetails.tsx";
import { useRequest } from "../lib/useRequest.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { reviewJobOptionsSchema, reviewJobSchema, type ReviewJob, type ReviewJobOptions } from "../../shared/review.ts";

const statusLabels = { running: "Reviewing changes…", completed: "Review complete", failed: "Review couldn’t finish", interrupted: "Review stopped" };
const scopeLabels = { uncommitted: "All changes", staged: "Staged changes", file: "This file", branch: "Compare branches" };

export default function ReviewWorkflow({ projectDir, file, verifyIds = [] }: { projectDir: string; file?: string; verifyIds?: string[] }) {
  const lastStatus = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [configure, setConfigure] = useState(true);
  const [jobs, setJobs] = useState<ReviewJob[]>([]);
  const [saved, setSaved] = useState<ReviewJobOptions>();
  const [options, setOptions] = useState<ReviewJobOptions>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const models = useAppStore(s => s.models);
  const model = useAppStore(s => s.model);
  const revision = useAppStore(s => s.gitRevision);
  const running = jobs.some(j => j.status === "running");
  const catalog = useRequest(() => open ? rpc.request.getChatTitleModels({ projectDir }) : Promise.resolve(null), [projectDir, open]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const state = z.object({ jobs: z.array(reviewJobSchema), options: reviewJobOptionsSchema.optional() }).parse(await rpc.request.reviewJobs({ projectDir }));
        if (!alive) return;
        setJobs(state.jobs); setSaved(state.options);
        const status = state.jobs.map(j => `${j.id}:${j.status}`).join();
        if (lastStatus.current !== null && status !== lastStatus.current) window.dispatchEvent(new Event("nativepi-review-updated"));
        lastStatus.current = status;
      } catch (e) { if (alive) setError(String(e)); }
    };
    void load();
    const interval = open || running ? setInterval(() => void load(), 2500) : undefined;
    return () => { alive = false; if (interval) clearInterval(interval); };
  }, [projectDir, open, running, revision]);
  const latest = jobs.at(-1);
  const value = options ?? reviewJobOptionsSchema.parse({ ...saved, file, scope: file ? "file" : saved?.scope === "file" ? "uncommitted" : saved?.scope ?? "uncommitted", model: saved?.model || (model ? `${model.provider}/${model.id}` : "unavailable"), verifyIds });
  const change = (patch: Partial<ReviewJobOptions>) => setOptions({ ...value, ...patch });
  const [provider = "", ...modelId] = value.model.split("/");
  const summary = latest ? latest.inputChanged ? "Changes made since review" : latest.status === "completed" ? `${latest.count ?? 0} finding${latest.count === 1 ? "" : "s"}` : statusLabels[latest.status] : "Not reviewed";
  function openChanges(path: string) {
    useAppStore.getState().setSourceControlReview({ projectDir, path, staged: latest?.options.scope === "staged" });
    setOpen(false);
  }
  return <div className={file ? "" : "flex items-center gap-2 border-b border-border/40 px-3 py-2"}>
    <Button size="sm" variant="ghost" className={file ? "" : "-ml-1 shrink-0"} onClick={() => { setOptions(undefined); setConfigure(!latest || verifyIds.length > 0); setOpen(true); }}>
      {running ? <CircleNotchIcon className="animate-spin motion-reduce:animate-none" /> : !file ? <MagnifyingGlassIcon /> : null}
      {verifyIds.length ? `Verify ${verifyIds.length} fix${verifyIds.length === 1 ? "" : "es"}` : running ? "Review running…" : file ? "Review file" : "Review changes"}
    </Button>
    {!file && <span role="status" className="ml-auto truncate text-xs text-muted-foreground">{summary}</span>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{configure && !running ? verifyIds.length ? "Verify fixes" : "Review changes" : latest ? statusLabels[latest.status] : "Review changes"}</DialogTitle>
        <DialogDescription>{configure && !running ? verifyIds.length ? "Check whether the selected issues have been fixed." : "Ask Pi to look for bugs in your changes." : latest?.inputChanged ? "The code has changed. These results belong to the earlier version." : latest?.status === "running" ? "You can keep working while Pi reviews your changes." : latest?.status === "completed" ? `${latest.count ?? 0} finding${latest.count === 1 ? "" : "s"} across ${latest.inputs.length} file${latest.inputs.length === 1 ? "" : "s"}.` : "Your changes and any saved findings are still available."}</DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="break-words text-xs leading-5 text-destructive">{error}</p>}
      {configure && !running ? <div className="flex flex-col gap-5">
        <Field><FieldLabel>Changes to review</FieldLabel>
          <Select value={value.scope} onValueChange={scope => { if (scope) change({ scope: scope as ReviewJobOptions["scope"] }); }} items={Object.entries(scopeLabels).filter(([scope]) => scope !== "file" || !!file).map(([value, label]) => ({ value, label }))}>
            <SelectTrigger className="w-full" aria-label="Review scope"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(scopeLabels).filter(([scope]) => scope !== "file" || !!file).map(([scope, label]) => <SelectItem key={scope} value={scope}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <FieldDescription>{value.scope === "uncommitted" ? "Everything changed locally, including new files." : value.scope === "branch" ? "Committed changes compared with another branch." : value.scope === "file" ? file : "Only the changes you’ve staged for a commit."}</FieldDescription>
        </Field>
        {value.scope === "branch" && <Field><FieldLabel htmlFor="review-base">Compare with</FieldLabel><Input id="review-base" aria-label="Base branch" value={value.base} onChange={e => change({ base: e.target.value })} /></Field>}
        <div className="flex min-w-0 items-center justify-between gap-3"><span className="text-sm font-medium">Reviewer</span><ModelSelector selection={{ models: (catalog.data?.models ?? []).map(item => ({ ...item, thinkingLevels: item.thinkingLevels.filter(level => reviewJobOptionsSchema.shape.reasoning.safeParse(level).success) })), loading: catalog.loading, error: catalog.error ?? undefined, retry: catalog.reload,
          configuration: { provider, model: modelId.join("/"), reasoning: value.reasoning, tier: value.tier, tools: [] },
          onChange: next => change({ model: `${next.provider}/${next.model}`, reasoning: reviewJobOptionsSchema.shape.reasoning.parse(next.reasoning), tier: next.tier ?? "default" }),
        }} /></div>
        <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4"><div><label htmlFor="review-checks" className="text-sm font-medium">Run checks</label><p className="mt-1 text-[0.8125rem] leading-5 text-body-muted-foreground">{value.allowChecks ? "Allows shell commands with access to your files and network." : "Pi reads the code without running shell commands."}</p></div><Switch id="review-checks" aria-label="Allow shell checks" checked={value.allowChecks} onCheckedChange={allowChecks => change({ allowChecks })} /></div>
      </div> : latest ? <div className="max-h-[min(55dvh,28rem)] min-h-0 overflow-y-auto overscroll-contain">
        {(latest.status === "failed" || latest.status === "interrupted") && <p role="status" className="mb-4 text-sm leading-6 text-body-muted-foreground">{latest.message}</p>}
        <div className="divide-y divide-border/30">{latest.inputs.map(input => <button key={input.file} className="flex w-full min-w-0 items-center justify-between gap-3 py-2.5 text-left text-sm hover:text-foreground focus-visible:outline-ring" onClick={() => openChanges(input.file)}><span className="truncate" title={input.file}>{input.file}</span><span className="shrink-0 text-xs text-muted-foreground">View changes</span></button>)}</div>
        <SettingsDetails id="review-evidence" title="Review details" summary={`${latest.checks.length ? `${latest.checks.length} recorded checks` : "No recorded checks"}${latest.skipped.length ? ` · ${latest.skipped.length} skipped files` : ""}`}>
          <div className="space-y-3 text-xs leading-5 text-body-muted-foreground">
            <p>Results apply to the reviewed version. Findings remain open until you resolve them.</p>
            {latest.skipped.map(s => <p key={s}>{s}</p>)}
            {latest.checks.map((check, i) => <SettingsDetails key={i} id={`review-check-${i}`} title={check.command} summary={check.exitCode === 0 ? "Passed" : check.exitCode === null ? "Exit status unavailable" : `Failed (exit ${check.exitCode})`}><pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs">{check.output}</pre></SettingsDetails>)}
            {latest.inputs.map(input => <SettingsDetails key={input.file} id={`review-input-${input.file}`} title={input.file}><pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs">{input.patch}</pre><p className="mt-2 break-all">Revision: {input.fingerprint}</p></SettingsDetails>)}
            {latest.verifications.map(v => <p key={v.id}><strong>{{ fixed: "Fix verified", persists: "Issue still present", uncertain: "Needs another look" }[v.verdict]}</strong> — {v.evidence}</p>)}
            {latest.sessionFile && <Button size="sm" variant="outline" onClick={() => { setOpen(false); void useAppStore.getState().selectChat(latest.sessionFile!, projectDir); }}>Open reviewer chat</Button>}
          </div>
        </SettingsDetails>
        {jobs.length > 1 && <SettingsDetails id="review-history" title="Previous reviews"><div className="space-y-2">{jobs.slice(0, -1).reverse().map(job => <div key={job.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{new Date(job.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span><Button size="xs" variant="ghost" disabled={!job.sessionFile} onClick={() => { setOpen(false); void useAppStore.getState().selectChat(job.sessionFile!, projectDir); }}>{statusLabels[job.status]}</Button></div>)}</div></SettingsDetails>}
      </div> : null}
      <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{running ? "Keep working" : "Close"}</Button>{running ? <Button variant="outline" onClick={() => { void rpc.request.reviewStop({ projectDir }).catch(e => setError(String(e))); }}>Stop review</Button> : !configure ? <><Button variant="ghost" onClick={() => setConfigure(true)}>Review again</Button>{latest?.inputs[0] && <Button onClick={() => openChanges(latest.inputs[0]!.file)}>View changes</Button>}</> : <Button disabled={busy || !models.length || value.model === "unavailable"} onClick={() => {
        setBusy(true); setError("");
        void rpc.request.reviewStart({ projectDir, options: { ...value, verifyIds } }).then(job => { setJobs(previous => [...previous, reviewJobSchema.parse(job)]); setConfigure(false); setBusy(false); }, e => { setError(String(e)); setBusy(false); });
      }}>{busy ? "Starting…" : verifyIds.length ? "Verify fixes" : "Start review"}</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
