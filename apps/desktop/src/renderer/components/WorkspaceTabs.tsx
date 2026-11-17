import { createContext, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
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
import ProjectIcon from "./ProjectIcon.tsx";
import WorkspacePaneMenu from "./WorkspacePaneMenu.tsx";
import { focusedPaneStore, usePaneStore } from "../lib/store.ts";
import { paneWorkspaceTabs, tabId, tabScope, type WorkspaceTab } from "../lib/workspaceTabs.ts";
import { useWorkspaceEditor } from "../lib/workspaceEditor.ts";
import { chatTitle } from "../lib/transcript.ts";
import { bindings, withHint } from "../lib/shortcuts.ts";
import { cn, NO_DRAG_REGION } from "../lib/utils.ts";
import { workspaceShortcutsBlocked } from "../lib/shortcutContext.ts";
import type { SidebarProject } from "../lib/sidebarProjects.ts";

export const WorkspaceTabHostContext = createContext<{
  integrated: boolean;
  element: HTMLElement | null;
  projectPresentation: Record<string, SidebarProject>;
} | null>(null);

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
  const lane = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const currentProject = useAppStore(s => s.activeProjectPath);
  useLayoutEffect(() => {
    const element = lane.current;
    const stripElement = bar.current;
    if (!element || !stripElement) return;
    const root = document.documentElement;
    const measure = () => setAvailableWidth(element.clientWidth / (parseFloat(getComputedStyle(root).fontSize) || 16));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // The strip height changes with interface scale even if the lane width stays fixed.
    observer.observe(stripElement);
    return () => observer.disconnect();
  }, [host?.integrated, host?.element]);
  const tabs = strip?.tabs ?? [];
  // Count from the full lane so mounting the overflow button cannot change the threshold.
  const tabWidth = 11.125; // w-44 plus the gap, in rem
  const actionWidth = 2; // icon-sm plus the gap, in rem
  const tabSpace = availableWidth - (onNew ? actionWidth : 0);
  const needsOverflow = availableWidth > 0 && tabs.length > Math.max(1, Math.floor(tabSpace / tabWidth));
  const capacity = needsOverflow ? Math.max(1, Math.floor((tabSpace - actionWidth) / tabWidth)) : tabs.length;
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
  const icon = (tab: WorkspaceTab) => {
    if (tab.kind === "file") return <FileTypeIcon path={tab.file} />;
    if (tab.kind === "diff") return <GitDiffIcon className="size-4" />;
    if (tab.projectDir === workRoot || tab.projectDir === chatRoot) return <ChatCircleIcon className="size-4" />;
    return <ProjectIcon name={projectName(tab)} src={host?.projectPresentation[tab.projectDir]?.icon} className="size-4 leading-none" />;
  };
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
  const runShortcut = useEffectEvent((action: "new" | "next" | "previous" | "close", event: KeyboardEvent) => {
    if (useAppStore !== focusedPaneStore() || workspaceShortcutsBlocked()) return;
    const active = tabs[activeIndex];
    const run = {
      new: onNew,
      next: active && (() => move(1)),
      previous: active && (() => move(-1)),
      close: active && (() => close(active)),
    }[action];
    if (!run) return;
    event.preventDefault();
    event.stopPropagation();
    run();
  });
  useEffect(() => {
    // Capture before a focused editor or terminal handles the same keystroke.
    const handler = createKeybindingsHandler(bindings({
      newWorkspaceTab: event => runShortcut("new", event),
      nextWorkspaceTab: event => runShortcut("next", event),
      previousWorkspaceTab: event => runShortcut("previous", event),
      closeWorkspaceTab: event => runShortcut("close", event),
    }, overrides), { ignore: event => event.isComposing });
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [overrides]);
  const tabBar = <div ref={bar} className={cn("flex min-w-0 shrink-0 items-center gap-1", host?.integrated ? "h-full" : "h-10 border-b border-border/60 px-2 [[data-pane-active=true]_&]:bg-muted/30")}>
    <div ref={lane} className="flex min-w-0 flex-1 items-center gap-1">
      {tabs.length > 0 && <div role="tablist" aria-label="Workspace tabs" className={cn(NO_DRAG_REGION, "flex min-w-0 items-center gap-0.5")} onKeyDown={event => {
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
          const context = !selected && mixedProjects && tab.projectDir !== currentProject ? projectName(tab) : undefined;
          const detail = tab.kind === "file" ? tab.file : tab.kind === "diff" ? `${tab.path}\n${tab.hash ? `Commit ${tab.hash}` : tab.staged ? "Live staged changes" : "Live unstaged changes"}` : "Conversation";
          return <div key={id} className="group/tab relative w-44 min-w-0" onPointerDown={event => { if (event.button === 1) event.preventDefault(); }} onAuxClick={event => { if (event.button === 1) close(tab); }}>
            <Button role="tab" aria-label={label} aria-selected={selected} tabIndex={selected ? 0 : -1} variant="ghost"
              className="relative h-8 w-full min-w-0 justify-start gap-1.5 rounded-sm pr-6 pl-2 text-left active:scale-none aria-selected:bg-muted/45 aria-selected:font-medium aria-selected:text-foreground aria-selected:after:absolute aria-selected:after:inset-x-2 aria-selected:after:bottom-0 aria-selected:after:h-px aria-selected:after:rounded-full aria-selected:after:bg-active"
              title={`${label}\n${projectName(tab)}\n${detail}`} onClick={() => select(tab)}>
              <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">{icon(tab)}</span>
              <span className="min-w-0 truncate leading-5">{label}</span>
              {context && <span className="max-w-[35%] shrink-0 truncate border-l border-border pl-1.5 text-xs/5 font-normal text-muted-foreground">{context}</span>}
              {dirty ? <span className="size-1.5 shrink-0 rounded-full bg-foreground/60" aria-label="Unsaved changes" /> : tab.kind === "thread" && tab.session && conversations[tab.session]?.running ? <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Running" /> : null}
            </Button>
            <Button variant="ghost" size="icon-xs" className={cn("absolute top-1/2 right-0.5 size-5 -translate-y-1/2", !selected && "opacity-0 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100 [@media(hover:none)]:opacity-100")} title={withHint("Close tab", "closeWorkspaceTab", overrides)} aria-label={`Close ${label}`} disabled={buffer?.saving} onClick={() => close(tab)}><XIcon className="size-3" /></Button>
          </div>;
        })}
      </div>}
      {overflow ? <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className={NO_DRAG_REGION} title="All open tabs" aria-label="All open tabs" />}><CaretDownIcon /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-auto">
          <DropdownMenuRadioGroup value={strip?.active ?? ""} onValueChange={id => { const tab = tabs.find(tab => tabId(tab) === id); if (tab) select(tab); }}>
            {groups.map((group, index) => <DropdownMenuGroup key={index}>
              {mixedProjects ? <DropdownMenuLabel>{projectName(group.tabs[0]!)}</DropdownMenuLabel> : null}
              {group.tabs.map(tab => <DropdownMenuRadioItem key={tabId(tab)} value={tabId(tab)} title={`${title(tab)}\n${tab.kind === "file" ? tab.file : tab.projectDir}`}>
                <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">{icon(tab)}</span>
                <span className="min-w-0 flex-1 line-clamp-2 whitespace-normal break-words text-left leading-5">{title(tab)}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuGroup>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu> : null}
      {onNew ? <Button variant="ghost" size="icon-sm" className={NO_DRAG_REGION} title={withHint("New tab", "newWorkspaceTab", overrides)} aria-label="New tab" onClick={onNew}><PlusIcon /></Button> : null}
    </div>
    <WorkspacePaneMenu />
  </div>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {host?.integrated ? host.element ? createPortal(tabBar, host.element) : null : tabBar}
    {error ? <div role="alert" className="flex items-center gap-2 border-b px-3 py-2 text-xs text-destructive"><span className="min-w-0 flex-1">{error}</span><Button variant="ghost" size="xs" onClick={() => { const tab = tabs.find(t => tabId(t) === strip?.active); if (tab) select(tab); }}>Try again</Button></div> : null}
    {children}
    <ConfirmDialog open={!!closing} title="Discard unsaved edits?" description="Your changes to this file will be discarded. Cancel to return and save them." detail={closing?.tab.kind === "file" ? `${projectName(closing.tab)} / ${closing.tab.file}` : undefined} confirmLabel="Discard edits" destructive onCancel={() => setClosing(undefined)} onConfirm={() => { if (closing && closing.scope === scope) void controller.close(closing.tab, true); setClosing(undefined); }} />
  </div>;
}
