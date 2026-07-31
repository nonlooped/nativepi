import { useMemo, useState, type ReactElement } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ClockCounterClockwise";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import type { GitChangedFile, RecentFile } from "../../shared/pi-types.ts";
import { gitStateBadge, gitStateColor, gitStateLabel } from "../lib/gitFileState.ts";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import FileContextMenu from "./FileContextMenu.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";

interface TreeDir {
  kind: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}
interface TreeFile {
  kind: "file";
  name: string;
  path: string;
}
type TreeNode = TreeDir | TreeFile;

function buildTree(files: string[]): TreeDir {
  const root: TreeDir = { kind: "dir", name: "", path: "", children: [] };
  for (const file of files) {
    const parts = file.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i] as string;
      const path = parts.slice(0, i + 1).join("/");
      let next = dir.children.find((c): c is TreeDir => c.kind === "dir" && c.name === segment);
      if (!next) {
        next = { kind: "dir", name: segment, path, children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ kind: "file", name: parts[parts.length - 1] as string, path: file });
  }
  sortTree(root);
  return root;
}

function sortTree(dir: TreeDir): void {
  dir.children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
  for (const child of dir.children) if (child.kind === "dir") sortTree(child);
}

const ROW_CLASS =
  "flex min-h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-xs outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset";

function GitBadge({ file, gitByPath }: { file: string; gitByPath: Map<string, GitChangedFile> }) {
  const state = gitByPath.get(file);
  if (!state) return null;
  return (
    <span
      className={cn("w-4 shrink-0 text-center font-mono text-xs font-semibold", gitStateColor(state.state))}
      title={gitStateLabel(state.state)}
    >
      <span aria-hidden="true">{gitStateBadge(state.state)}</span>
      <span className="sr-only">{gitStateLabel(state.state)}</span>
    </span>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  gitByPath,
  projectDir,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  gitByPath: Map<string, GitChangedFile>;
  projectDir: string;
}) {
  if (node.kind === "dir") {
    const isOpen = expanded.has(node.path);
    return (
      <div>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => onToggle(node.path)}
          className={ROW_CLASS}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          {isOpen ? (
            <CaretDownIcon className="shrink-0 text-muted-foreground" />
          ) : (
            <CaretRightIcon className="shrink-0 text-muted-foreground" />
          )}
          {isOpen ? (
            <FolderOpenIcon className="shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
        </button>
        {isOpen
          ? node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                gitByPath={gitByPath}
                projectDir={projectDir}
              />
            ))
          : null}
      </div>
    );
  }

  const state = gitByPath.get(node.path);
  return (
    <FileContextMenu projectDir={projectDir} file={node.path} untracked={state?.state === "untracked"}>
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={ROW_CLASS}
        style={{ paddingLeft: `${depth * 14 + 22}px` }}
        title={node.path}
      >
        <FileTypeIcon path={node.path} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <GitBadge file={node.path} gitByPath={gitByPath} />
      </button>
    </FileContextMenu>
  );
}

function QuickList({
  icon,
  label,
  entries,
  onSelect,
  gitByPath,
  projectDir,
}: {
  icon: ReactElement;
  label: string;
  entries: RecentFile[];
  onSelect: (path: string) => void;
  gitByPath: Map<string, GitChangedFile>;
  projectDir: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {icon}
        <span>{label}</span>
      </div>
      {entries.map((entry) => {
        const state = gitByPath.get(entry.path);
        return (
          <FileContextMenu key={entry.path} projectDir={projectDir} file={entry.path} untracked={state?.state === "untracked"}>
            <button type="button" onClick={() => onSelect(entry.path)} className={ROW_CLASS} title={entry.path}>
              <FileTypeIcon path={entry.path} />
              <span className="min-w-0 flex-1 truncate">{entry.path}</span>
              <GitBadge file={entry.path} gitByPath={gitByPath} />
            </button>
          </FileContextMenu>
        );
      })}
    </div>
  );
}

export default function FileTree({ projectDir, onSelect }: { projectDir: string; onSelect: (path: string) => void }) {
  const git = useAppStore((s) => s.git);
  const refreshGit = useAppStore((s) => s.refreshGit);
  const recent = useAppStore((s) => s.recentFilesByProject[projectDir] ?? []);
  const { data, error, reload } = useRequest(() => rpc.request.listExplorerFiles({ projectDir }), [projectDir, git]);
  const tree = useMemo(() => buildTree(data?.files ?? []), [data]);
  const gitByPath = useMemo(() => new Map((git?.files ?? []).map((f) => [f.path, f])), [git]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const recentTop = useMemo(() => [...recent].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 5), [recent]);
  const frequent = useMemo(
    () =>
      recent
        .filter((f) => f.openCount > 1)
        .sort((a, b) => b.openCount - a.openCount)
        .slice(0, 5),
    [recent],
  );

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-destructive">
        <span className="min-w-0 flex-1">Could not list project files.</span>
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
    );
  }

  if (!data) return <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>;

  if (data.files.length === 0) {
    return <p className="px-3 py-4 text-xs text-muted-foreground">This project has no files.</p>;
  }

  return (
    <div className="flex flex-col gap-2 px-2 pt-1 pb-2">
      <Button size="sm" variant="ghost" className="h-7 self-end px-2" onClick={() => { void refreshGit(); reload(); }}>
        <ArrowClockwiseIcon data-icon="inline-start" /> Refresh
      </Button>
      {recentTop.length > 0 ? (
        <QuickList
          icon={<ClockCounterClockwiseIcon />}
          label="Recent"
          entries={recentTop}
          onSelect={onSelect}
          gitByPath={gitByPath}
          projectDir={projectDir}
        />
      ) : null}
      {frequent.length > 0 ? (
        <QuickList
          icon={<ChartLineUpIcon />}
          label="Frequent"
          entries={frequent}
          onSelect={onSelect}
          gitByPath={gitByPath}
          projectDir={projectDir}
        />
      ) : null}
      <div className="flex flex-col">
        {tree.children.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
            onSelect={onSelect}
            gitByPath={gitByPath}
            projectDir={projectDir}
          />
        ))}
      </div>
    </div>
  );
}
