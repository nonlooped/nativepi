import { ReviewAnchors } from "./ReviewAnchors.ts";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { useAppStore } from "../lib/store.ts";
import { reviewContext, reviewSnapshotSchema, revisionPrompt, type ReviewRange, type ReviewSnapshot } from "../../shared/review.ts";

export default function ReviewFindings({ projectDir, file, mode, patch, revision, children, onBack }: {
  projectDir: string; file: string; mode: "working" | "staged"; patch: string; revision: number;
  children: (select: (range: ReviewRange) => void) => ReactNode; onBack: () => void;
}) {
  const [snapshot, setSnapshot] = useState<{ value: ReviewSnapshot; source: ReviewSnapshot | null; patch: string; revision: number }>();
  const remember = (value: ReviewSnapshot) => setSnapshot({ value, source: request.data, patch, revision });
  const [range, setRange] = useState<ReviewRange>();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const models = useAppStore(s => s.models);
  const currentModel = useAppStore(s => s.model);
  const [model, setModel] = useState("");
  const request = useRequest(async () => reviewSnapshotSchema.parse(await rpc.request.reviewSnapshot({ projectDir, file, mode })), [projectDir, file, mode, revision, patch]);
  // A successful mutation owns its revision until the next host reload completes.
  const data = snapshot && snapshot.source === request.data && snapshot.patch === patch && snapshot.revision === revision ? snapshot.value : request.data;
  const matches = data?.patch === patch;
  const lastRun = data?.runs.findLast(run => run.file === file && run.mode === mode);
  const modelId = model || (currentModel ? `${currentModel.provider}/${currentModel.id}` : "");
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(undefined); setNotice("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  function select(next: ReviewRange) {
    try { reviewContext(patch, next); setRange(next); setError(undefined); }
    catch (cause) { setError(String(cause)); }
  }
  const open = data?.findings.filter(f => f.state === "open") ?? [];
  const chosen = data?.findings.filter(f => selected.includes(f.id)) ?? [];
  const batch = chosen.length ? chosen : open;
  return <div className="flex h-full min-h-0 flex-col">
    <div className="min-h-0 flex-1"><ReviewAnchors value={data?.findings.filter(f => f.file === file && f.mode === mode && matches && !f.stale && f.state === "open") ?? []}>{children(select)}</ReviewAnchors></div>
    <section aria-label="Review findings" className="max-h-[48%] shrink-0 overflow-auto border-t bg-background text-xs">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <h3 className="mr-auto font-medium">Review findings <span className="text-muted-foreground">{open.length} open</span></h3>
        <select aria-label="Reviewer model" className="max-w-52 rounded-md border bg-background px-2 py-1" value={modelId} onChange={e => setModel(e.target.value)} disabled={busy}>
          <option value="">Choose model</option>
          {models.map(m => <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>{m.name || m.id} · {m.provider}</option>)}
        </select>
        <Button size="xs" variant="outline" disabled={busy || !data || !matches || !modelId || !patch.trim()} onClick={() => void perform(async () => {
          const result = await rpc.request.reviewRun({ projectDir, file, mode, ...data!, model: modelId });
          remember(reviewSnapshotSchema.parse(result.snapshot));
          setNotice(`Review complete: ${result.count} finding${result.count === 1 ? "" : "s"} in this file. Previous findings retain their state.`);
        })}>{busy ? "Working…" : lastRun ? "Re-review file" : "Review file"}</Button>
        <Button size="xs" disabled={busy || !batch.length || useAppStore.getState().activeProjectPath !== projectDir} onClick={() => {
          useAppStore.getState().insertIntoComposer(revisionPrompt(batch)); onBack();
        }}>Send {chosen.length ? "selected" : "open"} to Pi…</Button>
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => { setSnapshot(undefined); request.reload(); }}>Reload findings</Button>
      </header>
      {(error || request.error) && <p role="alert" className="px-3 py-2 text-destructive">{error || request.error}</p>}
      {data && !matches && <p role="alert" className="px-3 py-2 text-destructive">The diff changed while loading. Reload the diff and findings before adding feedback.</p>}
      {lastRun && <p className="px-3 pt-2 text-muted-foreground">Last review: {lastRun.model}{lastRun.fingerprint !== data?.fingerprint ? " · code changed since review" : ""} <Button size="xs" variant="ghost" onClick={() => void useAppStore.getState().selectChat(lastRun.sessionFile, projectDir)}>Open reviewer conversation</Button></p>}
      {notice && <p role="status" className="px-3 py-2 text-muted-foreground">{notice}</p>}
      <div className="px-3 py-2">
        <p className="mb-2 text-muted-foreground">Select or drag line numbers in the diff to add feedback. Reviews inspect this file in a fresh Pi session. Sending prepares one message for your confirmation.</p>
        {range && <form className="space-y-2" onSubmit={e => { e.preventDefault(); void perform(async () => {
          if (!data) return;
          remember(reviewSnapshotSchema.parse(await rpc.request.reviewUpdate({ projectDir, file, mode, ...data, note: { range, body } })));
          setRange(undefined); setBody("");
        }); }}>
          <p className="font-medium">{file} · {range.side} lines {range.start}–{range.end}</p>
          <Textarea aria-label="Line feedback" value={body} onChange={e => setBody(e.target.value)} placeholder="Describe the concern and expected behavior" maxLength={10000} />
          <div className="flex gap-2"><Button size="xs" disabled={busy || !data || !matches || !body.trim()} type="submit">Save finding</Button><Button size="xs" variant="ghost" type="button" onClick={() => setRange(undefined)}>Cancel</Button></div>
        </form>}
        {!data?.findings.length && !request.error && <p className="py-2 text-muted-foreground">No saved findings on this branch.</p>}
        {!!data?.findings.some(f => f.state !== "open") && <Button size="xs" variant="ghost" onClick={() => setShowClosed(v => !v)}>{showClosed ? "Hide" : "Show"} resolved and dismissed</Button>}
      </div>
      {data?.findings.filter(f => showClosed || f.state === "open").map(f => <article key={f.id} className="space-y-2 border-t px-3 py-3">
        <div className="flex items-start gap-2">
          <input type="checkbox" aria-label={`Select finding ${f.file} ${f.range.start}`} checked={selected.includes(f.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, f.id] : ids.filter(id => id !== f.id))} />
          <div className="min-w-0 flex-1"><p className="break-all font-medium">{f.file} · {f.range.side} {f.range.start}–{f.range.end} · {f.mode}</p><p className={f.stale ? "text-destructive" : "text-muted-foreground"}>{f.state} · {f.stale ? "Stale anchor — code or revision changed; original code retained" : "Anchor matches reviewed diff"}</p></div>
          {f.file !== file && <Button size="xs" variant="ghost" onClick={() => useAppStore.getState().setSourceControlReview({ projectDir, path: f.file, staged: f.mode === "staged" })}>View diff</Button>}
        </div>
        <p className="whitespace-pre-wrap leading-5">{f.body}</p>
        <details><summary className="cursor-pointer text-muted-foreground">Original code{f.model ? ` · ${f.model}` : ""}</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono">{f.context}</pre>
          {f.reviewerSession && <Button size="xs" variant="ghost" onClick={() => void useAppStore.getState().selectChat(f.reviewerSession!, projectDir)}>Open reviewer conversation</Button>}
        </details>
        <div className="flex gap-1">{(["open", "resolved", "dismissed"] as const).filter(state => state !== f.state).map(state => <Button key={state} size="xs" variant="ghost" disabled={busy} onClick={() => void perform(async () => {
          remember(reviewSnapshotSchema.parse(await rpc.request.reviewUpdate({ projectDir, file, mode, ...data, id: f.id, state })));
        })}>{state === "open" ? "Reopen" : state === "resolved" ? "Resolve" : "Dismiss"}</Button>)}</div>
      </article>)}
    </section>
  </div>;
}
