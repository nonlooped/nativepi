import { createKeybindingsHandler } from "tinykeys";
import { bindings, withHint } from "../lib/shortcuts.ts";
import { useEffect, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { GitCommitIcon } from "@phosphor-icons/react/GitCommit";
import { GitPullRequestIcon } from "@phosphor-icons/react/GitPullRequest";
import { MinusIcon } from "@phosphor-icons/react/Minus";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import type { GitChangedFile, GitCommit, GitStatus } from "../../shared/pi-types.ts";
import { PlusIcon } from "../../shared/icons.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { timeAgo } from "../lib/format.ts";
import { rpc } from "../lib/rpc.ts";
import { showHint } from "../lib/toast.tsx";
import { useRequest } from "../lib/useRequest.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import { modelKey } from "../../shared/messages.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import BranchSwitcher from "./BranchSwitcher.tsx";
import FileContextMenu from "./FileContextMenu.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";
import RepoHostPanel from "./RepoHostPanel.tsx";

type CommitAction = "commit" | "push" | "sync";
import DiffPreview from "./DiffPreview.tsx";

// Keep guaranteed async cleanup outside render functions: React Compiler does
// not currently lower try/finally inside a component's event handlers.
async function withCleanup(work: () => Promise<void>, cleanup: () => void) {
  try { await work(); } finally { cleanup(); }
}

export default function SourceControl({
  projectDir,
  git,
  onOpenPullRequest,
}: {
  projectDir: string;
  git: GitStatus;
  onOpenPullRequest: () => void;
}) {
  const keybindingOverrides = useAppStore(s => s.keybindingOverrides);
  const refreshGit = useAppStore((s) => s.refreshGit);
  const commitMessageModel = useAppStore((s) => s.commitMessageModel);
  const sessionFile = useAppStore((s) => activeConversation(s).sessionFile);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingRevert, setPendingRevert] = useState<GitChangedFile | null>(null);
  const [busy, setBusy] = useState<CommitAction | "stage" | null>(null);
  const operation = useRef(false);
  const alive = useRef(true);
  const messageVersion = useRef(0);
  const commitInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const revision = useAppStore(s => s.gitRevision);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showPullRequest = useAppStore((s) => s.repoHost?.host !== "gitlab");
  const stagedFiles = git.files.filter((file) => file.staged);
  const changedFiles = git.files.filter((file) => file.unstaged);
  const [commitOpen, setCommitOpen] = useState(stagedFiles.length > 0);

  useEffect(() => {
    setMessage("");
    setSelected(null);
    setError(null);
    setGenerating(false);
  }, [projectDir]);

  useEffect(() => {
    if (stagedFiles.length > 0) setCommitOpen(true);
  }, [stagedFiles.length]);

  async function run(kind: CommitAction | "stage" | "generate", work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    if (kind === "generate") setGenerating(true); else setBusy(kind);
    setError(null);
    await withCleanup(async () => {
      try { await work(); }
      catch (error) { if (alive.current) setError(error instanceof Error ? error.message : String(error)); }
    }, () => {
      operation.current = false;
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
  const disabled = busy !== null || generating;
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
  }, [canCommit, commit, keybindingOverrides, selected]);

  const canGenerate = stagedFiles.length > 0 && !disabled;

  const selectedStaged = selected?.startsWith("staged:") ?? false;
  const selectedPath = selected?.slice(selected.indexOf(":") + 1);
  const selectedFile = (selectedStaged ? stagedFiles : changedFiles).find(file => file.path === selectedPath);
  if (selectedFile) return <DiffPreview key={selected} projectDir={projectDir} path={selectedFile.path}
    mode={selectedStaged ? "staged" : "working"} revision={revision} onBack={() => setSelected(null)}
    actions={<div className="border-t px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{stateLabel(selectedFile.state)}</span>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => void mutate(() => selectedStaged
          ? rpc.request.gitUnstageFile({ projectDir, file: selectedFile.path, originalPath: selectedFile.originalPath })
          : rpc.request.gitStageFile({ projectDir, file: selectedFile.path }))}>{selectedStaged ? "Unstage file" : "Stage file"}</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {!selectedStaged && <HunkActions projectDir={projectDir} file={selectedFile} stagedVersion={0} revision={revision} disabled={disabled} mutate={mutate} onStaged={() => {}} />}
    </div>} />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-5 text-foreground">
      <section className="flex flex-col gap-3 px-3 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="min-w-0 flex-1 pt-0.5">
            <BranchSwitcher className="h-auto max-w-full px-0 font-semibold text-foreground hover:bg-transparent" />
            <p className="truncate font-mono text-xs leading-4 text-muted-foreground" title={git.upstream}>
              {git.upstream ?? "No upstream branch"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void refreshGit()}
              title={withHint("Refresh changes", "refreshSourceControl", keybindingOverrides)}
              aria-label="Refresh changes"
            >
              <ArrowClockwiseIcon />
            </Button>
            {showPullRequest ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onOpenPullRequest}
                title="Open a pull request"
                aria-label="Open a pull request"
              >
                <GitPullRequestIcon />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-auto text-xs text-muted-foreground">{git.files.length} changed {git.files.length === 1 ? "file" : "files"}</span>
          {git.insertions > 0 ? <span className="text-xs tabular-nums text-success">+{git.insertions}</span> : null}
          {git.deletions > 0 ? <span className="text-xs tabular-nums text-destructive">−{git.deletions}</span> : null}
          {git.lineCountsIncomplete ? <span className="text-xs text-muted-foreground" title="Line totals exclude untracked files that exceeded the counting budget.">Partial line totals</span> : null}
          {git.ahead > 0 ? <Badge variant="outline">↑ {git.ahead} ahead</Badge> : null}
          {git.behind > 0 ? <Badge variant="outline">↓ {git.behind} behind</Badge> : null}
        </div>
      </section>

      <Collapsible.Root open={commitOpen} onOpenChange={setCommitOpen}>
      <section className="mx-3 flex flex-col gap-3 rounded-xl bg-muted/55 p-3">
        <Collapsible.Trigger className="flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <GitCommitIcon className="text-foreground" />
          <h3 className="flex-1 font-heading text-sm font-semibold text-foreground">Create a commit</h3>
          <Badge variant="secondary">{stagedFiles.length} staged</Badge>
          <CaretDownIcon className={cn("shrink-0 text-muted-foreground transition-transform", !commitOpen && "-rotate-90")} />
        </Collapsible.Trigger>
        <Collapsible.Panel className="disclosure-panel">
        <div className="flex flex-col gap-3">
        <Field>
          <div className="flex flex-wrap items-center gap-2">
            <FieldLabel htmlFor="source-control-message">Commit message</FieldLabel>
            <span className="min-w-0 flex-1" />
            <CommitModelSelect />
            <Button variant="ghost" size="xs" onClick={() => void generate()} disabled={!canGenerate} title="Generate a commit message with Pi">
              <SparkleIcon data-icon="inline-start" />
              {generating ? "Writing…" : "Write with Pi"}
            </Button>
          </div>
          <Textarea
            id="source-control-message"
            value={message}
            onChange={(event) => { ++messageVersion.current; setMessage(event.target.value); }}
            ref={commitInput}
            placeholder="Summarize the staged changes"
            className="min-h-20 resize-none text-sm"
          />
          {stagedFiles.length === 0 ? <FieldDescription>Stage at least one file to create a commit.</FieldDescription> : null}
        </Field>
        <div className="flex gap-1.5">
          <Button
            variant={canCommit ? "default" : "outline"}
            className="min-w-0 flex-1"
            onClick={() => void commit("commit")}
            disabled={!canCommit}
            title={commitDisabledReason ?? withHint("Commit staged changes", "commitChanges", keybindingOverrides)}
            aria-label={commitDisabledReason ? `Commit unavailable: ${commitDisabledReason}` : "Commit staged changes"}
          >
            {busy === "commit" ? "Committing…" : "Commit staged changes"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" disabled={!canCommit} aria-label="More commit actions" title={commitDisabledReason ?? "More commit actions"} />}
            >
              <CaretDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => void commit("commit")}>Commit staged changes</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void commit("push")}>Commit and push</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void commit("sync")}>Commit and sync</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>
        </Collapsible.Panel>
      </section>
      </Collapsible.Root>

      {error ? <p role="alert" className="whitespace-pre-wrap px-3 text-xs leading-5 text-destructive">{error}</p> : null}
      <RepoHostPanel />

      <FileGroup
        title="Staged"
        files={stagedFiles}
        staged
        projectDir={projectDir}
        disabled={disabled}
        onSelect={setSelected}
        onAll={() => void mutate(() => rpc.request.gitUnstageAll({ projectDir }))}
        onFile={(file) => void mutate(() => rpc.request.gitUnstageFile({ projectDir, file: file.path, originalPath: file.originalPath }))}
      />
      <FileGroup
        title="Changes"
        files={changedFiles}
        staged={false}
        projectDir={projectDir}
        disabled={disabled}
        onSelect={setSelected}
        onAll={() => void mutate(() => rpc.request.gitStageAll({ projectDir }))}
        onFile={(file) => void mutate(() => rpc.request.gitStageFile({ projectDir, file: file.path }))}
        onRevert={setPendingRevert}
      />

      <ConfirmDialog open={pendingRevert !== null} title="Revert file changes?"
        description="Discard unstaged changes in this file? Staged changes will remain. This cannot be undone."
        detail={pendingRevert?.path} confirmLabel="Revert changes" destructive
        onConfirm={() => { const file = pendingRevert; setPendingRevert(null); if (file) void mutate(() => rpc.request.gitRevertFile({ projectDir, file: file.path })); }}
        onCancel={() => setPendingRevert(null)} />
      {git.files.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">Working tree is clean</p>
          <p className="mt-1 text-xs leading-5 text-body-muted-foreground">New file changes will appear here.</p>
        </div>
      ) : null}
      <CommitGraph projectDir={projectDir} git={git} />
    </div>
  );
}

