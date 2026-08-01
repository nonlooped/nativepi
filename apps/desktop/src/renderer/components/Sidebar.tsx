import { useEffect, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderPlusIcon } from "@phosphor-icons/react/FolderPlus";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { ListBulletsIcon } from "@phosphor-icons/react/ListBullets";
import { NotePencilIcon } from "@phosphor-icons/react/NotePencil";
import { PushPinIcon } from "@phosphor-icons/react/PushPin";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { Project } from "../../shared/rpc-schema.ts";
import type { SessionSummary } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { chatTitle } from "../lib/transcript.ts";
import { hintFor, withHint, type KeybindingOverrides } from "../lib/shortcuts.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";
import SessionMenu from "./SessionMenu.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
import ChatSearchDialog from "./ChatSearchDialog.tsx";
import UsageDashboardDialog from "./UsageDashboardDialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { HOVER_REVEAL, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import { editorName, fileManagerName } from "@/lib/paths.ts";
import { rpc } from "@/lib/rpc.ts";
import { showHint } from "../lib/toast.tsx";
import { groupChats } from "../lib/chatOrganization.ts";

export default function Sidebar({ onClose, overlay = false }: { onClose: () => void; overlay?: boolean }) {
  const projects = useAppStore((s) => s.projects);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const addProject = useAppStore((s) => s.addProject);
  const openSettings = useAppStore((s) => s.openSettings);
  const openRunBoard = useAppStore((s) => s.openRunBoard);
  const selectProject = useAppStore((s) => s.selectProject);
  const removeProject = useAppStore((s) => s.removeProject);
  const projectBusyStates = useAppStore(
    useShallow((s) => s.projects.map((project) => Object.values(s.conversations).some((conversation) => conversation.projectDir === project.path && conversation.running))),
  );
  const importSession = useAppStore((s) => s.importSession);
  const refreshSessions = useAppStore((s) => s.refreshSessions);
  const openTerminal = useAppStore((s) => s.openTerminal);
  const editorId = useAppStore((s) => s.preferences.preferredEditorId);
  const searchFocusRequest = useAppStore((s) => s.searchFocusRequest);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const [searchOpen, setSearchOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now);
  const [pendingRemoval, setPendingRemoval] = useState<Project | null>(null);
  const [worktreesFor, setWorktreesFor] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState(() => new Set(activeProjectPath ? [activeProjectPath] : []));

  useEffect(() => {
    if (searchFocusRequest > 0) setSearchOpen(true);
  }, [searchFocusRequest]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    for (const project of projects) {
      void rpc.request.watchProjectSessions({ projectDir: project.path });
      void refreshSessions(project.path);
    }
  }, [projects, refreshSessions]);

  function expandProject(path: string) {
    setExpandedProjects((expanded) => new Set(expanded).add(path));
  }

  function toggleProject(path: string) {
    setExpandedProjects((expanded) => {
      const next = new Set(expanded);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function selectProjectAndClose(path: string) {
    expandProject(path);
    await selectProject(path);
    if (overlay) onClose();
  }

  async function addProjectAndClose() {
    await addProject();
    if (overlay) onClose();
  }

  async function startNewChat(path: string) {
    expandProject(path);
    if (path !== activeProjectPath) await selectProject(path);
    useAppStore.getState().newChat();
    if (overlay) onClose();
  }

  async function importChat(path: string) {
    expandProject(path);
    if (path !== activeProjectPath) await selectProject(path);
    await importSession(path);
    if (overlay) onClose();
  }

  async function showTerminal(path: string) {
    if (path !== activeProjectPath) await selectProject(path);
    openTerminal(path);
    if (overlay) onClose();
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
      overlay={overlay}
    >
      <div className={cn("relative px-3 pb-6 pt-2", NO_DRAG_REGION)}>
        <MagnifyingGlassIcon className="pointer-events-none absolute left-5 top-5 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter chat titles"
          aria-label="Filter chat titles"
          className="border-0 bg-transparent pl-8 pr-3 text-base shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:text-base"
        />
      </div>

      <div className="flex items-center justify-between px-4 pb-2">
        <span className="text-sm font-medium text-muted-foreground">Projects</span>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSearchOpen(true)}
            title={withHint("Search chats and messages", "search", keybindingOverrides)}
            aria-label="Search chats and messages"
          >
            <MagnifyingGlassIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setUsageOpen(true)}
            title="Usage and costs"
            aria-label="Usage and costs"
          >
            <ChartLineUpIcon />
          </Button>
          {activeProjectPath ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void importSession().then(() => overlay && onClose())}
              title={withHint("Import an existing chat", "importChat", keybindingOverrides)}
              aria-label="Import an existing chat"
            >
              <UploadSimpleIcon />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void addProjectAndClose()}
            title="Add project folder"
            aria-label="Add project folder"
          >
            <FolderPlusIcon />
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          openRunBoard();
          if (overlay) onClose();
        }}
        className="mx-3 mb-2 justify-start text-muted-foreground"
      >
        <ListBulletsIcon data-icon="inline-start" />
        Run board
      </Button>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
        {projects.length === 0 && (
          <button
            type="button"
            onClick={() => void addProjectAndClose()}
            className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:border-sidebar-ring focus-visible:ring-2 focus-visible:ring-sidebar-ring/30 focus-visible:outline-none"
          >
            <FolderPlusIcon className="shrink-0" />
            Open your first folder
          </button>
        )}
        {projects.map((project, index) => {
          const busy = projectBusyStates[index] ?? false;
          const active = project.path === activeProjectPath;
          return (
            <div
              key={project.path}
              className="flex flex-col gap-0.5"
            >
              <ContextMenu>
                <ContextMenuTrigger
                  render={
                    <div
                      className={cn(
                        "group flex items-center rounded-lg transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent",
                        active && "bg-sidebar-accent ring-1 ring-inset ring-sidebar-ring/30",
                      )}
                    />
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleProject(project.path);
                    }}
                    aria-label={`${expandedProjects.has(project.path) ? "Collapse" : "Expand"} ${project.name}`}
                    aria-expanded={expandedProjects.has(project.path)}
                    className={cn("shrink-0", active && "text-foreground")}
                  >
                    <CaretDownIcon
                      className={cn(
                        "text-muted-foreground transition-transform",
                        !expandedProjects.has(project.path) && "-rotate-90",
                      )}
                      weight="bold"
                    />
                  </Button>
                  <button
                    type="button"
                    onClick={() => void selectProjectAndClose(project.path)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                      active && "text-sidebar-accent-foreground",
                    )}
                    title={busy ? `${project.path} — agent running` : project.path}
                  >
                    <FolderIcon className={cn("shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
                    <span className="truncate">{project.name}</span>
                    {busy ? (
                      <span
                        role="status"
                        aria-label={`Agent running in ${project.name}`}
                        className="ml-auto size-2 shrink-0 animate-pulse rounded-full bg-success ring-2 ring-success/20"
                      />
                    ) : null}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void startNewChat(project.path)}
                    disabled={busy}
                    aria-label={`New chat in ${project.name}`}
                    title={
                      busy
                        ? "Stop the current run before starting a new chat"
                        : withHint(`New chat in ${project.name}`, "newChat", keybindingOverrides)
                    }
                    className={cn(HOVER_REVEAL, "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")}
                  >
                    <NotePencilIcon />
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onClick={() => void startNewChat(project.path)} disabled={busy}>
                    <NotePencilIcon /> New chat here
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => void importChat(project.path)}>
                    <UploadSimpleIcon /> Import an existing chat
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => void rpc.request.openProjectIn({ projectDir: project.path, editorId })}>
                    Open in {editorName(editorId)}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => void rpc.request.showInFolder({ path: project.path })}>
                    Reveal in {fileManagerName()}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => void showTerminal(project.path)}>Open terminal here</ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => void navigator.clipboard.writeText(project.path).then(() => showHint("Path copied"))}
                  >
                    Copy path
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => setWorktreesFor(project.path)}>Worktrees…</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onClick={() => setPendingRemoval(project)}>
                    Remove from NativePi
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              {expandedProjects.has(project.path) ? (
                <ChatList
                  projectPath={project.path}
                  query={query}
                  now={now}
                  overrides={keybindingOverrides}
                  onNavigate={overlay ? onClose : undefined}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <WorktreeDialog projectPath={worktreesFor} onClose={() => setWorktreesFor(null)} />
      <ChatSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={overlay ? onClose : undefined}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove this project?"
        description={
          <>
            NativePi will stop tracking <span className="font-medium text-foreground">{pendingRemoval?.name}</span> and
            close its chats. Nothing is deleted from disk — your files and Pi session history stay where they are.
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
      {usageOpen ? <UsageDashboardDialog onClose={() => setUsageOpen(false)} /> : null}
    </LeftSidebar>
  );
}

function ChatList({
  projectPath,
  query,
  now,
  overrides,
  onNavigate,
}: {
  projectPath: string;
  query: string;
  now: number;
  overrides: KeybindingOverrides;
  onNavigate?: () => void;
}) {
  const sessions = useAppStore((s) => s.sessionsByProject[projectPath] ?? EMPTY);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const isNewChat = useAppStore((s) => s.isNewChat);
  const sessionLoadStatus = useAppStore((s) => s.sessionLoadStates[projectPath] ?? "unloaded");
  const conversations = useAppStore((s) => s.conversations);
  const selectProject = useAppStore((s) => s.selectProject);
  const selectChat = useAppStore((s) => s.selectChat);
  const refreshSessions = useAppStore((s) => s.refreshSessions);
  const pinnedChats = useAppStore((s) => s.pinnedChats);
  const groups = groupChats(sessions, pinnedChats, query, activeSessionFile, now);
  const visibleCount = groups.reduce((count, group) => count + group.sessions.length, 0);

  return (
    <div className="flex flex-col gap-0.5">
      {isNewChat && projectPath === activeProjectPath && (
        <div className="rounded-lg bg-sidebar-accent px-3 py-2" role="status">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">New chat</span>
            <span className="text-xs text-muted-foreground">Start a conversation</span>
          </span>
        </div>
      )}
      {sessionLoadStatus === "unloaded" ? (
        <ChatHistoryState
          icon={<ChatCircleDotsIcon />}
          title="Chat history not loaded"
          detail="Preparing this project's chats."
        />
      ) : null}
      {sessionLoadStatus === "loading" ? (
        <ChatHistoryState
          icon={<CircleNotchIcon className="animate-spin" />}
          title="Loading chat history"
          detail="Reading chats from this project."
        />
      ) : null}
      {sessionLoadStatus === "failed" ? (
        <ChatHistoryState
          icon={<WarningCircleIcon className="text-warning" weight="fill" />}
          title="Couldn't load chat history"
          detail="NativePi couldn't read this project's chat list."
          role="alert"
          action={
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-warning hover:bg-warning/15 hover:text-warning"
              onClick={() => void refreshSessions(projectPath)}
            >
              <ArrowClockwiseIcon data-icon="inline-start" />
              Try again
            </Button>
          }
        />
      ) : null}
      {sessionLoadStatus === "loaded" ? (
        <>
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="px-3 pb-0.5 pt-2 text-xs font-medium text-muted-foreground">
                {group.label}
              </h3>
              <div className="flex flex-col gap-0.5">
                {group.sessions.map((session) => {
                  const pinned = pinnedChats.includes(session.path);
                  const running = conversations[session.path]?.running ?? false;
                  const selected = session.path === activeSessionFile && !isNewChat;
                  return (
                    <SessionMenu
                      key={session.path}
                      projectPath={projectPath}
                      session={session}
                      selected={selected}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const select = projectPath === activeProjectPath
                            ? Promise.resolve()
                            : selectProject(projectPath);
                          void select.then(() => selectChat(session.path)).then(onNavigate).catch(() => undefined);
                        }}
                        aria-current={selected ? "page" : undefined}
                        className={cn(
                          "flex min-w-0 flex-1 items-start gap-2 rounded-lg px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                          selected && "text-foreground",
                          running && "text-foreground",
                        )}
                      >
                        {pinned ? (
                          <PushPinIcon className="mt-0.5 shrink-0 text-favorite" weight="fill" aria-hidden />
                        ) : null}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="sidebar-chat-title truncate text-sm font-medium">{chatTitle(session)}</span>
                            {running ? (
                              <span
                                className="sidebar-chat-running inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none text-success"
                                role="status"
                                aria-label="Agent running"
                              >
                                <CircleNotchIcon className="size-3 animate-spin" aria-hidden />
                                <span>Running</span>
                              </span>
                            ) : null}
                          </span>
                          <span className="sidebar-chat-prompt truncate text-xs text-muted-foreground">
                            {session.lastPrompt || "No user prompt"}
                          </span>
                        </span>
                        <span className="sidebar-chat-time shrink-0 pt-0.5 text-xs text-muted-foreground">
                          {hoursAgo(session.modified, now)}
                        </span>
                      </button>
                    </SessionMenu>
                  );
                })}
              </div>
            </section>
          ))}
          {sessions.length === 0 ? (
            <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
              {query.trim()
                ? "No chat titles match"
                : `No chats in this project yet — press ${hintFor("newChat", overrides)} to start one`}
            </p>
          ) : null}
          {sessions.length > 0 && visibleCount === 0 ? (
            <p className="px-2.5 py-1.5 text-xs text-muted-foreground">No chat titles match</p>
          ) : null}
        </>
      ) : null}
    </div>
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
    <div
      role={role}
      className="flex items-start gap-2 rounded-lg border border-dashed border-sidebar-border px-3 py-2.5 text-xs"
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block leading-relaxed text-muted-foreground">{detail}</span>
      </span>
      {action}
    </div>
  );
}

const EMPTY: SessionSummary[] = [];

function hoursAgo(timestamp: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  // The scale keeps climbing: a year-old chat reading "365d" makes the reader
  // do the division that this label exists to do for them.
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}
