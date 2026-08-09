import { useEffect, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { FolderPlusIcon } from "@phosphor-icons/react/FolderPlus";
import { FunnelSimpleIcon } from "@phosphor-icons/react/FunnelSimple";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { NotePencilIcon } from "@phosphor-icons/react/NotePencil";
import { PushPinIcon } from "@phosphor-icons/react/PushPin";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XIcon } from "@phosphor-icons/react/X";
import type { Project } from "../../shared/rpc-schema.ts";
import type { SessionSummary } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { timeAgo } from "../lib/format.ts";
import { chatTitle } from "../lib/transcript.ts";
import { hintFor, withHint, type KeybindingOverrides } from "../lib/shortcuts.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";
import SessionMenu from "./SessionMenu.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
import ChatSearchDialog from "./ChatSearchDialog.tsx";
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
import { countMatches, groupChats } from "../lib/chatOrganization.ts";

export default function Sidebar({
  onClose,
  onOpenSourceControl,
  overlay = false,
}: {
  onClose: () => void;
  onOpenSourceControl: () => void;
  overlay?: boolean;
}) {
  const projects = useAppStore((s) => s.projects);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const projectChatCounts = useAppStore(
    useShallow((s) =>
      s.projects.map((project) =>
        s.sessionLoadStates[project.path] === "loaded" ? s.sessionsByProject[project.path]?.length ?? 0 : null,
      ),
    ),
  );
  const addProject = useAppStore((s) => s.addProject);
  const openSettings = useAppStore((s) => s.openSettings);
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
  const changedFileCount = useAppStore((s) => s.git?.files.length ?? 0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now);
  const [pendingRemoval, setPendingRemoval] = useState<Project | null>(null);
  const [worktreesFor, setWorktreesFor] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState(() => new Set(activeProjectPath ? [activeProjectPath] : []));

  // The project can also become active from outside this pane — the next/previous
  // project shortcuts, a dropped folder, a search result. Expanding only in this
  // component's own click handler left those routes selecting a project whose
  // chats stayed shut.
  useEffect(() => {
    if (activeProjectPath) expandProject(activeProjectPath);
  }, [activeProjectPath]);

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

  const activeBusy = activeProjectPath
    ? projectBusyStates[projects.findIndex((project) => project.path === activeProjectPath)] ?? false
    : false;

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
      {/* Keep the primary chat action dominant while source control and search
          remain one-click workspace destinations. */}
      <div className={cn("flex flex-col gap-1.5 px-2 pb-2", NO_DRAG_REGION)}>
        <div className="flex items-center gap-1">
          <Button
            size="lg"
            className="min-w-0 flex-1 justify-start"
            onClick={() => activeProjectPath && void startNewChat(activeProjectPath)}
            disabled={!activeProjectPath || activeBusy}
            title={activeProjectPath ? withHint("New chat", "newChat", keybindingOverrides) : "Open a project to start a chat"}
          >
            <NotePencilIcon data-icon="inline-start" />
            New chat
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            className="relative"
            onClick={() => {
              onOpenSourceControl();
              if (overlay) onClose();
            }}
            aria-label="Open source control"
            title={withHint("Open source control", "toggleContextPane", keybindingOverrides)}
          >
            <GitBranchIcon />
            {changedFileCount > 0 ? (
              <span className="absolute -right-1 -bottom-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] font-semibold leading-4 text-primary-foreground tabular-nums">
                {changedFileCount > 99 ? "99+" : changedFileCount}
              </span>
            ) : null}
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            onClick={() => setSearchOpen(true)}
            aria-label="Search all chats and messages"
            title={withHint("Search chats and messages", "search", keybindingOverrides)}
          >
            <MagnifyingGlassIcon />
          </Button>
        </div>
        <div className="relative">
          <FunnelSimpleIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter chats"
            aria-label="Filter chat titles in the sidebar"
            className="h-8 rounded-md pl-7 pr-7 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn("flex h-7 items-center gap-0.5 px-2", NO_DRAG_REGION)}>
        <span className="px-1 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
          Projects
        </span>
        <span className="flex-1" />
        {activeProjectPath ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void importSession().then(() => overlay && onClose())}
            aria-label="Import an existing chat"
            title={withHint("Import an existing chat", "importChat", keybindingOverrides)}
          >
            <UploadSimpleIcon />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void addProjectAndClose()}
          aria-label="Add project"
          title="Add a project folder"
        >
          <FolderPlusIcon />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {projects.length === 0 && (
          <button
            type="button"
            onClick={() => void addProjectAndClose()}
            className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:border-sidebar-ring focus-visible:ring-2 focus-visible:ring-sidebar-ring/30 focus-visible:outline-none"
          >
            <FolderPlusIcon className="shrink-0" />
            Open your first folder
          </button>
        )}
        {projects.map((project, index) => {
          const busy = projectBusyStates[index] ?? false;
          const active = project.path === activeProjectPath;
          const expanded = expandedProjects.has(project.path);
          const chatCount = projectChatCounts[index] ?? null;
          return (
            <div key={project.path} className="flex flex-col">
              <ContextMenu>
                <ContextMenuTrigger
                  render={
                    <div
                      className={cn(
                        "group flex h-8 items-center rounded-md pr-1 transition-colors hover:bg-sidebar-accent/65 focus-within:bg-sidebar-accent/65",
                        active && "bg-sidebar-accent/50",
                      )}
                    />
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleProject(project.path);
                    }}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name}`}
                    aria-expanded={expanded}
                    className="ml-0.5 shrink-0 hover:bg-transparent"
                  >
                    <CaretDownIcon
                      className={cn(
                        "text-muted-foreground transition-transform",
                        !expanded && "-rotate-90",
                        active && "text-foreground",
                      )}
                      weight="bold"
                    />
                  </Button>
                  <button
                    type="button"
                    onClick={() => void selectProjectAndClose(project.path)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left text-[0.8125rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                      active ? "font-semibold text-sidebar-accent-foreground" : "font-medium",
                    )}
                    title={busy ? `${project.path} — agent running` : project.path}
                  >
                    {expanded ? (
                      <FolderOpenIcon
                        className={cn("size-3.5 shrink-0", active ? "text-foreground" : "text-muted-foreground")}
                        weight={active ? "fill" : "regular"}
                      />
                    ) : (
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{project.name}</span>
                    {busy ? (
                      <span
                        role="status"
                        aria-label={`Agent running in ${project.name}`}
                        className="size-1.5 shrink-0 animate-pulse rounded-full bg-active ring-2 ring-active/20"
                      />
                    ) : null}
                  </button>
                  {chatCount !== null ? (
                    <span
                      className="shrink-0 px-1 text-[0.6875rem] tabular-nums text-muted-foreground"
                      title={`${chatCount} ${chatCount === 1 ? "chat" : "chats"}`}
                    >
                      {chatCount}
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void startNewChat(project.path)}
                    disabled={busy}
                    aria-label={`New chat in ${project.name}`}
                    title={
                      busy
                        ? "Stop the current run before starting a new chat"
                        : withHint(`New chat in ${project.name}`, "newChat", keybindingOverrides)
                    }
                    className={cn(
                      HOVER_REVEAL,
                      "shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                    )}
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
              {/* A 220px sidebar cannot afford a deep nest: every pixel spent on
                  indent comes straight out of the chat title. One hairline rail
                  under the folder icon is enough to read as "inside". */}
              {expanded ? (
                <div
                  className={cn(
                    "ml-3 mt-0.5 mb-1 border-l pl-1.5",
                    active ? "border-sidebar-ring/50" : "border-sidebar-border",
                  )}
                >
                  <ChatList
                    projectPath={project.path}
                    query={query}
                    now={now}
                    overrides={keybindingOverrides}
                    onNavigate={overlay ? onClose : undefined}
                  />
                </div>
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
  // The open chat stays on the list whatever the query, so the count of rows on
  // screen is not the count of matches. Saying nothing matched while one row is
  // visible reads as a bug; saying nothing while the query matched nothing reads
  // as one too.
  const matchCount = countMatches(sessions, query);

  return (
    <div className="flex flex-col gap-0.5">
      {isNewChat && projectPath === activeProjectPath && (
        <div className="flex items-center gap-1.5 rounded-md bg-sidebar-accent px-1.5 py-1.5" role="status">
          <NotePencilIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-[0.8125rem] font-medium">New chat</span>
        </div>
      )}
      {sessionLoadStatus === "unloaded" ? (
        <ChatHistoryState
          icon={<ChatCircleDotsIcon />}
          title="Preparing chat history"
          detail="NativePi has not read this project's chats yet."
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
          title="Unable to load chat history"
          detail="Check that the project's Pi sessions are available, then try again."
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
            <section key={group.label} aria-label={group.label} className="first:[&>h3]:pt-1">
              <h3 className="px-1.5 pb-1 pt-2.5 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground/80">
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
                          "flex min-w-0 flex-1 items-start gap-1.5 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                          (selected || running) && "text-foreground",
                        )}
                      >
                        {pinned ? (
                          <PushPinIcon className="mt-px size-3.5 shrink-0 text-favorite" weight="fill" aria-hidden />
                        ) : null}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span
                            className={cn(
                              "sidebar-chat-title truncate text-[0.8125rem] leading-5",
                              selected ? "font-semibold" : "font-medium",
                            )}
                          >
                            {chatTitle(session)}
                          </span>
                          <span className="sidebar-chat-prompt truncate text-xs text-muted-foreground">
                            {session.lastPrompt || "No user prompt"}
                          </span>
                        </span>
                        {/* A spinner rather than a "Running" pill: at the pane's
                            narrow floor the pill was wider than the title it
                            was reporting on. */}
                        {running ? (
                          <CircleNotchIcon
                            className="mt-1 size-3 shrink-0 animate-spin text-active"
                            role="status"
                            aria-label="Agent running"
                          />
                        ) : null}
                        <span className="sidebar-chat-time shrink-0 pt-0.5 text-[0.6875rem] leading-5 tabular-nums text-muted-foreground">
                          {timeAgo(session.modified, now)}
                        </span>
                      </button>
                    </SessionMenu>
                  );
                })}
              </div>
            </section>
          ))}
          {sessions.length === 0 ? (
            <p className="px-1.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
              {`No chats yet. Press ${hintFor("newChat", overrides)} to start one.`}
            </p>
          ) : query.trim() && matchCount === 0 ? (
            <p className="px-1.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
              No chat titles match this filter. Search messages instead.
            </p>
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
      className="flex flex-wrap items-start gap-2 rounded-md border border-dashed border-sidebar-border px-2 py-2 text-xs"
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


