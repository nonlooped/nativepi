import { useEffect, useState } from "react";
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

  useEffect(() => setSelected(null), [projectDir]);

  return (
    <aside className="context-pane flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-12 shrink-0 items-center gap-1 pr-2 pl-3", !overlay && WINDOW_CONTROLS_CLEARANCE)}>
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Changes</span>
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
                <span className="ml-auto tabular-nums">{git.files.length} changed</span>
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

            {git.files.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">Working tree clean.</p>
            ) : (
              <div className="flex flex-col gap-1 px-2 pb-2">
                {git.files.map((file) => (
                  <div key={file.path} className="overflow-hidden rounded-md border bg-background/35">
                    {projectDir ? <FileContextMenu projectDir={projectDir} file={file.path} untracked={file.state === "untracked"}>
                    <button
                      type="button"
                      aria-expanded={selected?.path === file.path}
                      onClick={() => setSelected(selected?.path === file.path ? null : file)}
                      className={cn(
                        "flex min-h-10 w-full items-center gap-2 px-2.5 text-left text-xs outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                        selected?.path === file.path && "bg-sidebar-accent",
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

        <ExtensionPanels />
      </div>
      <CommitDialog projectDir={committing ? projectDir : null} onClose={() => setCommitting(false)} />
    </aside>
  );
}

function FileDiff({ file, projectDir }: { file: GitChangedFile; projectDir: string }) {
  const { data, error, reload } = useRequest(
    () => rpc.request.gitDiff({ projectDir, file: file.path, untracked: file.state === "untracked" }),
    [projectDir, file.path, file.state],
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
          {file.unstaged ? <HunkActions projectDir={projectDir} file={file} /> : null}
          <DiffView patch={patch} />
        </>
      )}
    </div>
  );
}

function HunkActions({ projectDir, file }: { projectDir: string; file: GitChangedFile }) {
  const refreshGit = useAppStore((s) => s.refreshGit);
  const { data, loading, error } = useRequest(
    () => rpc.request.gitHunks({ projectDir, file: file.path, untracked: file.state === "untracked" }),
    [projectDir, file.path, file.state],
  );
  const [busy, setBusy] = useState<number | null>(null);
  if (loading || error || !data) return null;
  async function stage(patch: string, index: number) {
    setBusy(index);
    const result = await rpc.request.gitStageHunk({ projectDir, file: file.path, untracked: file.state === "untracked", patch });
    setBusy(null);
    if (result.ok) await refreshGit();
  }
  async function stageFile() {
    setBusy(-1);
    const result = await rpc.request.gitStageFile({ projectDir, file: file.path });
    setBusy(null);
    if (result.ok) await refreshGit();
  }
  return (
    <div className="flex flex-col gap-1 border-b px-2 py-2">
      {data.hunks.length === 0 ? (
        <Button size="sm" variant="ghost" className="justify-start" disabled={busy !== null} onClick={() => void stageFile()}>
          {busy === -1 ? "Staging…" : "Stage file"}
        </Button>
      ) : data.hunks.map((hunk, index) => (
        <Button key={hunk.patch} size="sm" variant="ghost" className="justify-start" disabled={busy !== null} onClick={() => void stage(hunk.patch, index)}>
          {busy === index ? "Staging…" : `Stage hunk ${index + 1}`}
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{hunk.header}</span>
        </Button>
      ))}
    </div>
  );
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
