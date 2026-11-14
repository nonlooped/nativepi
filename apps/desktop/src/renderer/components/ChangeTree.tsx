import { useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { MinusIcon } from "@phosphor-icons/react/Minus";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import type { GitChangedFile } from "../../shared/pi-types.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import FileContextMenu from "./FileContextMenu.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";

type Node = { path: string; label: string; files: GitChangedFile[]; children: Node[]; file?: GitChangedFile };
function tree(files: GitChangedFile[]): Node[] {
  const roots: Node[] = [];
  for (const file of files) {
    let siblings = roots;
    let path = "";
    const parts = file.path.split("/");
    for (let i = 0; i < parts.length; i++) {
      path = path ? `${path}/${parts[i]}` : parts[i]!;
      let node = siblings.find(node => node.path === path);
      if (!node) { node = { path, label: parts[i]!, files: [], children: [] }; siblings.push(node); }
      node.files.push(file);
      if (i === parts.length - 1) node.file = file;
      siblings = node.children;
    }
  }
  const sort = (nodes: Node[]): Node[] => nodes.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.label.localeCompare(b.label)).map(node => ({ ...node, children: sort(node.children) }));
  const compact = (nodes: Node[]): Node[] => nodes.map(node => {
    const children = compact(node.children);
    const child = children[0];
    return !node.file && children.length === 1 && child && !child.file
      ? { ...child, label: `${node.label}/${child.label}` }
      : { ...node, children };
  });
  return compact(sort(roots));
}
export default function ChangeTree({ projectDir, filtered, title, files, staged, selected, disabled, onSelect, onFiles, onAll, onRevert }: {
  projectDir: string; filtered: boolean; title: string; files: GitChangedFile[]; staged: boolean; selected: string | null; disabled: boolean;
  onSelect: (key: string) => void; onFiles: (files: GitChangedFile[]) => void; onAll: () => void; onRevert?: (file: GitChangedFile) => void;
}) {
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  if (!files.length) return null;
  const toggle = (path: string) => setCollapsed(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  const action = (targets: GitChangedFile[], all = false) => <Button variant="ghost" size="icon-xs" disabled={disabled} onClick={() => all && !filtered ? onAll() : onFiles(targets)} aria-label={all ? `${staged ? "Unstage" : "Stage"} all changes` : `${staged ? "Unstage" : "Stage"} ${targets.length === 1 ? targets[0]!.path : "folder changes"}`} title={staged ? "Unstage" : "Stage"}>{staged ? <MinusIcon /> : <PlusIcon />}</Button>;
  const rows = (nodes: Node[], depth = 0): React.ReactNode => nodes.map(node => {
    const key = `${staged ? "staged" : "changed"}:${node.path}`;
    const expanded = !collapsed.has(node.path);
    const row = <div className={cn("group flex h-8 items-center gap-1 rounded-md pr-2 hover:bg-sidebar-accent", selected === key && "bg-sidebar-accent")}>
        <button type="button" title={node.path} aria-current={selected === key ? "true" : undefined} aria-expanded={!node.file ? expanded : undefined}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pr-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ paddingLeft: 6 + depth * 12 }} onClick={() => node.file ? onSelect(key) : toggle(node.path)}>
          {node.file ? <span className="w-3" /> : expanded ? <CaretDownIcon className="shrink-0" /> : <CaretRightIcon className="shrink-0" />}
          <FileTypeIcon path={node.path} folder={!node.file} expanded={expanded} />
          <span className={cn("truncate", node.file?.state === "deleted" && "line-through text-muted-foreground")}>{node.label}</span>
        </button>
        <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100">
          {node.file && !staged && node.file.state !== "untracked" && onRevert && <Button size="icon-xs" variant="ghost" disabled={disabled} aria-label={`Revert ${node.path}`} onClick={() => onRevert(node.file!)}><ArrowCounterClockwiseIcon /></Button>}
          {action(node.files)}
        </span>
        {node.file ? <span className={cn("w-3 text-center text-xs", node.file.state === "deleted" ? "text-destructive" : node.file.state === "modified" ? "text-warning" : "text-success")}>{node.file.state === "untracked" ? "U" : node.file.state[0]!.toUpperCase()}</span> : <span className="text-xs tabular-nums text-muted-foreground">{node.files.length}</span>}
      </div>;
    return <li key={node.path}>
      {node.file ? <FileContextMenu projectDir={projectDir} file={node.path} staged={staged} untracked={node.file.state === "untracked"}>{row}</FileContextMenu> : row}
      {!node.file && expanded && <ul>{rows(node.children, depth + 1)}</ul>}
    </li>;
  });
  return <section className="px-2 py-1" aria-label={title}>
    <div className="flex items-center gap-1 pr-2"><button type="button" className="flex h-8 flex-1 items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <CaretDownIcon /> : <CaretRightIcon />}{title}<span className="font-normal tabular-nums">{files.length}</span></button>{action(files, true)}</div>
    {open && <ul>{rows(tree(files))}</ul>}
  </section>;
}
