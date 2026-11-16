import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { createKeybindingsHandler } from "tinykeys";
import { ChatCircleIcon } from "@phosphor-icons/react/ChatCircle";
import { GitDiffIcon } from "@phosphor-icons/react/GitDiff";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { XIcon } from "@phosphor-icons/react/X";
import { Button } from "./ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu.tsx";
import ConfirmDialog from "./ConfirmDialog.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";
import WorkspacePaneMenu from "./WorkspacePaneMenu.tsx";
import { usePaneStore } from "../lib/store.ts";
import { paneWorkspaceTabs, tabId, tabScope, type WorkspaceTab } from "../lib/workspaceTabs.ts";
import { useWorkspaceEditor } from "../lib/workspaceEditor.ts";
import { chatTitle } from "../lib/transcript.ts";
import { bindings, withHint } from "../lib/shortcuts.ts";
import { workspaceShortcutsBlocked } from "../lib/shortcutContext.ts";

export function useWorkspaceTabs() {
  const useAppStore = usePaneStore();
  const controller = paneWorkspaceTabs(useAppStore);
  const scope = useAppStore(tabScope);
  const strip = useStore(controller.state, s => s.scopes[scope]);
  return { controller, strip };
}
export default function WorkspaceTabs({ children }: { children: React.ReactNode }) {
  const useAppStore = usePaneStore();
  const { controller, strip } = useWorkspaceTabs();
  const buffers = useWorkspaceEditor(s => s.buffers);
  const sessions = useAppStore(s => s.sessionsByProject[s.activeProjectPath ?? ""]);
  const conversations = useAppStore(s => s.conversations);
  const overrides = useAppStore(s => s.keybindingOverrides);
  const error = useStore(controller.state, s => s.error);
  const scope = useAppStore(tabScope);
  const [closing, setClosing] = useState<{ tab: WorkspaceTab; scope: string }>();
  useEffect(() => setClosing(undefined), [scope]);
  const root = useRef<HTMLDivElement>(null);
  const tabs = strip?.tabs ?? [];
  const title = (tab: WorkspaceTab) => tab.kind === "file" ? tab.file.split(/[\\/]/).at(-1)! : tab.kind === "diff" ? `${tab.path.split(/[\\/]/).at(-1)} · ${tab.hash ? tab.hash.slice(0, 7) : tab.staged ? "Staged" : "Changes"}` : tab.session ? (() => { const session = sessions?.find(s => s.path === tab.session); return session ? chatTitle(session) : conversations[tab.session]?.sessionName || "Conversation"; })() : "New chat";
  const bufferFor = (tab: WorkspaceTab) => tab.kind === "file" ? Object.values(buffers).find(b => b.projectDir === useAppStore.getState().activeProjectPath && b.file === tab.file) : undefined;
  const close = (tab: WorkspaceTab) => { if (controller.needsDiscard(tab)) setClosing({ tab, scope }); else void controller.close(tab); };
  const select = (tab: WorkspaceTab) => void controller.activate(tab);
  const move = (offset: number, focus = false) => {
    if (!tabs.length) return;
    const index = tabs.findIndex(t => tabId(t) === strip?.active);
    const next = tabs[(index + offset + tabs.length) % tabs.length]!;
    select(next);
    if (focus) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  };
  useEffect(() => { root.current?.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [strip?.active, tabs.length]);
  return <div ref={root} className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDownCapture={event => {
    if (workspaceShortcutsBlocked() || event.nativeEvent.isComposing) return;
    createKeybindingsHandler(bindings({
      nextWorkspaceTab: e => { e.preventDefault(); e.stopPropagation(); move(1); },
      previousWorkspaceTab: e => { e.preventDefault(); e.stopPropagation(); move(-1); },
      closeWorkspaceTab: e => { e.preventDefault(); e.stopPropagation(); const tab = tabs.find(t => tabId(t) === strip?.active); if (tab) close(tab); },
    }, overrides), { ignore: e => e.repeat || e.isComposing })(event.nativeEvent);
  }}>
    <div className="flex h-10 min-w-0 shrink-0 items-center gap-1 border-b border-border/60 px-2 [[data-pane-active=true]_&]:bg-muted/30">
      <div role="tablist" aria-label="Workspace tabs" className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]" onWheel={event => { if (!event.deltaX) event.currentTarget.scrollLeft += event.deltaY; }} onKeyDown={event => {
        if (!event.target || !(event.target as HTMLElement).closest('[role="tab"]')) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1, true); }
        if (event.key === "Home" || event.key === "End") { event.preventDefault(); const tab = event.key === "Home" ? tabs[0] : tabs.at(-1); if (tab) { select(tab); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()); } }
      }}>
        {tabs.map(tab => {
          const id = tabId(tab), selected = strip?.active === id, buffer = bufferFor(tab), dirty = buffer && buffer.text !== buffer.saved;
          const label = title(tab);
          const detail = tab.kind === "file" ? tab.file : tab.kind === "diff" ? `${tab.path}\n${tab.hash ? `Commit ${tab.hash}` : tab.staged ? "Live staged changes" : "Live unstaged changes"}` : "Conversation";
          return <div key={id} className={`group/tab relative flex h-7 max-w-56 min-w-28 shrink-0 items-center rounded-md ${selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`} onPointerDown={event => { if (event.button === 1) event.preventDefault(); }} onAuxClick={event => { if (event.button === 1) close(tab); }}>
            <Button role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1} variant="ghost" size="sm" className="h-full min-w-0 flex-1 justify-start gap-2 rounded-md pr-8 pl-2 text-xs hover:bg-transparent" title={`${label}\n${detail}`} onClick={() => select(tab)}>
              {tab.kind === "file" ? <FileTypeIcon path={tab.file} /> : tab.kind === "diff" ? <GitDiffIcon /> : <ChatCircleIcon />}
              <span className="truncate">{label}</span>
              {dirty ? <span className="size-1.5 shrink-0 rounded-full bg-foreground/60" aria-label="Unsaved changes" /> : tab.kind === "thread" && tab.session && conversations[tab.session]?.running ? <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Running" /> : null}
            </Button>
            <Button variant="ghost" size="icon-xs" className={`absolute right-1 size-5 ${selected ? "" : "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"}`} title={withHint("Close tab", "closeWorkspaceTab", overrides)} aria-label={`Close ${label}`} disabled={buffer?.saving} onClick={() => close(tab)}><XIcon className="size-3" /></Button>
          </div>;
        })}
      </div>
      {tabs.length > 1 ? <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" title="All open tabs" aria-label="All open tabs" />}><CaretDownIcon /></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-h-80 w-72 overflow-auto">{tabs.map(tab => <DropdownMenuItem key={tabId(tab)} onClick={() => select(tab)}><span className="min-w-0 flex-1 truncate">{title(tab)}</span>{strip?.active === tabId(tab) ? <span className="text-xs text-muted-foreground">Active</span> : null}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu> : null}
      <WorkspacePaneMenu />
    </div>
    {error ? <div role="alert" className="flex items-center gap-2 border-b px-3 py-2 text-xs text-destructive"><span className="min-w-0 flex-1">{error}</span><Button variant="ghost" size="xs" onClick={() => { const tab = tabs.find(t => tabId(t) === strip?.active); if (tab) select(tab); }}>Try again</Button></div> : null}
    {children}
    <ConfirmDialog open={!!closing} title="Discard unsaved edits?" description="Your changes to this file will be discarded. Cancel to return and save them." detail={closing?.tab.kind === "file" ? closing.tab.file : undefined} confirmLabel="Discard edits" destructive onCancel={() => setClosing(undefined)} onConfirm={() => { if (closing && closing.scope === scope) void controller.close(closing.tab, true); setClosing(undefined); }} />
  </div>;
}
