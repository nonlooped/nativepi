import { openWorkspaceFile } from "../lib/workspaceEditor.ts";
import { mediaKind } from "./TranscriptMedia.tsx";
import { Dialog, DialogViewerContent } from "./ui/dialog.tsx";
import StateNotice from "./StateNotice.tsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { rpc } from "../lib/rpc.ts";
import { runtime } from "../lib/store/internals.ts";
import { useAppStore, usePaneStore } from "../lib/store.ts";
import { createExplorerDirectories, emptyExplorerDirectories } from "../lib/explorerDirectories.ts";
import FileTypeIcon from "./FileTypeIcon.tsx";

type FileExplorerProps = { projectDir: string; renderHeader: (actions: { refresh: () => void; collapse: () => void; search: () => void; searching: boolean }) => ReactNode };

export default function FileExplorer({ projectDir, renderHeader }: FileExplorerProps) {
  return <ProjectFiles key={projectDir} projectDir={projectDir} renderHeader={renderHeader} />;
}

function ProjectFiles({ projectDir, renderHeader }: FileExplorerProps) {
  const paneId = runtime(usePaneStore().getState).paneId;
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [fileNotice, setFileNotice] = useState("");
  const [state, setState] = useState(emptyExplorerDirectories);
  const requestSearch = useAppStore(s => s.fileSearchRequest);
  useEffect(() => { if (requestSearch) setSearching(true); }, [requestSearch]);
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
    void rpc.request.watchProjectDirectories({ paneId, projectDir, paths: JSON.parse(watched) }).catch(() => {});
  }, [paneId, projectDir, watched]);
  useEffect(() => () => {
    void rpc.request.watchProjectDirectories({ paneId, projectDir, paths: [] }).catch(() => {});
  }, [paneId, projectDir]);

  async function openFile(file: string) {
    if (mediaKind(file)) { setFileNotice(""); setPreviewFile(file); return; }
    try { await openWorkspaceFile(projectDir, file); setFileNotice(""); }
    catch (error) { setFileNotice(error instanceof Error ? error.message : String(error)); }
  }

  function directory(path: string, depth: number): React.ReactNode {
    const value = state.dirs.get(path);
    if (!value || value.status === "loading") return <div className="px-3"><StateNotice loading title="Reading folder…" /></div>;
    if (value.status === "error") return <div className="px-3 py-2 text-xs" role="alert"><p className="break-words text-destructive">{value.message}</p><Button size="sm" variant="ghost" onClick={() => void controller.current?.refresh(path)}>Try again</Button></div>;
    if (!value.entries.length) return <p className="px-3 py-2 text-xs text-muted-foreground">Empty folder</p>;
    return <ul className={cn(depth > 0 && "ml-3 border-l border-sidebar-border pl-1")}>
      {value.entries.map(entry => {
        const folder = entry.kind === "dir";
        const open = state.expanded.has(entry.path);
        return <li key={entry.path}>
          <button type="button" aria-expanded={folder ? open : undefined} title={folder ? entry.path : `Open ${entry.path}`}
            className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
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
    {fileNotice ? <p role="status" className="break-words px-3 pt-2 text-xs text-muted-foreground">{fileNotice}</p> : null}
    {previewFile ? <BrowserMediaPreview key={previewFile} projectDir={projectDir} file={previewFile} onClose={() => setPreviewFile(null)} /> : null}
    {searching ? <div className="px-3 pt-2"><Input autoFocus aria-label="Search project files" placeholder="Search files…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setSearching(false); setQuery(""); } }} /></div> : null}
    <div className="min-h-0 flex-1 overflow-auto px-1 pt-2 pb-3">
      {searching ? searchError ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{searchError}</p>
        : files === null ? <div className="px-3"><StateNotice loading title="Searching files…" /></div>
        : <>
          {matches.slice(0, 200).map(file => (
            <button key={file} type="button" title={file} onClick={() => void openFile(file)} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset">
              <FileTypeIcon path={file} size={18} /><span className="min-w-0 truncate">{file}</span>
            </button>
          ))}
          {matches.length > 200 ? <p className="px-3 py-2 text-xs">Showing the first 200 matches. Refine your search to see more.</p> : null}
          {!matches.length ? <p className="px-3 py-2 text-xs">No matching files.</p> : null}
        </> : directory("", 0)}
    </div>
  </section>;
}

function BrowserMediaPreview({ projectDir, file, onClose }: { projectDir: string; file: string; onClose: () => void }) {
  const [result, setResult] = useState<{ src?: string; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  const kind = mediaKind(file);
  useEffect(() => {
    let current = true;
    setResult(undefined);
    void rpc.request.readProjectMedia({ projectDir, file }).then(
      value => { if (current) setResult(value.src ? value : { error: value.error ?? "No preview is available for this file." }); },
      () => { if (current) setResult({ error: "Media could not be loaded." }); },
    );
    return () => { current = false; };
  }, [projectDir, file, attempt]);
  const decodeError = () => setResult({ error: "This media format could not be displayed by your browser." });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogViewerContent title={file} description={`${kind} preview`}>
      {result?.error ? <StateNotice title="Could not preview this media" detail={result.error} retry={() => setAttempt(value => value + 1)} />
        : !result?.src ? <StateNotice loading title="Loading preview…" />
        : kind === "video" ? <video src={result.src} controls preload="metadata" onError={decodeError} className="max-h-[70dvh] w-full" />
        : kind === "audio" ? <audio src={result.src} controls preload="metadata" onError={decodeError} className="w-full" />
        : <img src={result.src} alt={file} onError={decodeError} className="max-h-[70dvh] w-full object-contain" />}
    </DialogViewerContent>
  </Dialog>;
}