function FileGroup({
  title,
  files,
  staged,
  projectDir,
  disabled,
  onSelect,
  onAll,
  onFile,
  onRevert,
}: {
  title: string;
  files: GitChangedFile[];
  staged: boolean;
  projectDir: string;
  disabled: boolean;
  onSelect: (key: string | null) => void;
  onAll: () => void;
  onFile: (file: GitChangedFile) => void;
  onRevert?: (file: GitChangedFile) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!files.length) return null;
  return <Collapsible.Root open={open} onOpenChange={setOpen} className="border-t px-2 py-2">
    <div className="flex items-center gap-2 px-1">
      <Collapsible.Trigger className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {open ? <CaretDownIcon /> : <CaretRightIcon />}
        {title}<span className="font-normal tabular-nums text-muted-foreground">{files.length}</span>
      </Collapsible.Trigger>
      <Button variant="ghost" size="xs" disabled={disabled} onClick={onAll} aria-label={staged ? "Unstage all changes" : "Stage all changes"}>{staged ? "Unstage all" : "Stage all"}</Button>
    </div>
    <Collapsible.Panel>
      <ul>
        {files.map(file => {
          const { name, directory } = splitPath(file.path);
          return <li key={file.path}>
            <FileContextMenu projectDir={projectDir} file={file.path} staged={staged} untracked={file.state === "untracked"}>
              <div className="group/file flex items-center gap-1 rounded-md px-2 hover:bg-sidebar-accent">
                <button type="button" title={file.path} onClick={() => onSelect(`${staged ? "staged" : "changed"}:${file.path}`)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <FileTypeIcon path={file.path} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground">{name}</span>
                    {directory && <span className="block truncate text-xs text-muted-foreground">{directory}</span>}
                  </span>
                  <span className={cn("shrink-0 text-xs", stateColor(file.state))} title={stateLabel(file.state)} aria-label={stateLabel(file.state)}>{stateBadge(file.state)}</span>
                </button>
                {!staged && file.state !== "untracked" && <Button variant="ghost" size="xs" disabled={disabled} onClick={() => onRevert?.(file)} aria-label={`Revert ${file.path}`}>Revert</Button>}
                <Button variant="ghost" size="icon-xs" disabled={disabled} onClick={() => onFile(file)} title={staged ? "Unstage file" : "Stage file"} aria-label={`${staged ? "Unstage" : "Stage"} ${file.path}`}>{staged ? <MinusIcon /> : <PlusIcon />}</Button>
              </div>
            </FileContextMenu>
          </li>;
        })}
      </ul>
    </Collapsible.Panel>
  </Collapsible.Root>;
}

function HunkActions({
  projectDir,
  file,
  stagedVersion,
  revision,
  disabled,
  mutate,
  onStaged,
}: {
  projectDir: string;
  file: GitChangedFile;
  stagedVersion: number;
  revision: number;
  disabled: boolean;
  mutate: (work: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
  onStaged: () => void;
}) {
  const { data, loading, error } = useRequest(
    // New files have one hunk, so only whole-file staging is useful.
    () => file.state === "untracked" ? Promise.resolve({ hunks: [] })
      : rpc.request.gitHunks({ projectDir, file: file.path, untracked: false }),
    [projectDir, file.path, file.state, stagedVersion, revision],
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (loading) return null;
  if (error || !data) return <p className="border-b px-3 py-2 text-xs text-muted-foreground">Unable to read this file’s changes, so partial staging is unavailable.</p>;

  if (data.hunks.length < 2) return null;

  async function stage(patch: string, index: number) {
    setBusy(index);
    setFailure(null);
    await withCleanup(async () => {
      await mutate(() => rpc.request.gitStageHunk({ projectDir, file: file.path, untracked: file.state === "untracked", patch }));
      onStaged();
    }, () => setBusy(null));

  }

  return (
    <div className="border-b px-2 py-2">
      <Collapsible.Root open={partsOpen} onOpenChange={setPartsOpen}>
        {data.hunks.length > 1 ? (
          <Collapsible.Trigger className="group flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <CaretRightIcon className="transition-transform group-data-[panel-open]:rotate-90" />
            Stage individual changes
          </Collapsible.Trigger>
        ) : null}
        {data.hunks.length > 1 ? (
          <Collapsible.Panel className="mt-1.5 flex flex-col gap-1 border-t pt-1.5">
            {data.hunks.map((hunk, index) => (
              <div key={hunk.patch} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                <span className="min-w-0 flex-1 truncate text-xs">Change {index + 1} <span className="font-mono text-muted-foreground">{hunkLocation(hunk.header)}</span></span>
                <Button size="sm" variant="outline" disabled={disabled} onClick={() => void stage(hunk.patch, index)}>
                  {busy === index ? "Staging…" : "Stage"}
                </Button>
              </div>
            ))}
          </Collapsible.Panel>
        ) : null}
      </Collapsible.Root>
      {failure ? <p role="alert" className="mt-1.5 whitespace-pre-wrap px-1 text-xs text-destructive">{failure}</p> : null}
    </div>
  );
}

function CommitGraph({ projectDir, git }: { projectDir: string; git: GitStatus }) {
  const [open, setOpen] = useState(false);
  const { data, error, reload } = useRequest(
    () => rpc.request.gitLog({ projectDir }),
    [projectDir, git.head, git.upstream, git.ahead, git.behind],
  );
  const commits = data?.commits ?? null;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="flex flex-col gap-1 border-t px-3 py-2">
      <div className="flex h-7 items-center gap-1">
        <Collapsible.Trigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          {open ? <CaretDownIcon /> : <CaretRightIcon />}
          History
          {commits ? <Badge variant="secondary">{commits.length}</Badge> : null}
        </Collapsible.Trigger>
        {error ? (
          <Button variant="ghost" size="icon-xs" onClick={reload} title="Reload commit graph" aria-label="Reload commit graph">
            <ArrowClockwiseIcon />
          </Button>
        ) : null}
      </div>
      <Collapsible.Panel>
        {error ? <p className="py-2 text-xs text-destructive">Unable to load commit history.</p> : null}
        {!error && commits === null ? <p className="py-2 text-xs text-muted-foreground">Loading history…</p> : null}
        {commits?.length === 0 ? <p className="py-2 text-xs text-muted-foreground">No commits yet.</p> : null}
        {commits ? <ul className="flex flex-col gap-0.5">{commits.map((commit) => <CommitRow key={commit.hash} commit={commit} />)}</ul> : null}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function CommitRow({ commit }: { commit: GitCommit }) {
  const refs = commit.refs.flatMap((ref) => ref === "HEAD" ? [] : [ref.replace(/^HEAD -> /, "")]);
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-1 rounded-lg px-2 py-2 hover:bg-sidebar-accent/50" title={commit.hash}>
      <span className="whitespace-pre font-mono text-xs leading-5 text-info" aria-hidden="true">{commit.graph.replaceAll("*", "●")}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{commit.subject}</p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="font-mono">{commit.shortHash}</span>
          <span className="truncate">{commit.author}</span>
          <span>·</span>
          <span>{timeAgo(commit.timestamp, Date.now())}</span>
          <Badge variant="outline" className={commit.pushed ? "text-success" : "text-warning"}>
            {commit.pushed ? "Pushed" : "Local"}
          </Badge>
          {refs.map((ref) => <Badge key={ref} variant="secondary" className="max-w-40 truncate">{ref}</Badge>)}
        </div>
      </div>
    </li>
  );
}

function splitPath(path: string) {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? { name: path, directory: "" } : { name: path.slice(separator + 1), directory: path.slice(0, separator) };
}

function hunkLocation(header: string) {
  const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(header);
  if (!match) return "";
  const start = Number(match[1]);
  const count = Number(match[2] ?? "1");
  return count > 1 ? `lines ${start}-${start + count - 1}` : `line ${start}`;
}

function stateBadge(state: GitChangedFile["state"]) {
  return state === "added" ? "A" : state === "deleted" ? "D" : state === "renamed" ? "R" : state === "untracked" ? "U" : "M";
}

function stateLabel(state: GitChangedFile["state"]) {
  return state === "added" ? "Added" : state === "deleted" ? "Deleted" : state === "renamed" ? "Renamed" : state === "untracked" ? "Untracked" : "Modified";
}

function stateColor(state: GitChangedFile["state"]) {
  if (state === "added") return "text-success";
  if (state === "deleted") return "text-destructive";
  if (state === "untracked") return "text-info";
  return "text-warning";
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
        className="h-7 w-auto min-w-36 max-w-52 px-2 text-xs"
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
