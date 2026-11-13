import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { createExplorerDirectories, emptyExplorerDirectories } from "../lib/explorerDirectories.ts";
import FileTypeIcon from "./FileTypeIcon.tsx";
import { toast } from "sonner";
import { editorName } from "../lib/paths.ts";

type FileExplorerProps = { projectDir: string; renderHeader: (refresh: () => void) => ReactNode };

export default function FileExplorer({ projectDir, renderHeader }: FileExplorerProps) {
  return <ProjectFiles key={projectDir} projectDir={projectDir} renderHeader={renderHeader} />;
}

function ProjectFiles({ projectDir, renderHeader }: FileExplorerProps) {
  const [state, setState] = useState(emptyExplorerDirectories);
  const editorId = useAppStore(s => s.preferences.preferredEditorId);
  const controller = useRef<ReturnType<typeof createExplorerDirectories> | null>(null);
  useEffect(() => {
    const directories = createExplorerDirectories(path => rpc.request.readProjectDirectory({ projectDir, path }), setState);
    controller.current = directories;
    directories.start();
    const stop = rpc.events.on("projectFilesChanged", event => {
      if (event.projectDir === projectDir) void directories.refresh(event.path);
    });
    return () => { stop(); directories.dispose(); controller.current = null; };
  }, [projectDir]);
  const watched = JSON.stringify(state.visible);
  useEffect(() => {
    void rpc.request.watchProjectDirectories({ projectDir, paths: JSON.parse(watched) }).catch(() => {});
  }, [projectDir, watched]);
  useEffect(() => () => {
    void rpc.request.watchProjectDirectories({ projectDir, paths: [] }).catch(() => {});
  }, [projectDir]);

  async function openFile(file: string) {
    try {
      const result = await rpc.request.openFileIn({ projectDir, file, editorId });
      if (!result.ok) throw new Error(result.error ?? "Could not open this file.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  function directory(path: string, depth: number): React.ReactNode {
    const value = state.dirs.get(path);
    if (!value || value.status === "loading") return <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>;
    if (value.status === "error") return <div className="px-3 py-2 text-xs" role="alert"><p className="break-words text-destructive">{value.message}</p><Button size="sm" variant="ghost" onClick={() => void controller.current?.refresh(path)}>Try again</Button></div>;
    if (!value.entries.length) return <p className="px-3 py-2 text-xs text-muted-foreground">Empty folder</p>;
    return <ul className={cn(depth > 0 && "ml-3 border-l border-sidebar-border pl-1")}>
      {value.entries.map(entry => {
        const folder = entry.kind === "dir";
        const open = state.expanded.has(entry.path);
        return <li key={entry.path}>
          <button type="button" aria-expanded={folder ? open : undefined} title={folder ? entry.path : `Open ${entry.path} in ${editorName(editorId)}`}
            className="flex min-h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
            onClick={() => folder ? controller.current?.toggle(entry.path) : void openFile(entry.path)}>
            <CaretRightIcon aria-hidden className={cn("size-3 shrink-0 text-muted-foreground", !folder && "invisible", open && "rotate-90")} />
            {folder ? <FolderIcon weight={open ? "fill" : "duotone"} className="size-4 shrink-0 text-sidebar-foreground/75" /> : <FileTypeIcon path={entry.path} size={18} />}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          </button>
          {folder && open && directory(entry.path, depth + 1)}
        </li>;
      })}
    </ul>;
  }

  return <section className="flex min-h-0 flex-1 flex-col" aria-label="Project files">
    {renderHeader(() => state.visible.forEach(path => void controller.current?.refresh(path)))}
    <div className="min-h-0 flex-1 overflow-auto px-2 pt-2 pb-3">{directory("", 0)}</div>
  </section>;
}
