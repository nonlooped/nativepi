import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { createExplorerDirectories, emptyExplorerDirectories } from "../lib/explorerDirectories.ts";
import FileTypeIcon from "./FileTypeIcon.tsx";
import { toast } from "sonner";
import { editorName } from "../lib/paths.ts";

type FileExplorerProps = { projectDir: string; renderHeader: (actions: { refresh: () => void; collapse: () => void; search: () => void; searching: boolean }) => ReactNode };

export default function FileExplorer({ projectDir, renderHeader }: FileExplorerProps) {
  return <ProjectFiles key={projectDir} projectDir={projectDir} renderHeader={renderHeader} />;
}

function ProjectFiles({ projectDir, renderHeader }: FileExplorerProps) {
  const [state, setState] = useState(emptyExplorerDirectories);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [searchRefresh, setSearchRefresh] = useState(0);
  const [files, setFiles] = useState<string[] | null>(null);
  const [searchError, setSearchError] = useState<string>();
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    setFiles(null);
    setSearchError(undefined);
    void rpc.request.listProjectFiles({ projectDir }).then(
      result => { if (!cancelled) setFiles(result.files); },
      () => { if (!cancelled) setSearchError("Could not search project files. Close and reopen search to retry."); },
    );
    return () => { cancelled = true; };
  }, [projectDir, searching, searchRefresh]);
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
            className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground/85 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
            onClick={() => folder ? controller.current?.toggle(entry.path) : void openFile(entry.path)}>
            <CaretRightIcon aria-hidden className={cn("size-3 shrink-0 text-muted-foreground", !folder && "invisible", open && "rotate-90")} />
            <FileTypeIcon path={entry.path} size={18} folder={folder} expanded={open} />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          </button>
          {folder && open && directory(entry.path, depth + 1)}
        </li>;
      })}
    </ul>;
  }

  const matches = files?.filter(file => file.toLowerCase().includes(query.toLowerCase())) ?? [];

  return <section className="flex min-h-0 flex-1 flex-col" aria-label="Project files">
    {renderHeader({
      refresh: () => {
        state.visible.forEach(path => void controller.current?.refresh(path));
        if (searching) setSearchRefresh(value => value + 1);
      },
      collapse: () => controller.current?.collapseAll(),
      search: () => { setSearching(value => !value); setQuery(""); },
      searching,
    })}
    {searching ? <div className="px-3 pt-2"><Input autoFocus aria-label="Search project files" placeholder="Search files…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setSearching(false); setQuery(""); } }} /></div> : null}
    <div className="min-h-0 flex-1 overflow-auto px-1 pt-2 pb-3">
      {searching ? searchError ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{searchError}</p>
        : files === null ? <p className="px-3 py-2 text-xs">Searching files…</p>
        : <>
          {matches.slice(0, 200).map(file => (
            <button key={file} type="button" title={file} onClick={() => void openFile(file)} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground/85 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset">
              <FileTypeIcon path={file} size={18} /><span className="min-w-0 truncate">{file}</span>
            </button>
          ))}
          {matches.length > 200 ? <p className="px-3 py-2 text-xs">Showing the first 200 matches. Refine your search to see more.</p> : null}
          {!matches.length ? <p className="px-3 py-2 text-xs">No matching files.</p> : null}
        </> : directory("", 0)}
    </div>
  </section>;
}
