import { createKeybindingsHandler } from "tinykeys";
import { bindings, withHint } from "../lib/shortcuts.ts";
import { useEffect, useRef, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { XIcon } from "@phosphor-icons/react/X";
import { GitCommitIcon } from "@phosphor-icons/react/GitCommit";
import { GitPullRequestIcon } from "@phosphor-icons/react/GitPullRequest";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import type { GitChangedFile, GitStatus } from "../../shared/pi-types.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import GitHistory from "./GitHistory.tsx";
import ChangeTree from "./ChangeTree.tsx";
import { Input } from "@/components/ui/input.tsx";
import { rpc } from "../lib/rpc.ts";
import { showHint } from "../lib/toast.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { modelKey } from "../../shared/messages.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import BranchSwitcher from "./BranchSwitcher.tsx";
import RepoHostPanel from "./RepoHostPanel.tsx";

type CommitAction = "commit" | "push" | "sync";

// Keep guaranteed async cleanup outside render functions: React Compiler does
// not currently lower try/finally inside a component's event handlers.
async function withCleanup(work: () => Promise<void>, cleanup: () => void) {
  try { await work(); } finally { cleanup(); }
}

export default function SourceControl({
  projectDir,
  git,
  onOpenPullRequest,
  onClose,
  onReview,
}: {
  projectDir: string;
  git: GitStatus;
  onOpenPullRequest: () => void;
  onClose?: () => void;
  onReview?: () => void;
}) {
  const keybindingOverrides = useAppStore(s => s.keybindingOverrides);
  const refreshGit = useAppStore((s) => s.refreshGit);
  const commitMessageModel = useAppStore((s) => s.commitMessageModel);
  const sessionFile = useAppStore((s) => activeConversation(s).sessionFile);
  const message = useAppStore(s => s.sourceControlDrafts[projectDir] ?? "");
  const setDraft = useAppStore(s => s.setSourceControlDraft);
  const setMessage = (message: string) => setDraft(projectDir, message);
  const review = useAppStore(s => s.sourceControlReview);
  const setReview = useAppStore(s => s.setSourceControlReview);
  const selected = review?.projectDir === projectDir && !review.hash ? `${review.staged ? "staged" : "changed"}:${review.path}` : null;
  function setSelected(key: string | null) {
    if (key) { setReview({ projectDir, path: key.slice(key.indexOf(":") + 1), staged: key.startsWith("staged:") }); onReview?.(); }
  }
  const [pendingRevert, setPendingRevert] = useState<GitChangedFile | null>(null);
  const [busy, setBusy] = useState<CommitAction | "stage" | null>(null);
  const operation = useRef(false);
  const sharedBusy = useAppStore(s => s.sourceControlBusy);
  const alive = useRef(true);
  const messageVersion = useRef(0);
  const commitInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showPullRequest = useAppStore((s) => s.repoHost?.host !== "gitlab");
  const stagedFiles = git.files.filter((file) => file.staged);
  const changedFiles = git.files.filter((file) => file.unstaged);
  const [tab, setTab] = useState<"changes" | "history">("changes");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setError(null);
    setGenerating(false);
  }, [projectDir]);



  async function run(kind: CommitAction | "stage" | "generate", work: () => Promise<void>) {
    if (operation.current || useAppStore.getState().sourceControlBusy) return;
    useAppStore.getState().setSourceControlBusy(true);
    operation.current = true;
    if (kind === "generate") setGenerating(true); else setBusy(kind);
    setError(null);
    await withCleanup(async () => {
      try { await work(); }
      catch (error) { if (alive.current) setError(error instanceof Error ? error.message : String(error)); }
    }, () => {
      operation.current = false;
      useAppStore.getState().setSourceControlBusy(false);
      if (alive.current) { setBusy(null); setGenerating(false); }
    });
  }
  async function generate() {
    if (!stagedFiles.length) return;
    const version = messageVersion.current;
    await run("generate", async () => {
      const result = await rpc.request.gitGenerateCommitMessage({ projectDir, sessionFile,
        ...(commitMessageModel === "active" ? {} : { model: commitMessageModel }) });
      if (!result.message) throw new Error(result.error ?? "Pi could not generate a commit message.");
      const current = useAppStore.getState();
      if (alive.current && current.activeProjectPath === projectDir && current.activeSessionFile === sessionFile && version === messageVersion.current) setMessage(result.message);
    });
  }
  async function commit(action: CommitAction) {
    if (!message.trim() || !stagedFiles.length) return;
    const version = messageVersion.current;
    await run(action, async () => {
      const result = await rpc.request.gitCommit({ projectDir, message });
      if (!result.ok) throw new Error(result.error ?? "Git could not create the commit.");
      if (alive.current && version === messageVersion.current) setMessage("");
      await refreshGit();
      if (action === "commit") { if (alive.current) showHint("Commit created"); return; }
      const sent = action === "sync" ? await rpc.request.gitSync({ projectDir }) : await rpc.request.gitPush({ projectDir });
      await refreshGit();
      if (!sent.ok) throw new Error(`Commit created, but Git could not ${action}: ${sent.error ?? "Unknown error"}`);
      if (alive.current) showHint(action === "sync" ? "Committed and synced" : "Committed and pushed");
    });
  }
  async function mutate(work: () => Promise<{ ok: boolean; error?: string }>) {
    await run("stage", async () => {
      const result = await work();
      if (!result.ok) throw new Error(result.error ?? "Git could not update the index.");
      await refreshGit();
    });
  }
  const disabled = sharedBusy || busy !== null || generating;
  const canCommit = Boolean(message.trim()) && stagedFiles.length > 0 && !disabled;
  const commitDisabledReason = disabled ? "Working…" : stagedFiles.length === 0 ? "Stage changes first" : !message.trim() ? "Add a commit message" : undefined;
  useEffect(() => {
    const input = commitInput.current;
    if (!input) return;
    const handler = createKeybindingsHandler(bindings({
      commitChanges: event => {
        if (!canCommit) return;
        event.preventDefault();
        event.stopPropagation();
        void commit("commit");
      },
    }, keybindingOverrides), { ignore: event => (event as KeyboardEvent).isComposing });
    input.addEventListener("keydown", handler);
    return () => input.removeEventListener("keydown", handler);
  }, [canCommit, commit, keybindingOverrides, selected, tab]);

  const canGenerate = stagedFiles.length > 0 && !disabled;

  const visible = (files: GitChangedFile[]) => files.filter(file => file.path.toLowerCase().includes(filter.toLowerCase()));
  const sync = (action: "push" | "sync") => run(action, async () => {
    const result = await (action === "push" ? rpc.request.gitPush({ projectDir }) : rpc.request.gitSync({ projectDir }));
    await refreshGit();
    if (!result.ok) throw new Error(result.error ?? "Git could not sync this branch.");
    showHint(action === "push" ? "Branch pushed" : "Branch synced");
  });

  return <div className="flex min-h-0 flex-1 flex-col text-foreground">
    <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
      <BranchSwitcher handleRequests className="mr-auto min-w-0 flex-1" />
      <Button size="sm" variant="outline" disabled={disabled || git.detached} onClick={() => void sync("push")}>{busy === "push" ? "Pushing…" : git.upstream ? `Push${git.ahead ? ` ${git.ahead}` : ""}` : "Publish"}</Button>
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Source control actions" />}><CaretDownIcon /></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuGroup>
          <DropdownMenuItem disabled={disabled || git.detached} onClick={() => void sync("push")}>{git.upstream ? "Push commits" : "Publish branch"}</DropdownMenuItem>
          <DropdownMenuItem disabled={disabled || git.detached || !git.upstream} onClick={() => void sync("sync")}>Sync (fast-forward only){git.behind ? ` · ${git.behind} behind` : ""}</DropdownMenuItem>
          {showPullRequest && <DropdownMenuItem onClick={onOpenPullRequest}><GitPullRequestIcon />Open a pull request</DropdownMenuItem>}
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon-sm" onClick={() => void refreshGit()} title={withHint("Refresh changes", "refreshSourceControl", keybindingOverrides)} aria-label="Refresh changes"><ArrowClockwiseIcon /></Button>
      {onClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Hide source control"><XIcon /></Button>}
    </div>
    {error && <p role="alert" className="shrink-0 whitespace-pre-wrap border-b px-4 py-2 text-xs text-destructive">{error}</p>}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b px-3" role="tablist" aria-label="Source control view">
          <Button role="tab" aria-selected={tab === "changes"} variant={tab === "changes" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("changes")}>Changes <span className="text-xs tabular-nums text-muted-foreground">{git.files.length}</span></Button>
          <Button role="tab" aria-selected={tab === "history"} variant={tab === "history" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("history")}>History</Button>
          {tab === "changes" && <span className="ml-auto text-xs tabular-nums"><span className="text-success">+{git.insertions}</span> <span className="text-destructive">−{git.deletions}</span></span>}
        </div>
        {tab === "changes" ? <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <section className="border-b p-3" aria-label="Create a commit">
            <div className="overflow-hidden rounded-xl border bg-background/35 focus-within:border-ring">
            <Textarea id="source-control-message" aria-label="Commit message" value={message} onChange={event => { ++messageVersion.current; setMessage(event.target.value); }} ref={commitInput} placeholder="Message" rows={2} className="min-h-14 resize-none rounded-none border-0 bg-transparent dark:bg-transparent shadow-none focus-visible:ring-0" />
            <div className="flex min-w-0 items-center gap-1 px-2 pb-2">
              <CommitModelSelect />
              <Button variant="ghost" size="icon-xs" onClick={() => void generate()} disabled={!canGenerate} title="Generate a commit message with Pi"><SparkleIcon className={generating ? "animate-pulse" : undefined} /><span className="sr-only">{generating ? "Writing…" : "Write with Pi"}</span></Button>
              <span className="flex-1" />
              <Button size="xs" className="min-w-0" onClick={() => void commit("commit")} disabled={!canCommit} title={commitDisabledReason ?? withHint("Commit staged changes", "commitChanges", keybindingOverrides)}><GitCommitIcon />{busy === "commit" ? "Committing…" : `Commit${stagedFiles.length ? ` ${stagedFiles.length}` : ""}`}</Button>
              <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" disabled={!canCommit} aria-label="More commit actions" />}><CaretDownIcon /></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => void commit("push")}>Commit and push</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void commit("sync")}>Commit and sync</DropdownMenuItem>
                </DropdownMenuGroup></DropdownMenuContent>
              </DropdownMenu>
            </div>
            </div>
          </section>
          {git.files.length > 0 && <div className="p-3 pb-1"><Input aria-label="Filter changed files" placeholder="Filter files…" value={filter} onChange={event => setFilter(event.target.value)} /></div>}
          <ChangeTree projectDir={projectDir} filtered={!!filter} title="Staged" files={visible(stagedFiles)} staged selected={selected} disabled={disabled} onSelect={setSelected}
            onFiles={files => void mutate(async () => { for (const file of files) { const result = await rpc.request.gitUnstageFile({ projectDir, file: file.path, originalPath: file.originalPath }); if (!result.ok) return result; } return { ok: true }; })}
            onAll={() => void mutate(() => rpc.request.gitUnstageAll({ projectDir }))} />
          <ChangeTree projectDir={projectDir} filtered={!!filter} title="Changes" files={visible(changedFiles)} staged={false} selected={selected} disabled={disabled} onSelect={setSelected} onRevert={setPendingRevert}
            onFiles={files => void mutate(async () => { for (const file of files) { const result = await rpc.request.gitStageFile({ projectDir, file: file.path }); if (!result.ok) return result; } return { ok: true }; })}
            onAll={() => void mutate(() => rpc.request.gitStageAll({ projectDir }))} />
          {git.files.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Working tree is clean</p> : filter && !visible(git.files).length ? <p className="p-4 text-xs text-muted-foreground">No files match this filter.</p> : null}
          {git.lineCountsIncomplete && <p className="px-3 py-2 text-xs text-muted-foreground">Line totals exclude large untracked files.</p>}
          <RepoHostPanel />
        </div> : null}
      {tab === "history" ? <GitHistory key={projectDir} projectDir={projectDir} git={git} onReview={onReview} /> : null}
    </div>
    <ConfirmDialog open={pendingRevert !== null} title="Revert file changes?" description="Discard unstaged changes in this file? Staged changes will remain. This cannot be undone." detail={pendingRevert?.path} confirmLabel="Revert changes" destructive
      onConfirm={() => { const file = pendingRevert; setPendingRevert(null); if (file) void mutate(() => rpc.request.gitRevertFile({ projectDir, file: file.path })); }} onCancel={() => setPendingRevert(null)} />
  </div>;
}

function CommitModelSelect() {
  const commitMessageModel = useAppStore((s) => s.commitMessageModel);
  const setCommitMessageModel = useAppStore((s) => s.setCommitMessageModel);
  const models = useAppStore((s) => s.models);
  const providers = useAppStore((s) => s.providers);
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]));
  const options = [
    { value: "active", label: "Current chat model" },
    ...models.map((model) => ({
      value: modelKey(model),
      label: `${model.name ?? model.id} · ${providerNames.get(model.provider) ?? model.provider}`,
    })),
  ];
  if (!options.some((option) => option.value === commitMessageModel)) {
    options.push({ value: commitMessageModel, label: commitMessageModel });
  }

  return (
    <Select
      value={commitMessageModel}
      onValueChange={(next) => {
        if (typeof next === "string") setCommitMessageModel(next);
      }}
      items={options}
    >
      <SelectTrigger
        aria-label="Commit message model"
        title="Model used to draft commit messages"
        className="h-6 w-24 min-w-0 border-0 bg-transparent px-1 text-xs dark:bg-transparent"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="min-h-8 px-2.5 text-sm">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
