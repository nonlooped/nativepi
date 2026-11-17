import { createKeybindingsHandler } from "tinykeys";
import { bindings, hintFor, withHint } from "../lib/shortcuts.ts";
import { workspaceShortcutsBlocked } from "../lib/shortcutContext.ts";
import { useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowDownIcon } from "@phosphor-icons/react/ArrowDown";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XIcon } from "@phosphor-icons/react/X";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "./ui/dropdown-menu.tsx";
import ConfirmDialog from "./ConfirmDialog.tsx";
import CodeEditor from "./CodeEditor.tsx";
import Markdown from "./Markdown.tsx";
import { WorkspacePaneActions } from "./WorkspacePaneMenu.tsx";
import { useWorkspacePanes } from "../lib/workspacePanes.ts";
import { useWorkspaceEditor } from "../lib/workspaceEditor.ts";
import { isRemote, rpc } from "../lib/rpc.ts";
import { runtime } from "../lib/store/internals.ts";
import { useAppStore, usePaneStore } from "../lib/store.ts";
import { toast } from "sonner";

export default function WorkspaceEditor({ projectDir }: { projectDir: string }) {
  const panes = useWorkspacePanes();
  const overrides = useAppStore(s => s.keybindingOverrides);
  const paneId = runtime(usePaneStore().getState).paneId;
  const selectionKey = `${paneId}:${projectDir}`;
  const buffers = useWorkspaceEditor(s => s.buffers);
  const key = useWorkspaceEditor(s => s.selected[selectionKey]);
  const buffer = key ? buffers[key] : undefined;
  const editorId = useAppStore(s => s.preferences.preferredEditorId);
  const [preview, setPreview] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [searchMode, setSearchMode] = useState<"find" | "line" | null>(null);
  const [query, setQuery] = useState("");
  const view = useRef<EditorView | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!key) return;
    const refresh = () => void useWorkspaceEditor.getState().refresh(key);
    refresh();
    const timer = setInterval(refresh, 2000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [key]);
  useEffect(() => { setPreview(false); setSearchMode(null); setQuery(""); }, [key]);
  useEffect(() => { if (searchMode) searchInput.current?.focus(); }, [searchMode]);
  if (!buffer || !key) return null;
  const dirty = buffer.text !== buffer.saved;
  const markdown = /\.(md|markdown|mdx)$/i.test(buffer.file);
  const reload = () => {
    if (dirty) setConfirmation(true);
    else void useWorkspaceEditor.getState().refresh(key, true);
  };
  const save = () => void useWorkspaceEditor.getState().save(key).then(ok => { if (ok) window.dispatchEvent(new CustomEvent("workspace-file-saved", { detail: projectDir })); });
  const search = () => {
    const editor = view.current;
    if (!editor || !query) return;
    let from: number, to: number;
    if (searchMode === "line") {
      const number = Number(query);
      if (!Number.isInteger(number) || number < 1) return;
      from = editor.state.doc.line(Math.min(number, editor.state.doc.lines)).from; to = from;
    } else {
      const text = editor.state.doc.toString().toLowerCase();
      from = text.indexOf(query.toLowerCase(), editor.state.selection.main.to);
      if (from < 0) from = text.indexOf(query.toLowerCase());
      if (from < 0) return;
      to = from + query.length;
    }
    editor.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
    editor.focus();
  };
  return <section className="flex min-h-0 flex-1 flex-col bg-background" aria-label={`Editor: ${buffer.file}`} onKeyDownCapture={e => {
    if (workspaceShortcutsBlocked()) return;
    createKeybindingsHandler(bindings({
      saveFile: event => { event.preventDefault(); event.stopPropagation(); if (!buffer.saving && !buffer.conflict && dirty) save(); },
      findInFile: event => { event.preventDefault(); event.stopPropagation(); setPreview(false); setSearchMode("find"); requestAnimationFrame(() => searchInput.current?.focus()); },
      goToLine: event => { event.preventDefault(); event.stopPropagation(); setPreview(false); setSearchMode("line"); },
    }, overrides), { ignore: () => false })(e.nativeEvent);
  }}>
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 px-2 [[data-pane-active=true]_&]:bg-muted/30">
      <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground" title={buffer.file}>{buffer.file}</span>
      <span className="shrink-0 text-xs text-muted-foreground" role="status">{buffer.saving ? "Saving…" : buffer.conflict ? "Conflict" : dirty ? "Unsaved" : "Saved"}</span>
      <Button size="icon-sm" variant="ghost" title={withHint("Save file", "saveFile", overrides)} aria-label="Save file" disabled={buffer.saving || !dirty || buffer.conflict} onClick={save}><FloppyDiskIcon /></Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="File actions" title="File actions" />}><DotsThreeIcon /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {markdown ? <DropdownMenuItem onClick={() => setPreview(!preview)}>{preview ? "Edit Markdown" : "Preview Markdown"}</DropdownMenuItem> : null}
          <DropdownMenuItem onClick={() => { setPreview(false); setSearchMode("find"); }}><MagnifyingGlassIcon />Find in file<span className="ml-auto text-xs text-muted-foreground">{hintFor("findInFile", overrides)}</span></DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setPreview(false); setSearchMode("line"); }}>Go to line<span className="ml-auto text-xs text-muted-foreground">{hintFor("goToLine", overrides)}</span></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={preview} onClick={() => { if (view.current) undo(view.current); }}>Undo</DropdownMenuItem>
          <DropdownMenuItem disabled={preview} onClick={() => { if (view.current) redo(view.current); }}>Redo</DropdownMenuItem>
          <DropdownMenuItem disabled={buffer.saving} onClick={() => reload()}><ArrowClockwiseIcon />Reload from disk</DropdownMenuItem>
          {!isRemote ? <DropdownMenuItem onClick={() => void rpc.request.openFileIn({ projectDir, file: buffer.file, editorId }).then(result => { if (!result.ok) toast.error(result.error); })}><ArrowSquareOutIcon />Open in external editor</DropdownMenuItem> : null}
          {panes && panes.count > 1 ? <><DropdownMenuSeparator /><DropdownMenuSub><DropdownMenuSubTrigger>Pane</DropdownMenuSubTrigger><DropdownMenuSubContent><WorkspacePaneActions /></DropdownMenuSubContent></DropdownMenuSub></> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    {searchMode ? <div className="flex shrink-0 items-center gap-1 border-b border-border/40 px-3 py-2" onKeyDown={e => { if (e.key === "Escape") { setSearchMode(null); view.current?.focus(); } }}>
      <Input ref={searchInput} aria-label={searchMode === "find" ? "Find in file" : "Go to line"} placeholder={searchMode === "find" ? "Find in file…" : "Line number…"} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") search(); }} className="h-8 min-w-0 flex-1" />
      <Button size="icon-sm" variant="ghost" title={searchMode === "find" ? "Find next" : "Go to line"} aria-label={searchMode === "find" ? "Find next" : "Go to line"} onClick={search}><ArrowDownIcon /></Button>
      <Button size="icon-sm" variant="ghost" aria-label="Close search" onClick={() => { setSearchMode(null); view.current?.focus(); }}><XIcon /></Button>
    </div> : null}
    {buffer.error ? <div role="alert" className="flex shrink-0 items-center gap-2 bg-warning/10 px-3 py-2 text-xs text-warning"><WarningCircleIcon className="shrink-0" /><p className="min-w-0 flex-1" title={buffer.error}>{buffer.conflict ? "Changed on disk. Your edits are kept." : buffer.error}</p><Button size="xs" variant="ghost" disabled={buffer.saving} onClick={() => buffer.conflict ? reload() : save()}>{buffer.conflict ? "Reload" : "Retry"}</Button></div> : null}
    {preview ? <div className="min-h-0 flex-1 overflow-auto px-6 py-5"><Markdown>{buffer.text}</Markdown></div> : null}
    <div className={preview ? "hidden" : "flex min-h-0 flex-1"}><CodeEditor key={key} file={buffer.file} documentId={`${key}:${paneId}`} value={buffer.text} line={buffer.line} column={buffer.column} jumpRequest={buffer.jumpRequest} onChange={text => useWorkspaceEditor.getState().edit(key, text)} onView={editor => { view.current = editor; }} /></div>
    <ConfirmDialog open={confirmation} title="Discard unsaved edits?" description="Your changes to this file will be discarded. Cancel to return and save them." detail={buffer.file} confirmLabel="Discard edits" destructive onCancel={() => setConfirmation(false)} onConfirm={() => { void useWorkspaceEditor.getState().refresh(key, true); setConfirmation(false); }} />
  </section>;
}
