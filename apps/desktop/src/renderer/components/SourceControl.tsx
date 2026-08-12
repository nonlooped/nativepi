import { lazy, Suspense, useEffect, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
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
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import FileContextMenu from "./FileContextMenu.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";
import RepoHostPanel from "./RepoHostPanel.tsx";

type CommitAction = "commit" | "push" | "sync";
const DiffView = lazy(() => import("./DiffView.tsx"));

export default function SourceControl({
  projectDir,
  git,
  onOpenPullRequest,
}: {
  projectDir: string;
  git: GitStatus;
  onOpenPullRequest: () => void;
}) {
  const refreshGit = useAppStore((s) => s.refreshGit);
  const commitMessageModel = useAppStore((s) => s.commitMessageModel);
  const sessionFile = useAppStore((s) => activeConversation(s).sessionFile);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<CommitAction | "stage" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stagedFiles = git.files.filter((file) => file.staged);
  const changedFiles = git.files.filter((file) => file.unstaged);

  useEffect(() => {
    setMessage("");
    setSelected(null);
    setError(null);
    setGenerating(false);
  }, [projectDir]);

  async function generate() {
    if (stagedFiles.length === 0 || generating) return;
    setGenerating(true);
    setError(null);
    const result = await rpc.request.gitGenerateCommitMessage({
      projectDir,
      sessionFile,
      ...(commitMessageModel === "active" ? {} : { model: commitMessageModel }),
    });
    const current = useAppStore.getState();
    if (current.activeProjectPath !== projectDir || activeConversation(current).sessionFile !== sessionFile) {
      setGenerating(false);
      return;
    }
    setGenerating(false);
    if (!result.message) return setError(result.error ?? "Pi could not generate a commit message.");
    setMessage(result.message);
  }

  async function commit(action: CommitAction) {
    if (!message.trim() || stagedFiles.length === 0) return;
    setBusy(action);
    setError(null);
    const committed = await rpc.request.gitCommit({ projectDir, message });
    if (!committed.ok) {
      setBusy(null);
      return setError(committed.error ?? "Git could not create the commit.");
    }

    setMessage("");
    await refreshGit();
    if (action === "commit") {
      setBusy(null);
      return showHint("Commit created");
    }

    const sent = action === "sync"
      ? await rpc.request.gitSync({ projectDir })
      : await rpc.request.gitPush({ projectDir });
    setBusy(null);
    await refreshGit();
    if (!sent.ok) return setError(`Commit created, but Git could not ${action === "sync" ? "sync" : "push"}: ${sent.error ?? "Unknown error"}`);
    showHint(action === "sync" ? "Committed and synced" : "Committed and pushed");
  }

  async function mutate(run: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy("stage");
    setError(null);
    const result = await run();
    setBusy(null);
    if (!result.ok) return setError(result.error ?? "Git could not update the index.");
    setSelected(null);
    await refreshGit();
  }

  const canCommit = Boolean(message.trim()) && stagedFiles.length > 0 && busy === null;
  const commitDisabledReason = busy !== null ? "Working…" : stagedFiles.length === 0 ? "Stage changes first" : !message.trim() ? "Add a commit message" : undefined;
  const canGenerate = stagedFiles.length > 0 && !generating;

  return (
    <div className="flex flex-col pb-5">
      <section className="flex flex-col gap-3 px-3 pb-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <GitBranchIcon />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {git.detached ? "Detached HEAD" : (git.branch ?? "No branch")}
            </p>
            <p className="truncate font-mono text-[0.6875rem] leading-4 text-muted-foreground" title={git.upstream}>
              {git.upstream ?? "No upstream branch"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void refreshGit()}
              title="Refresh changes"
              aria-label="Refresh changes"
            >
              <ArrowClockwiseIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onOpenPullRequest}
              title="Open a pull request"
              aria-label="Open a pull request"
            >
              <GitPullRequestIcon />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{git.files.length} {git.files.length === 1 ? "file" : "files"}</Badge>
          {git.insertions > 0 ? <Badge variant="outline" className="text-success">+{git.insertions}</Badge> : null}
          {git.deletions > 0 ? <Badge variant="outline" className="text-destructive">−{git.deletions}</Badge> : null}
          {git.ahead > 0 ? <Badge variant="outline">↑ {git.ahead} ahead</Badge> : null}
          {git.behind > 0 ? <Badge variant="outline">↓ {git.behind} behind</Badge> : null}
        </div>
      </section>

      <section className="mx-3 flex flex-col gap-3 rounded-xl bg-muted/55 p-3">
        <div className="flex items-center gap-2">
          <GitCommitIcon className="text-foreground" />
          <h3 className="flex-1 font-heading text-sm font-semibold text-foreground">Create a commit</h3>
          <Badge variant="secondary">{stagedFiles.length} staged</Badge>
        </div>
        <Field>
          <div className="flex items-center gap-2">
            <FieldLabel htmlFor="source-control-message">Commit message</FieldLabel>
            <span className="flex-1" />
            <Button variant="ghost" size="xs" onClick={() => void generate()} disabled={!canGenerate} title="Generate a commit message with Pi">
              <SparkleIcon data-icon="inline-start" />
              {generating ? "Writing…" : "Write with Pi"}
            </Button>
          </div>
          <Textarea
            id="source-control-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canCommit) void commit("commit");
            }}
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
            title={commitDisabledReason}
            aria-label={commitDisabledReason ? `Commit — ${commitDisabledReason}` : "Commit staged changes"}
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
        {error ? <p role="alert" className="whitespace-pre-wrap text-xs leading-5 text-destructive">{error}</p> : null}
      </section>

      <RepoHostPanel />

      <FileGroup
        title="Staged"
        files={stagedFiles}
        staged
        projectDir={projectDir}
        selected={selected}
        disabled={busy !== null}
        onSelect={setSelected}
        onAll={() => void mutate(() => rpc.request.gitUnstageAll({ projectDir }))}
        onFile={(file) => void mutate(() => rpc.request.gitUnstageFile({ projectDir, file: file.path, originalPath: file.originalPath }))}
      />
      <FileGroup
        title="Changes"
        files={changedFiles}
        staged={false}
        projectDir={projectDir}
        selected={selected}
        disabled={busy !== null}
        onSelect={setSelected}
        onAll={() => void mutate(() => rpc.request.gitStageAll({ projectDir }))}
        onFile={(file) => void mutate(() => rpc.request.gitStageFile({ projectDir, file: file.path }))}
      />

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
  selected,
  disabled,
  onSelect,
  onAll,
  onFile,
}: {
  title: string;
  files: GitChangedFile[];
  staged: boolean;
  projectDir: string;
  selected: string | null;
  disabled: boolean;
  onSelect: (key: string | null) => void;
  onAll: () => void;
  onFile: (file: GitChangedFile) => void;
}) {
  const [open, setOpen] = useState(true);
  if (files.length === 0) return null;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="flex flex-col gap-1 px-3 pt-5">
      <div className="flex h-7 items-center gap-1">
        <Collapsible.Trigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          {open ? <CaretDownIcon /> : <CaretRightIcon />}
          <span className="truncate">{title}</span>
          <Badge variant="secondary">{files.length}</Badge>
        </Collapsible.Trigger>
        <Button
          variant="ghost"
          size="xs"
          onClick={onAll}
          disabled={disabled}
          title={staged ? "Unstage all changes" : "Stage all changes"}
          aria-label={staged ? "Unstage all changes" : "Stage all changes"}
        >
          {staged ? <MinusIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
          {staged ? "Unstage all" : "Stage all"}
        </Button>
      </div>
      <Collapsible.Panel>
        <div className="flex flex-col gap-0.5">
          {files.map((file) => {
            const key = `${staged ? "staged" : "changed"}:${file.path}`;
            const active = selected === key;
            const { name, directory } = splitPath(file.path);
            return (
              <div key={file.path}>
                <FileContextMenu projectDir={projectDir} file={file.path} untracked={file.state === "untracked"} staged={staged}>
                  <div
                    className={cn(
                      "group/file flex min-h-9 items-center rounded-lg px-2 transition-colors hover:bg-sidebar-accent/45",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                      aria-expanded={active}
                      onClick={() => onSelect(active ? null : key)}
                      title={file.path}
                    >
                      <FileTypeIcon path={file.path} className={cn("opacity-65", active && "opacity-100")} />
                      <span className="min-w-0 truncate font-medium">{name}</span>
                      {directory ? <span className="context-file-directory min-w-0 flex-1 truncate text-muted-foreground/65">{directory}</span> : <span className="flex-1" />}
                      <span
                        role="img"
                        aria-label={stateLabel(file.state)}
                        className={cn("w-4 shrink-0 text-center font-mono font-semibold", stateColor(file.state))}
                        title={stateLabel(file.state)}
                      >
                        {stateBadge(file.state)}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ml-0.5 shrink-0 opacity-60 group-hover/file:opacity-100 group-focus-within/file:opacity-100"
                      onClick={() => onFile(file)}
                      disabled={disabled}
                      title={staged ? `Unstage ${file.path}` : `Stage ${file.path}`}
                      aria-label={staged ? `Unstage ${file.path}` : `Stage ${file.path}`}
                    >
                      {staged ? <MinusIcon /> : <PlusIcon />}
                    </Button>
                  </div>
                </FileContextMenu>
                {active ? <FileDiff key={key} file={file} projectDir={projectDir} staged={staged} /> : null}
              </div>
            );
          })}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function FileDiff({ file, projectDir, staged }: { file: GitChangedFile; projectDir: string; staged: boolean }) {
  const [stagedVersion, setStagedVersion] = useState(0);
  const { data, error, reload } = useRequest(
    () => rpc.request.gitDiff({ projectDir, file: file.path, untracked: file.state === "untracked", staged }),
    [projectDir, file.path, file.state, staged, stagedVersion],
  );
  const patch = data?.diff.patch ?? null;

  return (
    <div className="mt-1 overflow-hidden rounded-lg border bg-background">
      {error ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-destructive">
          <span className="min-w-0 flex-1">Unable to load this diff.</span>
          <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-destructive" onClick={reload}>
            <ArrowClockwiseIcon data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : patch === null ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Loading diff…</p>
      ) : patch === "" ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">No textual diff to show.</p>
      ) : (
        <>
          {!staged ? (
            <HunkActions projectDir={projectDir} file={file} stagedVersion={stagedVersion} onStaged={() => setStagedVersion((value) => value + 1)} />
          ) : null}
          <Suspense fallback={null}>
            <DiffView patch={patch} />
          </Suspense>
        </>
      )}
    </div>
  );
}

function HunkActions({
  projectDir,
  file,
  stagedVersion,
  onStaged,
}: {
  projectDir: string;
  file: GitChangedFile;
  stagedVersion: number;
  onStaged: () => void;
}) {
  const refreshGit = useAppStore((s) => s.refreshGit);
  const { data, loading, error } = useRequest(
    () => rpc.request.gitHunks({ projectDir, file: file.path, untracked: file.state === "untracked" }),
    [projectDir, file.path, file.state, stagedVersion],
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (loading) return null;
  if (error || !data) return <p className="border-b px-3 py-2 text-xs text-muted-foreground">Unable to read this file’s changes, so partial staging is unavailable.</p>;

  async function stage(patch: string, index: number) {
    setBusy(index);
    setFailure(null);
    const result = await rpc.request.gitStageHunk({ projectDir, file: file.path, untracked: file.state === "untracked", patch });
    setBusy(null);
    if (!result.ok) return setFailure(result.error ?? "Git could not stage this change.");
    await refreshGit();
    onStaged();
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
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void stage(hunk.patch, index)}>
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
  const [open, setOpen] = useState(true);
  const { data, error, reload } = useRequest(
    () => rpc.request.gitLog({ projectDir }),
    [projectDir, git.head, git.upstream, git.ahead, git.behind],
  );
  const commits = data?.commits ?? null;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="flex flex-col gap-1 px-3 pt-5">
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
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[0.6875rem] text-muted-foreground">
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
  return count > 1 ? `lines ${start}–${start + count - 1}` : `line ${start}`;
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
