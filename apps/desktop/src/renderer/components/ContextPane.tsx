import { useEffect, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { GitCommitIcon } from "@phosphor-icons/react/GitCommit";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import type { GitChangedFile } from "../../shared/pi-types.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { showHint } from "../lib/toast.tsx";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import { withHint } from "../lib/shortcuts.ts";
import DiffView from "./DiffView.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";
import FileContextMenu from "./FileContextMenu.tsx";
import { ExtensionPanels } from "./ExtensionSlots.tsx";
import CommitDialog from "./CommitDialog.tsx";
import RepoHostPanel from "./RepoHostPanel.tsx";
import FileExplorer from "./FileExplorer.tsx";

/**
 * Which of the pane's two views is showing.
 *
 * This replaced a single ghost button labelled with the view you were *not*
 * looking at, sitting a few pixels from a heading labelled with the view you
 * were — two words, opposite meanings, no way to tell which was which. Both
 * names are present now, and the selected one is the one that is filled.
 */
function ViewSwitch({ files, onChange }: { files: boolean; onChange: (files: boolean) => void }) {
  return (
    <ToggleGroup
      value={[files ? "files" : "changes"]}
      onValueChange={(value) => {
        const selected = value.at(0);
        if (selected === "changes" || selected === "files") onChange(selected === "files");
      }}
      spacing={0}
      aria-label="Pane view"
      className="h-7 rounded-lg bg-muted p-0.5 text-xs font-medium"
    >
      {[
        { label: "Changes" },
        { label: "Files" },
      ].map((view) => (
        <ToggleGroupItem
          key={view.label}
          value={view.label.toLowerCase()}
          className={cn(
            "rounded-md px-2 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            "text-muted-foreground hover:text-foreground data-pressed:bg-sidebar data-pressed:text-foreground",
          )}
        >
          {view.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export default function ContextPane({ overlay = false, onClose }: { overlay?: boolean; onClose?: () => void }) {
  const git = useAppStore((s) => s.git);
  const refreshGit = useAppStore((s) => s.refreshGit);
  const requestBranchMenu = useAppStore((s) => s.requestBranchMenu);
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const running = useAppStore((s) => activeConversation(s).running);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const [selected, setSelected] = useState<GitChangedFile | null>(null);
  const [committing, setCommitting] = useState(false);
  const [files, setFiles] = useState(false);

  useEffect(() => setSelected(null), [projectDir]);

  return (
    <aside className="context-pane flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-12 shrink-0 items-center gap-1 pr-2 pl-3", !overlay && WINDOW_CONTROLS_CLEARANCE)}>
        <ViewSwitch files={files} onChange={setFiles} />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void refreshGit()}
          title="Refresh Git status"
          aria-label="Refresh Git status"
        >
          <ArrowClockwiseIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setCommitting(true)} disabled={!git?.isRepo} title="Commit changes" aria-label="Commit changes">
          <GitCommitIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose ?? toggleContextPane}
          title={withHint("Hide changes pane", "toggleContextPane", keybindingOverrides)}
          aria-label="Hide changes pane"
        >
          <SidebarSimpleIcon className="-scale-x-100" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {files ? (projectDir ? <FileExplorer projectDir={projectDir} /> : <p className="px-3 py-4 text-xs text-muted-foreground">No project is open.</p>) : <>
        {!git ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
        ) : !git.isRepo ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">This folder is not a Git repository.</p>
        ) : (
          <>
            <ContextMenu>
              <ContextMenuTrigger render={<div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground" />}>
                <GitBranchIcon className="shrink-0" />
                <span className="truncate">{git.detached ? "No branch (detached)" : (git.branch ?? "—")}</span>
                {/* `aria-label` is ignored on a span with no role, so the words
                    behind these figures are spelled out instead. */}
                <span className="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums">
                  <span className="text-success">
                    <span aria-hidden="true">+{git.insertions}</span>
                    <span className="sr-only">{git.insertions} insertions</span>
                  </span>
                  <span className="text-destructive">
                    <span aria-hidden="true">-{git.deletions}</span>
                    <span className="sr-only">{git.deletions} deletions</span>
                  </span>
                  <span>{git.files.length} changed</span>
                </span>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={!git.branch}
                  onClick={() =>
                    git.branch && void navigator.clipboard.writeText(git.branch).then(() => showHint("Branch name copied"))
                  }
                >
                  Copy branch name
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={running}
                  onClick={() => {
                    onClose?.();
                    requestBranchMenu();
                  }}
                >
                  Switch branch…
                </ContextMenuItem>
                <ContextMenuItem onClick={() => void refreshGit()}>Refresh status</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>

            <RepoHostPanel />

            {git.files.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">Working tree clean.</p>
            ) : (
              <div className="mx-2 overflow-hidden rounded-md border border-sidebar-border/70">
                {git.files.map((file) => (
                  <div key={file.path} className="border-b border-sidebar-border/60 bg-background/20 last:border-b-0">
                    {projectDir ? <FileContextMenu projectDir={projectDir} file={file.path} untracked={file.state === "untracked"}>
                    <button
                      type="button"
                      aria-expanded={selected?.path === file.path}
                      onClick={() => setSelected(selected?.path === file.path ? null : file)}
                      className={cn(
                        "flex min-h-8 w-full items-center gap-2 px-2 text-left text-xs outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                        selected?.path === file.path && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                      title={file.path}
                    >
                      {selected?.path === file.path ? <CaretDownIcon /> : <CaretRightIcon />}
                      <FileTypeIcon path={file.path} />
                      <span className="min-w-0 flex-1 truncate font-medium">{file.path}</span>
                      {file.staged ? <span className="shrink-0 text-xs text-muted-foreground">staged</span> : null}
                      <span
                        className={cn("w-4 shrink-0 text-center font-mono text-xs font-semibold", stateColor(file.state))}
                        title={stateLabel(file.state)}
                      >
                        <span aria-hidden="true">{stateBadge(file.state)}</span>
                        <span className="sr-only">{stateLabel(file.state)}</span>
                      </span>
                    </button>
                    </FileContextMenu> : null}
                    {selected?.path === file.path && projectDir ? (
                      <FileDiff key={`${projectDir}:${file.path}`} file={file} projectDir={projectDir} />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        </>}
        {/* Outside the view switch: an extension's panel is about the project,
            not about the Git changes, and used to vanish when the pane was
            switched to Files. */}
        <ExtensionPanels />
      </div>
      <CommitDialog projectDir={committing ? projectDir : null} onClose={() => setCommitting(false)} />
    </aside>
  );
}

function FileDiff({ file, projectDir }: { file: GitChangedFile; projectDir: string }) {
  // Staging part of a file leaves its `state` untouched, so neither this diff
  // nor the hunk list below it had any reason to re-read — and both went on
  // showing work that had already moved to the index.
  const [staged, setStaged] = useState(0);
  const { data, error, reload } = useRequest(
    () => rpc.request.gitDiff({ projectDir, file: file.path, untracked: file.state === "untracked" }),
    [projectDir, file.path, file.state, staged],
  );
  const patch = data ? data.diff.patch : null;

  return (
    <div className="border-t bg-background">
      {error ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-destructive">
          <span className="min-w-0 flex-1">Could not load this diff.</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 px-2 text-destructive hover:bg-destructive/15 hover:text-destructive"
            onClick={reload}
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : patch === null ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Loading diff…</p>
      ) : (
        <>
          {file.unstaged ? (
            <HunkActions projectDir={projectDir} file={file} staged={staged} onStaged={() => setStaged((n) => n + 1)} />
          ) : null}
          <DiffView patch={patch} />
        </>
      )}
    </div>
  );
}

function HunkActions({
  projectDir,
  file,
  staged,
  onStaged,
}: {
  projectDir: string;
  file: GitChangedFile;
  staged: number;
  onStaged: () => void;
}) {
  const refreshGit = useAppStore((s) => s.refreshGit);
  const { data, loading, error } = useRequest(
    () => rpc.request.gitHunks({ projectDir, file: file.path, untracked: file.state === "untracked" }),
    [projectDir, file.path, file.state, staged],
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  // Git refusing to apply a patch is the whole reason to be looking here; it
  // used to be dropped on the floor and the row simply did nothing.
  const [failure, setFailure] = useState<string | null>(null);
  if (loading) return null;
  if (error || !data) {
    return (
      <p className="border-b px-3 py-2 text-xs text-muted-foreground">
        NativePi could not read this file's hunks, so staging is unavailable here.
      </p>
    );
  }
  async function stage(patch: string, index: number) {
    setBusy(index);
    setFailure(null);
    const result = await rpc.request.gitStageHunk({ projectDir, file: file.path, untracked: file.state === "untracked", patch });
    setBusy(null);
    if (!result.ok) return setFailure(result.error ?? "Git could not stage this change.");
    await refreshGit();
    onStaged();
  }
  async function stageFile() {
    setBusy(-1);
    setFailure(null);
    const result = await rpc.request.gitStageFile({ projectDir, file: file.path });
    setBusy(null);
    if (!result.ok) return setFailure(result.error ?? "Git could not stage this file.");
    await refreshGit();
    onStaged();
  }
  return (
    <div className="border-b px-2 py-1.5">
      <Collapsible.Root open={partsOpen} onOpenChange={setPartsOpen}>
        <div className="flex items-center gap-1.5">
          <Button className="flex-1" disabled={busy !== null} onClick={() => void stageFile()} title="Add all changes in this file to your next commit">
            {busy === -1 ? "Staging…" : "Stage file"}
          </Button>
          {data.hunks.length > 1 ? (
            <Collapsible.Trigger className="group flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <CaretRightIcon className="transition-transform group-data-[panel-open]:rotate-90" />
              Select parts
            </Collapsible.Trigger>
          ) : null}
        </div>
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
      {failure ? (
        <p role="alert" className="mt-1.5 whitespace-pre-wrap px-1 text-xs text-destructive">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

function hunkLocation(header: string): string {
  const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(header);
  if (!match) return "";
  const start = Number(match[1]);
  const count = Number(match[2] ?? "1");
  return count > 1 ? `lines ${start}–${start + count - 1}` : `line ${start}`;
}

function stateBadge(state: GitChangedFile["state"]): string {
  return state === "added" ? "A" : state === "deleted" ? "D" : state === "renamed" ? "R" : state === "untracked" ? "U" : "M";
}
/** The badge letter's full word, for hover and assistive tech. */
function stateLabel(state: GitChangedFile["state"]): string {
  return state === "added"
    ? "Added"
    : state === "deleted"
      ? "Deleted"
      : state === "renamed"
        ? "Renamed"
        : state === "untracked"
          ? "Untracked"
          : "Modified";
}
function stateColor(state: GitChangedFile["state"]): string {
  if (state === "added") return "text-success";
  if (state === "deleted") return "text-destructive";
  if (state === "untracked") return "text-info";
  return "text-warning";
}
