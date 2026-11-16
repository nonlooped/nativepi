import { useEffect, useState, type ReactNode } from "react";
import { ChatCircleTextIcon } from "@phosphor-icons/react/ChatCircleText";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import { XIcon } from "@phosphor-icons/react/X";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { SelectionIcon } from "@phosphor-icons/react/Selection";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/PaperPlaneTilt";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { useAppStore } from "../lib/store.ts";
import { reviewContext, reviewSnapshotSchema, revisionPrompt, type ReviewRange, type ReviewSnapshot } from "../../shared/review.ts";
import { ReviewAnchors, ReviewControls } from "./ReviewAnchors.ts";
import { cn } from "@/lib/utils.ts";

export default function ReviewFindings({ projectDir, file, mode, patch, revision, children, onBack, focusRequest }: {
  projectDir: string; file: string; mode: "working" | "staged"; patch: string; revision: number;
  focusRequest?: { findingId?: string };
  children: (select: (range: ReviewRange) => void) => ReactNode; onBack: () => void;
}) {
  const [snapshot, setSnapshot] = useState<{ value: ReviewSnapshot; source: ReviewSnapshot | null; patch: string; revision: number }>();
  const [range, setRange] = useState<ReviewRange>();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState(!!focusRequest?.findingId);
  const [expanded, setExpanded] = useState<string | undefined>(focusRequest?.findingId);
  const [configure, setConfigure] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [filter, setFilter] = useState(focusRequest?.findingId ? "all" : "open");
  useEffect(() => {
    if (!focusRequest?.findingId) return;
    setExpanded(focusRequest.findingId); setFilter("all"); setPanel(true);
  }, [focusRequest]);
  const models = useAppStore(s => s.models);
  const currentModel = useAppStore(s => s.model);
  const activeProject = useAppStore(s => s.activeProjectPath);
  const [model, setModel] = useState("");
  const request = useRequest(async () => reviewSnapshotSchema.parse(await rpc.request.reviewSnapshot({ projectDir, file, mode })), [projectDir, file, mode, revision, patch]);
  const remember = (value: ReviewSnapshot) => setSnapshot({ value, source: request.data, patch, revision });
  const data = snapshot && snapshot.source === request.data && snapshot.patch === patch && snapshot.revision === revision ? snapshot.value : request.data;
  const matches = data?.patch === patch;
  const lastRun = data?.runs.findLast(run => run.file === file && run.mode === mode);
  const modelId = model || (currentModel ? `${currentModel.provider}/${currentModel.id}` : "");
  const modelOptions = models.map(m => ({ value: `${m.provider}/${m.id}`, label: m.name || m.id.split("/").at(-1) || m.id }));
  const readError = request.error && (/"code"\s*:|Unexpected token|not valid JSON/i.test(request.error) ? "Saved findings could not be loaded." : request.error.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, ""));
  const problem = error || readError || (data && !matches ? "The code changed while loading. Refresh the diff before adding feedback." : undefined);
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(undefined); setNotice("");
    try { await work(); } catch (cause) { setError(cause instanceof Error && cause.name === "ZodError" ? "The review could not be read. Try again." : cause instanceof Error ? cause.message : String(cause)); setPanel(true); }
    setBusy(false);
  }
  function select(next: ReviewRange) {
    try { reviewContext(patch, next); setRange(next); setError(undefined); }
    catch (cause) { setError(String(cause)); setPanel(true); }
  }
  const open = data?.findings.filter(f => f.state === "open") ?? [];
  const chosen = data?.findings.filter(f => selected.includes(f.id)) ?? [];
  const batch = selecting ? chosen : open;
  const visible = data?.findings.filter(f => filter === "all" || f.state === "open") ?? [];
  function inspect(id: string) { setExpanded(id); setFilter("all"); setPanel(true); }
  const toolbar = <>
    <Button size="xs" variant="ghost" aria-expanded={panel} onClick={() => setPanel(v => !v)}><ChatCircleTextIcon />Findings{data ? ` ${open.length}` : ""}{problem && <WarningCircleIcon className="text-destructive" />}</Button>
    <Button size="xs" variant="ghost" disabled={busy || !patch.trim()} onClick={() => setConfigure(true)}>{reviewing ? <CircleNotchIcon className="animate-spin motion-reduce:animate-none" /> : <SparkleIcon />}{reviewing ? "Reviewing…" : "Review"}</Button>
    {request.loading && <span role="status" aria-label="Loading findings"><CircleNotchIcon className="size-3 animate-spin text-muted-foreground motion-reduce:animate-none" /></span>}
  </>;
  return <ReviewControls value={{ toolbar, inspect }}><div className="relative flex h-full min-h-0 min-w-0">
    <div className="min-h-0 min-w-0 flex-1"><ReviewAnchors value={data?.findings.filter(f => f.file === file && f.mode === mode && matches && !f.stale && f.state === "open") ?? []}>{children(select)}</ReviewAnchors></div>
    {panel && <aside aria-label="Review findings" className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background min-[900px]:static min-[900px]:w-80 min-[900px]:shrink-0 min-[900px]:border-l">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b px-3">
        <h3 className="min-w-0 flex-1 text-sm font-medium">Findings{!!data?.findings.length && <span className="ml-1 text-xs font-normal text-muted-foreground">{open.length} open</span>}</h3>
        <Button variant="ghost" size="icon-xs" title="Select findings" aria-label="Select findings" disabled={!data?.findings.length} aria-pressed={selecting} onClick={() => { setSelecting(v => !v); setSelected([]); }}><SelectionIcon /></Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Review actions" />}><DotsThreeIcon /></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => { setSnapshot(undefined); setError(undefined); request.reload(); }}><ArrowClockwiseIcon />Refresh</DropdownMenuItem>
          {lastRun && <DropdownMenuItem onClick={() => void useAppStore.getState().selectChat(lastRun.sessionFile, projectDir)}><ChatCircleTextIcon />Reviewer conversation</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => setConfigure(true)}><SparkleIcon />{lastRun ? "Re-review file" : "Review file"}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <Button variant="ghost" size="icon-xs" aria-label="Close findings" onClick={() => setPanel(false)}><XIcon /></Button>
      </header>
      {!!data?.findings.length && <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <Select value={filter} onValueChange={value => { if (value) setFilter(value); }} items={[{ value: "open", label: "Open findings" }, { value: "all", label: "All findings" }]}>
          <SelectTrigger size="sm" aria-label="Finding status" className="border-transparent bg-transparent px-1 dark:bg-transparent"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open findings</SelectItem><SelectItem value="all">All findings</SelectItem></SelectContent>
        </Select>
        {selecting && <span className="text-xs text-muted-foreground">{chosen.length} selected</span>}
      </div>}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {problem && <div role="alert" className="mx-3 mb-3 flex items-start gap-2 rounded-lg bg-destructive/5 p-3 text-xs leading-5 text-destructive"><WarningCircleIcon className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 flex-1 break-words">{problem}<div className="mt-1"><Button size="xs" variant="ghost" onClick={() => { setSnapshot(undefined); setError(undefined); request.reload(); }}>Try again</Button></div></div></div>}
        {notice && <p role="status" className="px-4 pb-3 text-xs leading-5 text-muted-foreground">{notice}</p>}
        {request.loading && !data ? <p role="status" className="px-4 py-8 text-sm text-muted-foreground">Loading findings…</p> : !visible.length && !problem ? <div className="px-5 py-10 text-center"><CheckCircleIcon className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">{data?.findings.length ? "No open findings" : "No findings yet"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Select lines to leave feedback, or ask Pi to review this file.</p><Button size="sm" variant="ghost" className="mt-3" disabled={!patch.trim()} onClick={() => setConfigure(true)}><SparkleIcon />Review file</Button></div> : null}
        {visible.map(f => <article key={f.id} className="border-b border-border/50 last:border-0">
          <div className={cn("flex items-start gap-2 px-3 py-3", expanded === f.id && "bg-muted/30")}>
            {selecting && <Checkbox className="mt-1 shrink-0" aria-label={`Select finding ${f.file} ${f.range.start}`} checked={selected.includes(f.id)} onCheckedChange={checked => setSelected(ids => checked ? [...ids, f.id] : ids.filter(id => id !== f.id))} />}
            <button type="button" className="min-w-0 flex-1 text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded === f.id} onClick={() => setExpanded(id => id === f.id ? undefined : f.id)}>
              <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="truncate" title={f.file}>{f.file.split("/").at(-1)}:{f.range.start}{f.range.end !== f.range.start ? `–${f.range.end}` : ""}</span>{f.stale && <span className="shrink-0 text-warning">Changed</span>}{f.state !== "open" && <span className="shrink-0 capitalize">{f.state}</span>}</span>
              <span className={cn("mt-1.5 block break-words text-sm leading-6", expanded !== f.id && "line-clamp-2")}>{f.body}</span>
            </button>
          </div>
          {expanded === f.id && <div className="space-y-3 px-3 pb-4">
            {f.stale && <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><WarningCircleIcon className="mt-0.5 size-3.5 shrink-0" />Code changed since this feedback. Check the original lines before revising.</p>}
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Original code</summary><p className="mt-2 break-all">{f.file} · {f.mode === "working" ? "Unstaged" : "Staged"} · {f.range.side === "old" ? "Before" : "After"}</p><pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs text-foreground">{f.context}</pre></details>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(async () => remember(reviewSnapshotSchema.parse(await rpc.request.reviewUpdate({ projectDir, file, mode, ...data!, id: f.id, state: f.state === "open" ? "resolved" : "open" }))))}><CheckCircleIcon />{f.state === "open" ? "Resolve" : "Reopen"}</Button>
              {f.file !== file && <Button size="sm" variant="ghost" onClick={() => useAppStore.getState().setSourceControlReview({ projectDir, path: f.file, staged: f.mode === "staged" })}>View diff</Button>}
              <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Finding actions" />}><DotsThreeIcon /></DropdownMenuTrigger><DropdownMenuContent align="end">
                {f.state !== "dismissed" && <DropdownMenuItem disabled={busy} onClick={() => void perform(async () => remember(reviewSnapshotSchema.parse(await rpc.request.reviewUpdate({ projectDir, file, mode, ...data!, id: f.id, state: "dismissed" }))))}>Dismiss</DropdownMenuItem>}
                {f.reviewerSession && <DropdownMenuItem onClick={() => void useAppStore.getState().selectChat(f.reviewerSession!, projectDir)}>Reviewer conversation</DropdownMenuItem>}
              </DropdownMenuContent></DropdownMenu>
            </div>
          </div>}
        </article>)}
      </div>
      {(open.length > 0 || selecting) && <footer className="shrink-0 border-t p-3"><Button className="w-full" size="sm" disabled={busy || !batch.length || activeProject !== projectDir} onClick={() => { useAppStore.getState().insertIntoComposer(revisionPrompt(batch)); onBack(); }}><PaperPlaneTiltIcon />{selecting ? `Send ${chosen.length} selected to Pi…` : "Send open to Pi…"}</Button></footer>}
    </aside>}
    <Dialog open={!!range} onOpenChange={value => { if (!value && !busy) setRange(undefined); }}><DialogContent>
      <DialogHeader><DialogTitle>Add feedback</DialogTitle><DialogDescription className="break-all">{file} · {range?.side === "old" ? "Before" : "After"} · {range?.start === range?.end ? `Line ${range?.start}` : `Lines ${range?.start}–${range?.end}`}</DialogDescription></DialogHeader>
      <form id="line-feedback" onSubmit={e => { e.preventDefault(); void perform(async () => { if (!data || !range) return; remember(reviewSnapshotSchema.parse(await rpc.request.reviewUpdate({ projectDir, file, mode, ...data, note: { range, body } }))); setRange(undefined); setBody(""); }); }}><FieldGroup><Field><FieldLabel className="sr-only" htmlFor="review-note">Feedback</FieldLabel><Textarea id="review-note" aria-label="Line feedback" autoFocus rows={3} className="resize-none" value={body} onChange={e => setBody(e.target.value)} placeholder="What should change?" maxLength={10000} /></Field></FieldGroup></form>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setRange(undefined)}>Cancel</Button><Button type="submit" form="line-feedback" disabled={busy || !data || !matches || !body.trim()}>Save finding</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={configure} onOpenChange={setConfigure}><DialogContent>
      <DialogHeader><DialogTitle>{lastRun ? "Re-review file" : "Review file"}</DialogTitle><DialogDescription>A fresh Pi reviewer will inspect this diff.</DialogDescription></DialogHeader>
      <p className="truncate text-sm text-muted-foreground" title={file}>{file}</p>
      <FieldGroup><Field><FieldLabel>Reviewer model</FieldLabel><Select value={modelId} onValueChange={value => { if (value) setModel(value); }} items={modelOptions}><SelectTrigger aria-label="Reviewer model" className="w-full"><SelectValue placeholder="Choose a model" /></SelectTrigger><SelectContent>{modelOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></Field></FieldGroup>
      {!models.length && <p className="text-xs text-muted-foreground">Connect a provider to choose a reviewer.</p>}
      <DialogFooter><Button variant="ghost" onClick={() => setConfigure(false)}>Cancel</Button><Button disabled={busy || !data || !matches || !modelId || !patch.trim()} onClick={() => { setConfigure(false); setReviewing(true); void perform(async () => { const result = await rpc.request.reviewRun({ projectDir, file, mode, ...data!, model: modelId }); remember(reviewSnapshotSchema.parse(result.snapshot)); setNotice(result.count ? `${result.count} new finding${result.count === 1 ? "" : "s"}.` : "No new findings. Earlier feedback is unchanged."); setPanel(true); }).then(() => setReviewing(false)); }}><SparkleIcon />{lastRun ? "Re-review" : "Start review"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div></ReviewControls>;
}
