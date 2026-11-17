import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "zustand";
import { createKeybindingsHandler } from "tinykeys";
import { ChatCircleIcon } from "@phosphor-icons/react/ChatCircle";
import { GitDiffIcon } from "@phosphor-icons/react/GitDiff";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { XIcon } from "@phosphor-icons/react/X";
import { Button } from "./ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./ui/dropdown-menu.tsx";
import ConfirmDialog from "./ConfirmDialog.tsx";
import FileTypeIcon from "./FileTypeIcon.tsx";
import WorkspacePaneMenu from "./WorkspacePaneMenu.tsx";
import { usePaneStore } from "../lib/store.ts";
import { paneWorkspaceTabs, tabId, tabScope, type WorkspaceTab } from "../lib/workspaceTabs.ts";
import { useWorkspaceEditor } from "../lib/workspaceEditor.ts";
import { chatTitle } from "../lib/transcript.ts";
import { bindings, withHint } from "../lib/shortcuts.ts";
import { cn, NO_DRAG_REGION } from "../lib/utils.ts";
import { workspaceShortcutsBlocked } from "../lib/shortcutContext.ts";

export const WorkspaceTabHostContext = createContext<{ integrated: boolean; element: HTMLElement | null } | null>(null);

export function useWorkspaceTabs() {
  const useAppStore = usePaneStore();
  const controller = paneWorkspaceTabs(useAppStore);
  const scope = useAppStore(tabScope);
  const strip = useStore(controller.state, s => s.scopes[scope]);
  return { controller, strip };
}
export default function WorkspaceTabs({ children, onNew }: { children: React.ReactNode; onNew?: () => void }) {
  const useAppStore = usePaneStore();
  const { controller, strip } = useWorkspaceTabs();
  const buffers = useWorkspaceEditor(s => s.buffers);
  const sessions = useAppStore(s => s.sessionsByProject);
  const conversations = useAppStore(s => s.conversations);
  const overrides = useAppStore(s => s.keybindingOverrides);
  const error = useStore(controller.state, s => s.error);
  const scope = useAppStore(tabScope);
  const projects = useAppStore(s => s.projects);
  const workRoot = useAppStore(s => s.workRoot);
  const chatRoot = useAppStore(s => s.chatRoot);
  const [closing, setClosing] = useState<{ tab: WorkspaceTab; scope: string }>();
  useEffect(() => setClosing(undefined), [scope]);
  const host = useContext(WorkspaceTabHostContext);
  const bar = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const currentProject = useAppStore(s => s.activeProjectPath);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => setAvailableWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [host?.element]);
  const tabs = strip?.tabs ?? [];
  const capacity = availableWidth ? Math.max(1, Math.floor(availableWidth / 144)) : tabs.length;
  const activeIndex = tabs.findIndex(tab => tabId(tab) === strip?.active);
  const visibleTabs = tabs.filter((tab, index) => index < capacity - (activeIndex >= capacity ? 1 : 0) || tabId(tab) === strip?.active);
  const overflow = visibleTabs.length < tabs.length;
  const groups: { projectDir: string; tabs: WorkspaceTab[] }[] = [];
  for (const tab of tabs) {
    const previous = groups.at(-1);
    if (previous?.projectDir === tab.projectDir) previous.tabs.push(tab);
    else groups.push({ projectDir: tab.projectDir, tabs: [tab] });
  }
  const mixedProjects = new Set(tabs.map(tab => tab.projectDir)).size > 1;
  const projectName = (tab: WorkspaceTab) => tab.projectDir === workRoot ? "No project" : tab.projectDir === chatRoot ? "Chat" : projects.find(p => p.path === tab.projectDir)?.name ?? tab.projectDir.split(/[\\/]/).filter(Boolean).at(-1) ?? tab.projectDir;
  const title = (tab: WorkspaceTab) => tab.kind === "file" ? tab.file.split(/[\\/]/).at(-1)! : tab.kind === "diff" ? `${tab.path.split(/[\\/]/).at(-1)} · ${tab.hash ? tab.hash.slice(0, 7) : tab.staged ? "Staged" : "Changes"}` : tab.session ? (() => { const session = sessions[tab.projectDir]?.find(s => s.path === tab.session); return session ? chatTitle(session) : conversations[tab.session]?.sessionName || "Conversation"; })() : "New chat";
  const bufferFor = (tab: WorkspaceTab) => tab.kind === "file" ? Object.values(buffers).find(b => b.projectDir === tab.projectDir && b.file === tab.file) : undefined;
  const close = (tab: WorkspaceTab) => { if (controller.needsDiscard(tab)) setClosing({ tab, scope }); else void controller.close(tab); };
  const select = (tab: WorkspaceTab) => void controller.activate(tab);
  const move = (offset: number, focus = false) => {
    if (!tabs.length) return;
    const index = tabs.findIndex(t => tabId(t) === strip?.active);
    const next = tabs[(index + offset + tabs.length) % tabs.length]!;
    select(next);
    if (focus) requestAnimationFrame(() => bar.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  };
  const tabBar = <div ref={bar} className={cn(NO_DRAG_REGION, "flex min-w-0 shrink-0 items-center gap-1", host?.integrated ? "h-full flex-1" : "h-12 border-b border-border/60 px-2 [[data-pane-active=true]_&]:bg-muted/30")}>
    <div ref={list} role="tablist" aria-label="Workspace tabs" className="flex min-w-0 flex-1 items-center gap-1" style={{ maxWidth: `${tabs.length * 14}rem` }} onKeyDown={event => {
      if (!(event.target as HTMLElement).closest('[role="tab"]')) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1, true); }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault(); const tab = event.key === "Home" ? tabs[0] : tabs.at(-1);
        if (tab) { select(tab); requestAnimationFrame(() => bar.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()); }
      }
    }}>
      {visibleTabs.map(tab => {
        const id = tabId(tab), selected = strip?.active === id, buffer = bufferFor(tab), dirty = buffer && buffer.text !== buffer.saved;
        const label = title(tab);
        const context = selected || (mixedProjects && tab.projectDir !== currentProject) ? projectName(tab) : undefined;
        const detail = tab.kind === "file" ? tab.file : tab.kind === "diff" ? `${tab.path}\n${tab.hash ? `Commit ${tab.hash}` : tab.staged ? "Live staged changes" : "Live unstaged changes"}` : "Conversation";
        return <div key={id} className="group/tab relative min-w-0 max-w-56 flex-1" onPointerDown={event => { if (event.button === 1) event.preventDefault(); }} onAuxClick={event => { if (event.button === 1) close(tab); }}>
          <Button role="tab" aria-label={label} aria-selected={selected} tabIndex={selected ? 0 : -1} variant={selected ? "secondary" : "ghost"} className="h-10 w-full min-w-0 justify-start gap-2 pr-8 pl-2.5 text-left" title={`${label}\n${projectName(tab)}\n${detail}`} onClick={() => select(tab)}>
            {tab.kind === "file" ? <FileTypeIcon path={tab.file} /> : tab.kind === "diff" ? <GitDiffIcon className="size-4" /> : <ChatCircleIcon className="size-4" />}
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm leading-5", selected && "font-medium")}>{label}</span>
              <span className="block h-4 truncate text-xs leading-4 font-normal text-muted-foreground">{context}</span>
            </span>
            {dirty ? <span className="size-1.5 shrink-0 rounded-full bg-foreground/60" aria-label="Unsaved changes" /> : tab.kind === "thread" && tab.session && conversations[tab.session]?.running ? <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Running" /> : null}
          </Button>
          <Button variant="ghost" size="icon-xs" className={cn("absolute top-1/2 right-1 -translate-y-1/2", !selected && "opacity-0 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100 [@media(hover:none)]:opacity-100")} title={withHint("Close tab", "closeWorkspaceTab", overrides)} aria-label={`Close ${label}`} disabled={buffer?.saving} onClick={() => close(tab)}><XIcon className="size-3" /></Button>
        </div>;
      })}
    </div>
    {overflow ? <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" title="All open tabs" aria-label="All open tabs" />}><CaretDownIcon /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-auto">
        <DropdownMenuRadioGroup value={strip?.active ?? ""} onValueChange={id => { const tab = tabs.find(tab => tabId(tab) === id); if (tab) select(tab); }}>
          {groups.map((group, index) => <DropdownMenuGroup key={index}>
            {mixedProjects ? <DropdownMenuLabel>{projectName(group.tabs[0]!)}</DropdownMenuLabel> : null}
            {group.tabs.map(tab => <DropdownMenuRadioItem key={tabId(tab)} value={tabId(tab)} title={`${title(tab)}\n${tab.kind === "file" ? tab.file : tab.projectDir}`}>
              {tab.kind === "file" ? <FileTypeIcon path={tab.file} /> : tab.kind === "diff" ? <GitDiffIcon /> : <ChatCircleIcon />}
              <span className="min-w-0 flex-1 line-clamp-2 whitespace-normal break-words text-left leading-5">{title(tab)}</span>
            </DropdownMenuRadioItem>)}
          </DropdownMenuGroup>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu> : null}
    {onNew ? <Button variant="ghost" size="icon-sm" title="New tab" aria-label="New tab" onClick={onNew}><PlusIcon /></Button> : null}
    <WorkspacePaneMenu />
  </div>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDownCapture={event => {
    if (workspaceShortcutsBlocked() || event.nativeEvent.isComposing) return;
    createKeybindingsHandler(bindings({
      nextWorkspaceTab: e => { e.preventDefault(); e.stopPropagation(); move(1); },
      previousWorkspaceTab: e => { e.preventDefault(); e.stopPropagation(); move(-1); },
      closeWorkspaceTab: e => { e.preventDefault(); e.stopPropagation(); const tab = tabs.find(t => tabId(t) === strip?.active); if (tab) close(tab); },
    }, overrides), { ignore: e => e.repeat || e.isComposing })(event.nativeEvent);
  }}>
    {host?.integrated ? host.element ? createPortal(tabBar, host.element) : null : tabBar}
    {error ? <div role="alert" className="flex items-center gap-2 border-b px-3 py-2 text-xs text-destructive"><span className="min-w-0 flex-1">{error}</span><Button variant="ghost" size="xs" onClick={() => { const tab = tabs.find(t => tabId(t) === strip?.active); if (tab) select(tab); }}>Try again</Button></div> : null}
    {children}
    <ConfirmDialog open={!!closing} title="Discard unsaved edits?" description="Your changes to this file will be discarded. Cancel to return and save them." detail={closing?.tab.kind === "file" ? `${projectName(closing.tab)} / ${closing.tab.file}` : undefined} confirmLabel="Discard edits" destructive onCancel={() => setClosing(undefined)} onConfirm={() => { if (closing && closing.scope === scope) void controller.close(closing.tab, true); setClosing(undefined); }} />
  </div>;
}
