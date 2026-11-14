import { useRef, useState } from "react";
import type { GitChangedFile } from "../../shared/pi-types.ts";
import type { UiSlice } from "../lib/store/types.ts";
import { useAppStore } from "../lib/store.ts";
import { useRequest } from "../lib/useRequest.ts";
import { rpc } from "../lib/rpc.ts";
import { Button } from "@/components/ui/button.tsx";
import DiffPreview from "./DiffPreview.tsx";
import DiffView from "./DiffView.tsx";
import ConfirmDialog from "./ConfirmDialog.tsx";

export default function SourceControlReview({ review }: { review: NonNullable<UiSlice["sourceControlReview"]> }) {
  const { projectDir, path, staged, hash } = review;
  const git = useAppStore(s => s.git);
  const revision = useAppStore(s => s.gitRevision);
  const setReview = useAppStore(s => s.setSourceControlReview);
  const refresh = useAppStore(s => s.refreshGit);
  const [busy, setBusy] = useState(false);
  const sharedBusy = useAppStore(s => s.sourceControlBusy);
  const operation = useRef(false);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const file = git?.files.find(file => file.path === path);
  async function mutate(work: () => Promise<{ ok: boolean; error?: string }>) {
    if (operation.current || useAppStore.getState().sourceControlBusy) return;
    useAppStore.getState().setSourceControlBusy(true);
    operation.current = true;
    setBusy(true); setError(undefined);
    try {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Git could not update this file.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    operation.current = false;
    useAppStore.getState().setSourceControlBusy(false);
    setBusy(false);
  }
  if (hash) return <HistoricalDiff projectDir={projectDir} hash={hash} path={path} onClose={() => setReview(null)} />;
  const available = file && (staged ? file.staged : file.unstaged);
  return <div className="flex min-h-0 flex-1 flex-col bg-background">
    {error && <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p>}
    <DiffPreview backLabel="Back to chat" projectDir={projectDir} path={path} mode={staged ? "staged" : "working"} revision={revision} onBack={() => setReview(null)}
      actions={<div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
        <span className="mr-auto text-xs text-muted-foreground">{available ? staged ? "Staged changes" : "Unstaged changes" : "This file has no changes on this side."}</span>
        {file && (staged ? file.unstaged : file.staged) && <Button size="sm" variant="ghost" onClick={() => setReview({ ...review, staged: !staged })}>{staged ? "View unstaged" : "View staged"}</Button>}
        {available && !staged && file.state !== "untracked" && <Button size="sm" variant="ghost" disabled={busy || sharedBusy} onClick={() => setConfirming(true)}>Revert file</Button>}
        {available && <Button size="sm" variant="outline" disabled={busy || sharedBusy} onClick={() => void mutate(() => staged ? rpc.request.gitUnstageFile({ projectDir, file: path, originalPath: file.originalPath }) : rpc.request.gitStageFile({ projectDir, file: path }))}>{staged ? "Unstage file" : "Stage file"}</Button>}
      </div>}
      renderPatch={available && !staged && file.state !== "untracked" ? patch => <HunkReview projectDir={projectDir} file={file} revision={revision} disabled={busy || sharedBusy} mutate={mutate} patch={patch} /> : undefined} />
    <ConfirmDialog open={confirming} title="Revert file changes?" description="Discard unstaged changes in this file? Staged changes will remain. This cannot be undone." detail={path} confirmLabel="Revert changes" destructive onConfirm={() => { setConfirming(false); void mutate(() => rpc.request.gitRevertFile({ projectDir, file: path })); }} onCancel={() => setConfirming(false)} />
  </div>;
}
function HistoricalDiff({ projectDir, hash, path, onClose }: { projectDir: string; hash: string; path: string; onClose: () => void }) {
  const { data, error, reload } = useRequest(() => rpc.request.gitCommitDiff({ projectDir, hash, file: path }), [projectDir, hash, path]);
  return <section className="flex min-h-0 flex-1 flex-col bg-background" aria-label="Commit diff">
    <header className="flex shrink-0 items-center gap-2 border-b p-2"><Button variant="ghost" size="sm" onClick={onClose}>Back to chat</Button><span className="min-w-0 flex-1 truncate text-sm" title={path}>{path}</span><span className="font-mono text-xs text-muted-foreground">{hash.slice(0, 8)}</span></header>
    <div className="min-h-0 flex-1">{error ? <div className="p-4 text-xs"><p role="alert" className="text-destructive">{error}</p><Button size="sm" variant="ghost" onClick={reload}>Try again</Button></div> : data ? <DiffView patch={data.diff.patch} /> : <p className="p-4 text-xs text-muted-foreground">Loading diff…</p>}</div>
  </section>;
}
function HunkReview({ projectDir, file, revision, disabled, mutate, patch }: {
  projectDir: string; file: GitChangedFile; revision: number; disabled: boolean; patch: string;
  mutate: (work: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const { data, error } = useRequest(() => rpc.request.gitHunks({ projectDir, file: file.path, untracked: false }), [projectDir, file.path, revision]);
  if (error) return <div className="flex h-full min-h-0 flex-col"><p className="px-3 py-2 text-xs text-muted-foreground">Partial staging is unavailable: {error}</p><div className="min-h-0 flex-1"><DiffView patch={patch} /></div></div>;
  if (!data || data.hunks.length < 2) return <DiffView patch={patch} />;
  return <div className="h-full overflow-y-auto">
    {data.hunks.map((hunk, index) => <section key={hunk.patch} className="border-b">
      <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2"><span className="text-xs text-muted-foreground">Change {index + 1}</span>
        <Button size="xs" variant="outline" disabled={disabled} onClick={() => void mutate(() => rpc.request.gitStageHunk({ projectDir, file: file.path, untracked: false, patch: hunk.patch }))}>Stage change</Button>
      </div>
      <DiffView patch={hunk.patch} embedded />
    </section>)}
  </div>;
}
