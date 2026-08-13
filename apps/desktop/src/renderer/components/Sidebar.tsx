import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderPlusIcon } from "@phosphor-icons/react/FolderPlus";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { NotePencilIcon } from "@phosphor-icons/react/NotePencil";
import { PushPinIcon } from "@phosphor-icons/react/PushPin";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { Project } from "../../shared/rpc-schema.ts";
import type { SessionSummary } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { timeAgo } from "../lib/format.ts";
import { chatTitle } from "../lib/transcript.ts";
import { withHint } from "../lib/shortcuts.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";
import SessionMenu from "./SessionMenu.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
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
import { Separator } from "@/components/ui/separator.tsx";
import { HOVER_REVEAL, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import { editorName, fileManagerName } from "@/lib/paths.ts";
import { rpc } from "@/lib/rpc.ts";
import { showHint } from "../lib/toast.tsx";
import { isChatFinished } from "../lib/chatOrganization.ts";

interface SidebarChat {
  project: Project;
  session: SessionSummary;
  running: boolean;
  pinned: boolean;
  finished: boolean;
  selected: boolean;
}

export default function Sidebar({
  onClose,
  onOpenSearch,
  onOpenNewChat,
  open = true,
  overlay = false,
  layoutKey,
}: {
  onClose: () => void;
  onOpenSearch: () => void;
  onOpenNewChat: () => void;
  open?: boolean;
  overlay?: boolean;
  layoutKey?: unknown;
}) {
  const projects = useAppStore((s) => s.projects);
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
  const openSettings = useAppStore((s) => s.openSettings);
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
  const [finishedOpen, setFinishedOpen] = useState(true);
  const [finishedLimit, setFinishedLimit] = useState(12);
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
        });
      }
    }
    return chats;
  }, [
    activeProjectPath,
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

  const { pinned, focus, finished } = useMemo(() => {
    const pinnedOrder = new Map(pinnedChats.map((path, index) => [path, index]));
    const pinned = allChats
      .filter((chat) => chat.pinned)
      .toSorted(
        (left, right) => (pinnedOrder.get(left.session.path) ?? 0) - (pinnedOrder.get(right.session.path) ?? 0),
      );
    const focus = allChats
      .filter((chat) => !chat.finished && !chat.pinned)
      .toSorted((left, right) => Date.parse(right.session.modified) - Date.parse(left.session.modified));
    const finished = allChats
      .filter((chat) => chat.finished)
      .toSorted(
        (left, right) =>
          Date.parse(finishedChats[right.session.path] ?? right.session.modified) -
          Date.parse(finishedChats[left.session.path] ?? left.session.modified),
      );
    return { pinned, focus, finished };
  }, [allChats, finishedChats, pinnedChats]);

  const currentProject = projects.find((project) => project.path === activeProjectPath) ?? null;

  const scopedProject = scope ? projects.find((project) => project.path === scope) ?? null : null;
  const loading = projects.some((project) => {
    const state = sessionLoadStates[project.path] ?? "unloaded";
    return state === "unloaded" || state === "loading";
  });
  const failedProjects = projects.filter((project) => sessionLoadStates[project.path] === "failed");

  async function selectChatAndClose(chat: SidebarChat) {
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
    <LeftSidebar
      actionIcon={<GearSixIcon data-icon="inline-start" />}
      actionLabel="Settings"
      onAction={() => {
        openSettings();
        if (overlay) onClose();
      }}
      onClose={onClose}
      open={open}
      overlay={overlay}
      layoutKey={layoutKey}
    >
      <div className={cn("flex flex-col gap-2 px-2 pb-2", NO_DRAG_REGION)}>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="default"
            className="min-w-0 flex-1 justify-start"
            onClick={onOpenNewChat}
            title={withHint("New chat", "newChat", keybindingOverrides)}
          >
            <NotePencilIcon data-icon="inline-start" />
            New chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSearch}
            aria-label="Search chats and messages"
            title={withHint("Search chats and messages", "search", keybindingOverrides)}
          >
            <MagnifyingGlassIcon />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start text-muted-foreground" />}>
              <FolderIcon data-icon="inline-start" />
              <span className="truncate">{scopedProject?.name ?? "All projects"}</span>
              <CaretDownIcon data-icon="inline-end" className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setScope(null)}>
                  <FolderIcon /> All projects
                </DropdownMenuItem>
                {projects.map((project) => (
                  <DropdownMenuItem key={project.path} onClick={() => setScope(project.path)}>
                    <FolderIcon /> <span className="truncate">{project.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {currentProject ? (
            <ProjectActionsDropdown
              project={currentProject}
              editorId={editorId}
              onNewChat={startNewChat}
              onImport={importChat}
              onTerminal={showTerminal}
              onWorktrees={setWorktreesFor}
              onRemove={setPendingRemoval}
            />
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={() => void addProjectAndClose()} aria-label="Add project" title="Add a project folder">
            <FolderPlusIcon />
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
          <div className="flex h-8 shrink-0 items-center gap-2 px-2 text-xs">
            <h2 className="font-medium text-sidebar-foreground">Pinned</h2>
            <span className="tabular-nums text-muted-foreground/70">{pinned.length}</span>
          </div>
        ) : null}
        <div className="flex flex-col gap-0.5">
          {pinned.map((chat) => (
            <FocusChatRow
              key={chat.session.path}
              chat={chat}
              now={now}
              showProject={!scopedProject}
              showPin={false}
              onSelect={() => void selectChatAndClose(chat)}
              onFinish={() => markFinished(chat)}
            />
          ))}
        </div>

        {focus.length > 0 || (!loading && projects.length > 0) ? (
          <div className={cn("flex h-8 shrink-0 items-center gap-2 px-2 text-xs", pinned.length > 0 && "mt-2")}>
            <h2 className="font-medium text-sidebar-foreground">Focus</h2>
            <span className="tabular-nums text-muted-foreground/70">{focus.length}</span>
          </div>
        ) : null}
        <div className="flex flex-col gap-0.5">
          {focus.map((chat) => (
            <FocusChatRow
              key={chat.session.path}
              chat={chat}
              now={now}
              showProject={!scopedProject}
              onSelect={() => void selectChatAndClose(chat)}
              onFinish={() => markFinished(chat)}
            />
          ))}
        </div>

        {!loading && projects.length === 0 ? (
          <button type="button" onClick={() => void addProjectAndClose()} className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-3 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none">
            <FolderPlusIcon className="shrink-0" /> Open your first folder
          </button>
        ) : null}

        {finished.length > 0 ? (
          <section className="mt-3" aria-label="Finished chats">
            <button type="button" onClick={() => setFinishedOpen((value) => !value)} aria-expanded={finishedOpen} className="flex h-8 w-full items-center gap-2 rounded-md px-1 text-left text-xs text-muted-foreground hover:text-sidebar-foreground">
              <CheckCircleIcon weight="fill" />
              <span className="font-medium">Finished</span>
              <span className="tabular-nums text-muted-foreground/70">{finished.length}</span>
              <Separator className="mx-1 flex-1" />
              <CaretDownIcon className={cn("transition-transform", !finishedOpen && "-rotate-90")} weight="bold" />
            </button>
            {finishedOpen ? (
              <div className="flex flex-col gap-0.5 pt-1">
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
                    onClick={() => setFinishedLimit((limit) => limit + 25)}
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
    </LeftSidebar>
  );
}

function FocusChatRow({
  chat,
  now,
  showProject,
  showPin = true,
  onSelect,
  onFinish,
}: {
  chat: SidebarChat;
  now: number;
  showProject: boolean;
  showPin?: boolean;
  onSelect: () => void;
  onFinish: () => void;
}) {
  return (
    <SessionMenu projectPath={chat.project.path} session={chat.session} selected={chat.selected} running={chat.running} pinned={chat.pinned}>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.currentTarget !== event.target) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        aria-current={chat.selected ? "page" : undefined}
        className="group/focus relative flex min-h-14 w-full flex-col justify-center gap-1 overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
      >
        <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", chat.running ? "bg-active" : chat.selected ? "bg-sidebar-foreground/30" : "bg-transparent")} />
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium leading-5">{chatTitle(chat.session)}</span>
          {chat.running ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-active" role="status">
              <CircleNotchIcon className="size-3 animate-spin" /> Working
            </span>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(HOVER_REVEAL, "ml-auto shrink-0 group-hover/focus:scale-100 group-hover/focus:opacity-100 group-hover/focus:blur-none group-focus-visible/focus:scale-100 group-focus-visible/focus:opacity-100 group-focus-visible/focus:blur-none")}
              onClick={(event) => {
                event.stopPropagation();
                onFinish();
              }}
              aria-label="Mark finished"
              title="Mark finished"
            >
              <CheckCircleIcon />
            </Button>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {showProject ? (
            <>
              <FolderIcon className="size-3.5 shrink-0" weight={chat.selected ? "fill" : "regular"} />
              <span className="sidebar-chat-project truncate font-medium">{chat.project.name}</span>
            </>
          ) : null}
          {showPin && chat.pinned ? <PushPinIcon className="size-3 shrink-0 text-favorite" weight="fill" aria-label="Pinned" /> : null}
          <span className="sidebar-chat-time ml-auto shrink-0 tabular-nums">{timeAgo(chat.session.modified, now)}</span>
        </span>
      </div>
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
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.currentTarget !== event.target) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        aria-current={chat.selected ? "page" : undefined}
        className="group/finished flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1 truncate">{chatTitle(chat.session)}</span>
        <span className="max-w-[40%] shrink-0 truncate">{chat.project.name}</span>
        <span className="sidebar-chat-time shrink-0 tabular-nums text-muted-foreground/60">{timeAgo(chat.session.modified, now)}</span>
        <Button variant="ghost" size="icon-xs" className={cn(HOVER_REVEAL, "shrink-0 group-hover/finished:scale-100 group-hover/finished:opacity-100 group-hover/finished:blur-none group-focus-visible/finished:scale-100 group-focus-visible/finished:opacity-100 group-focus-visible/finished:blur-none")} onClick={(event) => { event.stopPropagation(); onReturn(); }} aria-label="Return chat to focus" title="Return to focus">
          <ArrowClockwiseIcon />
        </Button>
      </div>
    </SessionMenu>
  );
}

function ProjectActionsDropdown({
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
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${project.name} actions`} />}>
        <DotsThreeIcon weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
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
      </DropdownMenuContent>
    </DropdownMenu>
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
