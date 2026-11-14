import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderPlusIcon } from "@phosphor-icons/react/FolderPlus";
import { FunnelSimpleIcon } from "@phosphor-icons/react/FunnelSimple";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { NotePencilIcon } from "@phosphor-icons/react/NotePencil";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { Project } from "../../shared/rpc-schema.ts";
import type { SessionSummary } from "../../shared/pi-types.ts";
import { useWorkProjects } from "../lib/workProjects.ts";
import { useAppStore } from "../lib/store.ts";
import { timeAgo } from "../lib/format.ts";
import { chatTitle } from "../lib/transcript.ts";
import { withHint } from "../lib/shortcuts.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";
import SessionMenu from "./SessionMenu.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog.tsx";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card.tsx";
import { HOVER_REVEAL, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import { editorName, fileManagerName } from "@/lib/paths.ts";
import { rpc } from "@/lib/rpc.ts";
import { showHint } from "../lib/toast.tsx";
import { groupSidebarChats } from "../lib/sidebarThreads.ts";
import { isChatFinished } from "../lib/chatOrganization.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import BrandIcon from "./BrandIcon.tsx";
import ProjectIcon from "./ProjectIcon.tsx";
import { projectBranch, type SidebarProject } from "../lib/sidebarProjects.ts";

interface SidebarChat {
  project: Project;
  session: SessionSummary;
  running: boolean;
  pinned: boolean;
  finished: boolean;
  selected: boolean;
  presentation?: SidebarProject;
}

const SIDEBAR_CHAT_ROW = "relative flex h-auto min-h-16 w-full flex-col items-stretch justify-center gap-1 overflow-hidden rounded-lg px-3 py-2.5 text-left text-sidebar-foreground outline-none transition-[background-color,color,scale] hover:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset active:scale-[0.985]";

interface SidebarProps {
  presentation: Record<string, SidebarProject>;
  onClose: () => void;
  onOpenSearch: () => void;
  onOpenNewChat: () => void;
  open?: boolean;
  overlay?: boolean;
  layoutKey?: unknown;
}

export default function Sidebar(props: SidebarProps) {
  const destination = useAppStore(s => s.destination);
  const openSettings = useAppStore(s => s.openSettings);
  return <LeftSidebar actionIcon={<GearSixIcon data-icon="inline-start" />} actionLabel="Settings" onAction={() => { openSettings(); if (props.overlay) props.onClose(); }} onClose={props.onClose} open={props.open ?? true} overlay={props.overlay} layoutKey={props.layoutKey}>
    {destination === "chat" ? <ChatContents {...props} /> : <WorkContents {...props} />}
  </LeftSidebar>;
}

function WorkContents({ presentation, onClose, onOpenSearch, onOpenNewChat, overlay = false }: SidebarProps) {
  const projects = useWorkProjects();
  const workRoot = useAppStore(s => s.workRoot);
  const git = useAppStore((s) => s.git);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const isNewChat = useAppStore((s) => s.isNewChat);
  const sessionsByProject = useAppStore((s) => s.sessionsByProject);
  const sessionLoadStates = useAppStore((s) => s.sessionLoadStates);
  const pinnedChats = useAppStore((s) => s.pinnedChats);
  const finishedChats = useAppStore((s) => s.finishedChats);
  const focusedChats = useAppStore((s) => s.focusedChats);
  const focusStartedAt = useAppStore((s) => s.focusStartedAt);
  const runningBySession = useAppStore(
    useShallow((s) =>
      Object.fromEntries(
        Object.entries(s.conversations).map(([path, conversation]) => [path, conversation.running]),
      ),
    ),
  );
  const addProject = useAppStore((s) => s.addProject);
  const selectChat = useAppStore((s) => s.selectChat);
  const newChatIn = useAppStore((s) => s.newChatIn);
  const removeProject = useAppStore((s) => s.removeProject);
  const importSession = useAppStore((s) => s.importSession);
  const refreshSessions = useAppStore((s) => s.refreshSessions);
  const openTerminal = useAppStore((s) => s.openTerminal);
  const finishChat = useAppStore((s) => s.finishChat);
  const returnChatToFocus = useAppStore((s) => s.returnChatToFocus);
  const editorId = useAppStore((s) => s.preferences.preferredEditorId);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const scope = useAppStore((s) => s.sidebarScope);
  const setScope = useAppStore((s) => s.setSidebarScope);
  const finishedOpen = useAppStore(s => s.sidebarFinishedOpen);
  const finishedLimit = useAppStore(s => s.sidebarFinishedLimit);
  const [now, setNow] = useState(Date.now);
  const [pendingRemoval, setPendingRemoval] = useState<Project | null>(null);
  const [worktreesFor, setWorktreesFor] = useState<string | null>(null);
  const watchedProjects = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // A flat focus queue needs every pinned project's shell list. Pi's session
  // files remain the source of truth; this only keeps their summaries warm.
  useEffect(() => {
    const wanted = new Set(projects.map((project) => project.path));
    for (const path of wanted) {
      if (!watchedProjects.current.has(path)) {
        watchedProjects.current.add(path);
        void rpc.request.watchProjectSessions({ projectDir: path });
      }
      if ((useAppStore.getState().sessionLoadStates[path] ?? "unloaded") === "unloaded") {
        void refreshSessions(path);
      }
    }
    for (const path of watchedProjects.current) {
      if (wanted.has(path)) continue;
      watchedProjects.current.delete(path);
    }
  }, [projects, refreshSessions]);

  useEffect(() => {
    if (scope && !projects.some((project) => project.path === scope)) setScope(null);
  }, [projects, scope]);

  const allChats = useMemo(() => {
    const pinned = new Set(pinnedChats);
    const chats: SidebarChat[] = [];
    for (const project of projects) {
      if (scope && project.path !== scope) continue;
      for (const session of sessionsByProject[project.path] ?? []) {
        const selected = project.path === activeProjectPath && session.path === activeSessionFile && !isNewChat;
        const running = runningBySession[session.path] ?? false;
        const isPinned = pinned.has(session.path);
        chats.push({
          project,
          session,
          running,
          pinned: isPinned,
          finished: isChatFinished(
            session.created,
            session.path,
            focusStartedAt,
            finishedChats[session.path],
            focusedChats,
          ),
          selected,
          presentation: {
            ...presentation[project.path],
            ...(project.path === activeProjectPath && git ? {branch: projectBranch(git)} : {}),
          },
        });
      }
    }
    return chats;
  }, [
    activeProjectPath,
    presentation,
    git,
    activeSessionFile,
    finishedChats,
    focusedChats,
    focusStartedAt,
    isNewChat,
    pinnedChats,
    projects,
    runningBySession,
    scope,
    sessionsByProject,
  ]);

  const { pinned, focus, finished } = useMemo(
    () => groupSidebarChats(allChats, pinnedChats, finishedChats),
    [allChats, finishedChats, pinnedChats],
  );

  const currentProject = projects.find((project) => project.path === activeProjectPath && project.path !== workRoot) ?? null;

  const scopedProject = scope ? projects.find((project) => project.path === scope) ?? null : null;
  const actionProject = scope && scope === workRoot ? null : scopedProject ?? currentProject;
  const loading = projects.some((project) => {
    const state = sessionLoadStates[project.path] ?? "unloaded";
    return state === "unloaded" || state === "loading";
  });
  const failedProjects = projects.filter((project) => sessionLoadStates[project.path] === "failed");

  async function selectChatAndClose(chat: SidebarChat) {
    if (chat.selected) return;
    await selectChat(chat.session.path, chat.project.path);
    if (overlay) onClose();
  }

  async function startNewChat(path: string) {
    await newChatIn(path);
    if (overlay) onClose();
  }

  async function addProjectAndClose() {
    await addProject();
    if (overlay) onClose();
  }

  async function importChat(path: string) {
    await importSession(path);
    if (overlay) onClose();
  }

  async function showTerminal(path: string) {
    openTerminal(path);
    if (overlay) onClose();
  }

  function markFinished(chat: SidebarChat) {
    const focusQueue = [...pinned, ...focus];
    const currentIndex = focusQueue.findIndex((item) => item.session.path === chat.session.path);
    const next = [...focusQueue.slice(currentIndex + 1), ...focusQueue.slice(0, currentIndex)].find(
      (item) => item.session.path !== chat.session.path,
    );
    finishChat(chat.session.path);
    if (!chat.selected) return;
    if (next) void selectChatAndClose(next);
    else void startNewChat(chat.project.path);
  }

  return (
    <>
      <div className={cn("flex flex-col gap-2 px-3 pb-3 pt-3", NO_DRAG_REGION)}>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="min-w-0 flex-1 justify-start text-muted-foreground"
            onClick={onOpenSearch}
            title={withHint("Search chats and messages", "search", keybindingOverrides)}
            aria-label="Search chats and messages"
          >
            <MagnifyingGlassIcon data-icon="inline-start" className="size-4" />
            Search
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Filter threads" title={scopedProject ? `Filter: ${scopedProject.name}` : "Filter threads"} className={cn(scope && "bg-sidebar-accent text-sidebar-accent-foreground")} />}>
              <FunnelSimpleIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Projects</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setScope(null)}>
                  <span className="flex-1">All projects</span>{!scope ? <CheckCircleIcon aria-hidden="true" /> : null}
                </DropdownMenuItem>
                {projects.map((project) => (
                  <DropdownMenuItem key={project.path} onClick={() => setScope(project.path)}>
                    <ProjectIcon name={project.name} src={presentation[project.path]?.icon} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {scope === project.path ? <CheckCircleIcon aria-hidden="true" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              {actionProject ? <><DropdownMenuSeparator /><ProjectActionsMenuItems
                project={actionProject} editorId={editorId} onNewChat={startNewChat} onImport={importChat}
                onTerminal={showTerminal} onWorktrees={setWorktreesFor} onRemove={setPendingRemoval}
              /></> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={() => void addProjectAndClose()} aria-label="Add project" title="Add a project folder">
            <FolderPlusIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenNewChat}
            aria-label="New chat"
            title={withHint("New chat", "newChat", keybindingOverrides)}
          >
            <NotePencilIcon className="size-4" />
          </Button>
        </div>

      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
        {loading && pinned.length === 0 && focus.length === 0 ? (
          <ChatHistoryState icon={<CircleNotchIcon className="animate-spin" />} title="Gathering your chats" detail="Reading Pi session history across your projects." />
        ) : null}
        {failedProjects.length > 0 ? (
          <ChatHistoryState
            icon={<WarningCircleIcon className="text-warning" weight="fill" />}
            title={`Could not read ${failedProjects.length === 1 ? failedProjects[0]!.name : `${failedProjects.length} projects`}`}
            detail="Retry to include their chats in this focus view."
            role="alert"
            action={
              <Button variant="ghost" size="sm" className="text-warning hover:bg-warning/15 hover:text-warning" onClick={() => failedProjects.forEach((project) => void refreshSessions(project.path))}>
                <ArrowClockwiseIcon data-icon="inline-start" /> Retry
              </Button>
            }
          />
        ) : null}

        {pinned.length > 0 ? (
          <div className="flex h-9 shrink-0 items-center gap-2 px-3 text-[0.6875rem] tracking-[0.06em] uppercase">
            <h2 className="font-medium text-muted-foreground">Pinned</h2>
            <span className="tabular-nums text-muted-foreground/70">{pinned.length}</span>
          </div>
        ) : null}
        <div className="flex shrink-0 flex-col gap-1.5">
          {pinned.map((chat) => (
            <FocusChatRow
              key={chat.session.path}
              chat={chat}
              now={now}
              onSelect={() => void selectChatAndClose(chat)}
              onFinish={() => markFinished(chat)}
            />
          ))}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {focus.map((chat) => (
            <FocusChatRow
              key={chat.session.path}
              chat={chat}
              now={now}
              onSelect={() => void selectChatAndClose(chat)}
              onFinish={() => markFinished(chat)}
            />
          ))}
        </div>

        {!loading && projects.length > 0 && failedProjects.length === 0 && pinned.length === 0 && focus.length === 0 && finished.length > 0 ? (
          <div className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-sidebar-foreground/80">No active chats</p>
            <p className="mt-0.5">Start a chat, or return one from Finished.</p>
          </div>
        ) : null}

        {!loading && projects.length === 0 ? (
          <button type="button" onClick={() => void addProjectAndClose()} className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-3 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none">
            <FolderPlusIcon className="shrink-0" /> Open your first folder
          </button>
        ) : null}

        {finished.length > 0 ? (
          <section className="mt-auto shrink-0 pt-8" aria-label="Finished chats">
            <button type="button" onClick={() => useAppStore.setState({ sidebarFinishedOpen: !finishedOpen })} aria-expanded={finishedOpen} className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[0.6875rem] tracking-[0.06em] uppercase text-muted-foreground transition-colors hover:text-sidebar-foreground">
              <span className="font-medium">Finished</span>
              <span className="ml-auto tabular-nums text-muted-foreground">{finished.length}</span>
              <CaretDownIcon className={cn("transition-transform", !finishedOpen && "-rotate-90")} weight="bold" />
            </button>
            {finishedOpen ? (
              <div className="flex flex-col gap-1 pt-1">
                {finished.slice(0, finishedLimit).map((chat) => (
                  <FinishedChatRow
                    key={chat.session.path}
                    chat={chat}
                    now={now}
                    onSelect={() => void selectChatAndClose(chat)}
                    onReturn={() => returnChatToFocus(chat.session.path)}
                  />
                ))}
                {finished.length > finishedLimit ? (
                  <button
                    type="button"
                    className="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                    onClick={() => useAppStore.setState({ sidebarFinishedLimit: finishedLimit + 25 })}
                  >
                    <span className="text-base leading-none">+</span>
                    Show {Math.min(25, finished.length - finishedLimit)} more
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <WorktreeDialog projectPath={worktreesFor} onClose={() => setWorktreesFor(null)} />
      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove this project?"
        description={
          <>
            NativePi will stop tracking <span className="font-medium text-foreground">{pendingRemoval?.name}</span> and close its chats. Nothing is deleted from disk.
          </>
        }
        detail={pendingRemoval?.path}
        confirmLabel="Remove project"
        destructive
        onConfirm={() => {
          const target = pendingRemoval;
          setPendingRemoval(null);
          if (target) void removeProject(target.path);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </>
  );
}

function FocusChatRow({
  chat,
  now,
  onSelect,
  onFinish,
}: {
  chat: SidebarChat;
  now: number;
  onSelect: () => void;
  onFinish: () => void;
}) {
  const provider = chat.session.providers[0];

  return (
    <SessionMenu projectPath={chat.project.path} session={chat.session} selected={chat.selected} running={chat.running} pinned={chat.pinned}>
      <HoverCard>
        <div className="group/focus relative w-full">
          <HoverCardTrigger
            delay={450}
            closeDelay={100}
            render={<Button variant="ghost" />}
            onClick={onSelect}
            aria-current={chat.selected ? "page" : undefined}
            className={cn(
              SIDEBAR_CHAT_ROW,
              chat.selected && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5" title={chatTitle(chat.session)}>{chatTitle(chat.session)}</span>
              <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-normal tabular-nums", chat.running ? "text-active" : "text-muted-foreground")} role={chat.running ? "status" : undefined}>
                {chat.running ? <><CircleNotchIcon className="size-3 animate-spin" />Working </> : null}
                {timeAgo(chat.session.modified, now)}
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2 text-xs font-normal text-muted-foreground">
              <ProjectIcon name={chat.project.name} src={chat.presentation?.icon} />
              <span className="min-w-0 flex-1 truncate" title={chat.presentation?.branch ? `Current project branch: ${chat.presentation.branch}` : chat.project.name}>
                {chat.project.name}{chat.presentation?.branch ? <> · {chat.presentation.branch}</> : null}
              </span>
              <span className="relative flex size-5 shrink-0 items-center justify-center">
                {provider ? (
                  <span className="hidden text-muted-foreground/60 transition-opacity [@media(hover:hover)]:inline-flex group-hover/focus:opacity-0 group-focus-within/focus:opacity-0" title={`Model provider: ${provider}`}>
                    <BrandIcon name={providerIconName(provider)} size={14} />
                  </span>
                ) : null}
              </span>
            </span>
          </HoverCardTrigger>
          {!chat.running ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(HOVER_REVEAL, "absolute right-2.5 bottom-2 group-hover/focus:opacity-100 group-focus-within/focus:opacity-100")}
              onClick={onFinish}
              aria-label="Mark finished"
              title="Mark finished"
            >
              <CheckCircleIcon />
            </Button>
          ) : null}
        </div>
        <ChatHoverCardContent chat={chat} now={now} />
      </HoverCard>
    </SessionMenu>
  );
}

function FinishedChatRow({
  chat,
  now,
  onSelect,
  onReturn,
}: {
  chat: SidebarChat;
  now: number;
  onSelect: () => void;
  onReturn: () => void;
}) {
  return (
    <SessionMenu projectPath={chat.project.path} session={chat.session} selected={chat.selected} running={false} pinned={chat.pinned} finished>
      <HoverCard>
        <div className="group/finished relative w-full">
          <HoverCardTrigger
            delay={450}
            closeDelay={100}
            render={<Button variant="ghost" />}
            onClick={onSelect}
            aria-current={chat.selected ? "page" : undefined}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-normal text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset active:scale-100",
              chat.selected && "bg-sidebar-accent font-medium text-sidebar-accent-foreground ring-1 ring-inset ring-input",
            )}
          >
            <ProjectIcon name={chat.project.name} src={chat.presentation?.icon} />
            <span className="min-w-0 flex-1 truncate">{chatTitle(chat.session)}</span>
            <span className="relative flex h-6 min-w-6 shrink-0 items-center justify-end">
              <span className="sidebar-chat-time hidden text-xs tabular-nums text-muted-foreground transition-opacity [@media(hover:hover)]:inline group-hover/finished:opacity-0 group-focus-within/finished:opacity-0">
                {timeAgo(chat.session.modified, now)}
              </span>
            </span>
          </HoverCardTrigger>
          <Button variant="ghost" size="icon-xs" className={cn(HOVER_REVEAL, "absolute top-1/2 right-2 -translate-y-1/2 group-hover/finished:opacity-100 group-focus-within/finished:opacity-100")} onClick={onReturn} aria-label="Return chat to focus" title="Return to focus">
            <ArrowClockwiseIcon />
          </Button>
        </div>
        <ChatHoverCardContent chat={chat} now={now} />
      </HoverCard>
    </SessionMenu>
  );
}

function ChatHoverCardContent({ chat, now }: { chat: SidebarChat; now: number }) {
  const provider = chat.session.providers[0];

  return (
    <HoverCardContent side="right" align="start" sideOffset={6} className="w-64">
      <p className="break-words font-medium leading-snug text-popover-foreground">
        {chatTitle(chat.session)}
      </p>
      <div className="mt-1.5 flex flex-col gap-1 text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <FolderIcon className="size-3.5 shrink-0" />
          <span className="truncate">{chat.project.name}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <ClockIcon className="size-3.5 shrink-0" />
          <span>Updated {timeAgo(chat.session.modified, now)}</span>
        </span>
        {provider ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <BrandIcon name={providerIconName(provider)} size={14} />
            <span className="truncate">{provider}</span>
          </span>
        ) : null}
      </div>
    </HoverCardContent>
  );
}

function ProjectActionsMenuItems({
  project,
  editorId,
  onNewChat,
  onImport,
  onTerminal,
  onWorktrees,
  onRemove,
}: {
  project: Project | null;
  editorId: string;
  onNewChat: (path: string) => Promise<void>;
  onImport: (path: string) => Promise<void>;
  onTerminal: (path: string) => Promise<void>;
  onWorktrees: (path: string) => void;
  onRemove: (project: Project) => void;
}) {
  if (!project) return null;
  return (
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{project.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void onNewChat(project.path)}><NotePencilIcon /> New chat here</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void onImport(project.path)}><UploadSimpleIcon /> Import an existing chat</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void rpc.request.openProjectIn({ projectDir: project.path, editorId })}>Open in {editorName(editorId)}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void rpc.request.showInFolder({ path: project.path })}>Reveal in {fileManagerName()}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void onTerminal(project.path)}>Open terminal here</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(project.path).then(() => showHint("Path copied"))}>Copy path</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onWorktrees(project.path)}>Worktrees…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onRemove(project)}>Remove from NativePi</DropdownMenuItem>
        </DropdownMenuGroup>
  );
}

function ChatHistoryState({
  icon,
  title,
  detail,
  action,
  role = "status",
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className="mt-1 flex flex-wrap items-start gap-2 rounded-lg border border-dashed border-sidebar-border px-2 py-2 text-xs">
      <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block leading-relaxed text-muted-foreground">{detail}</span>
      </span>
      {action}
    </div>
  );
}

function ChatContents({ onClose, onOpenSearch, onOpenNewChat, overlay = false }: SidebarProps) {
  const root = useAppStore(s => s.chatRoot);
  const sessions = useAppStore(s => root ? s.sessionsByProject[root] : undefined);
  const folders = useAppStore(s => s.chatFolders);
  const membership = useAppStore(s => s.chatFolderBySession);
  const conversations = useAppStore(s => s.conversations);
  const active = useAppStore(s => s.activeSessionFile);
  const refresh = useAppStore(s => s.refreshSessions);
  const collapsed = useAppStore(s => s.collapsedChatFolders);
  const toggleFolder = useAppStore(s => s.toggleChatFolder);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!root) return;
    void refresh(root).catch(() => setError("Could not load chats. Try searching or reopen Chat."));
    void rpc.request.watchProjectSessions({ projectDir: root });
    return () => { void rpc.request.unwatchProjectSessions({ projectDir: root }); };
  }, [root, refresh]);
  const folder = folders.find(f => f.id === removing);
  function newChat(folderId: string | null) {
    if (root) useAppStore.getState().moveToChatFolder(root, folderId);
    if (folderId && collapsed.includes(folderId)) toggleFolder(folderId);
    onOpenNewChat();
  }
  function chatRow(session: NonNullable<typeof sessions>[number]) {
    const title = chatTitle(session);
    const prompt = session.lastPrompt?.trim();
    const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const normalizedTitle = normalize(title);
    const normalizedPrompt = prompt ? normalize(prompt) : "";
    const preview = normalizedPrompt && normalizedTitle && !normalizedPrompt.includes(normalizedTitle) && !normalizedTitle.includes(normalizedPrompt) ? prompt : undefined;
    return <SessionMenu key={session.path} projectPath={root!} session={session} selected={active === session.path} running={conversations[session.path]?.running ?? false} pinned={false}>
      <DropdownMenu>
        <div className="group relative flex w-full min-w-0 items-center">
          <Button variant={active === session.path ? "secondary" : "ghost"} title={chatTitle(session)} className={cn(SIDEBAR_CHAT_ROW, active === session.path && "bg-sidebar-accent text-sidebar-accent-foreground")} onClick={() => { void useAppStore.getState().selectChat(session.path, root!); if (overlay) onClose(); }}><span className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium leading-5">{chatTitle(session)}</span><span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">{conversations[session.path]?.running ? <span className="inline-flex items-center gap-1 text-active"><CircleNotchIcon className="size-3 animate-spin" />Working</span> : timeAgo(session.modified, now)}</span></span>{preview || session.providers[0] ? <span className="flex min-w-0 items-center gap-2 text-xs font-normal text-muted-foreground"><span className="min-w-0 flex-1 truncate">{preview}</span>{session.providers[0] ? <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/60 group-hover:opacity-0 group-focus-within:opacity-0" title={`Model provider: ${session.providers[0]}`}><BrandIcon name={providerIconName(session.providers[0])} size={14} /></span> : null}</span> : null}</Button>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="absolute right-2 bottom-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Move ${chatTitle(session)}`} />}><FolderIcon /></DropdownMenuTrigger>
        </div>
        <DropdownMenuContent>
          {membership[session.path] && folders.some(f => f.id === membership[session.path]) ? <DropdownMenuItem onClick={() => useAppStore.getState().moveToChatFolder(session.path, null)}>Move out of folder</DropdownMenuItem> : null}
          {folders.length === 0 ? <DropdownMenuItem onClick={() => setCreate(true)}><FolderPlusIcon /> Create folder</DropdownMenuItem> : null}
          {folders.filter(f => f.id !== membership[session.path]).map(f => <DropdownMenuItem key={f.id} onClick={() => { useAppStore.getState().moveToChatFolder(session.path, f.id); if (collapsed.includes(f.id)) toggleFolder(f.id); }}><FolderIcon style={{ color: f.color }} />{f.name}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </SessionMenu>;
  }
  return <>
    <div className={cn("flex flex-col gap-2 px-3 pb-3 pt-3", NO_DRAG_REGION)}>
      <div className="flex items-center gap-1">
        <Button variant="ghost" className="min-w-0 flex-1 justify-start text-muted-foreground" onClick={onOpenSearch}><MagnifyingGlassIcon className="size-4" />Search</Button>
        <Button variant="ghost" size="icon" aria-label="New folder" title="New folder" onClick={() => setCreate(true)}><FolderPlusIcon className="size-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="New chat" title="New chat" onClick={() => newChat(null)}><NotePencilIcon className="size-4" /></Button>
      </div>
    </div>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
      {error ? <p role="alert" className="py-2 text-sm text-destructive">{error}</p> : null}
      {folders.map(f => {
        const expanded = !collapsed.includes(f.id);
        const children = sessions?.filter(session => membership[session.path] === f.id) ?? [];
        return <section key={f.id} className="mb-1" aria-label={f.name}>
          <div className="group/folder flex items-center rounded-md hover:bg-sidebar-accent/50">
            <Button variant="ghost" className="min-w-0 flex-1 justify-start gap-2 text-muted-foreground hover:text-sidebar-foreground" aria-expanded={expanded} onClick={() => toggleFolder(f.id)}>
              <CaretDownIcon className={expanded ? "" : "-rotate-90"} />
              <FolderIcon weight="fill" style={{ color: f.color }} /><span className="truncate">{f.name}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{children.length}</span>
            </Button>
            <div className="flex opacity-0 group-hover/folder:opacity-100 group-focus-within/folder:opacity-100">
              <Button variant="ghost" size="icon-sm" aria-label={`New chat in ${f.name}`} onClick={() => newChat(f.id)}><PlusIcon /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.name}`} disabled={deleting} onClick={() => setRemoving(f.id)}><TrashIcon /></Button>
            </div>
          </div>
          {expanded ? <div className="ml-5 flex flex-col gap-1.5 border-l pl-2" style={{ borderColor: f.color + "55" }}>
            {children.map(chatRow)}
            {!children.length ? <Button variant="ghost" className="w-full justify-start text-muted-foreground font-normal" onClick={() => newChat(f.id)}>Start a chat here</Button> : null}
          </div> : null}
        </section>;
      })}
      <div className="flex flex-col gap-1.5">{sessions?.filter(session => !folders.some(folder => folder.id === membership[session.path])).map(chatRow)}</div>
      {sessions?.length === 0 && folders.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">Start a conversation, or create a folder for related chats.</p> : null}
    </div>
    <Dialog open={create} onOpenChange={setCreate}><DialogContent><DialogTitle>New folder</DialogTitle><DialogDescription>Organize related chats. Each folder gets its own color.</DialogDescription><form onSubmit={event => { event.preventDefault(); useAppStore.getState().addChatFolder(name); setName(""); setCreate(false); }}><Input autoFocus aria-label="Folder name" value={name} maxLength={100} onChange={event => setName(event.target.value)} /><Button className="mt-4" type="submit" disabled={!name.trim()}>Create folder</Button></form></DialogContent></Dialog>
    <ConfirmDialog open={!!folder && !deleting} title={`Delete ${folder?.name ?? "folder"}?`} description="This folder and all chats within it will be permanently deleted. This cannot be undone." confirmLabel="Delete folder and chats" destructive onCancel={() => setRemoving(null)} onConfirm={() => {
      if (!folder) return;
      setDeleting(true); setError("");
      void useAppStore.getState().deleteChatFolder(folder.id).catch(error => setError(error instanceof Error ? error.message : "Could not delete folder.")).finally(() => { setDeleting(false); setRemoving(null); });
    }} />
  </>;
}
