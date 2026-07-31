import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderPlusIcon } from "@phosphor-icons/react/FolderPlus";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { ListBulletsIcon } from "@phosphor-icons/react/ListBullets";
import { DotsThreeOutlineIcon } from "@phosphor-icons/react/DotsThreeOutline";
import { NotePencilIcon } from "@phosphor-icons/react/NotePencil";
import { PushPinIcon } from "@phosphor-icons/react/PushPin";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
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
import { Kbd } from "@/components/ui/kbd.tsx";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { HOVER_REVEAL, NO_DRAG_REGION, cn } from "@/lib/utils.ts";
import { editorName } from "@/lib/paths.ts";
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
          placeholder="Search"
          aria-label="Filter chats"
          className={cn(
            "border-0 bg-transparent pl-8 text-base shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:text-base",
            query ? "pr-3" : "pr-16",
          )}
        />
        {query ? null : (
          <Kbd className="pointer-events-none absolute right-5 top-4">{hintFor("search", keybindingOverrides)}</Kbd>
        )}
      </div>

        <div className="flex items-center justify-between px-4 pb-2">
        <span className="text-sm font-medium text-muted-foreground">Projects</span>
        <div className="flex items-center">
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
          return (
          <div key={project.path} className="flex flex-col gap-0.5">
            <ContextMenu>
              <ContextMenuTrigger render={<div className="group flex items-center rounded-lg transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent" />}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleProject(project.path);
                }}
                aria-label={`${expandedProjects.has(project.path) ? "Collapse" : "Expand"} ${project.name}`}
                aria-expanded={expandedProjects.has(project.path)}
                className="shrink-0"
              >
                <CaretDownIcon
                  className={cn("text-muted-foreground transition-transform", !expandedProjects.has(project.path) && "-rotate-90")}
                  weight="bold"
                />
              </Button>
              <button
                type="button"
                onClick={() => void selectProjectAndClose(project.path)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                )}
                title={busy ? `${project.path} — agent running` : project.path}
              >
                <FolderIcon className="shrink-0 text-muted-foreground" />
                <span className="truncate">{project.name}</span>
                {busy ? (
                  <span
                    role="status"
                    aria-label={`Agent running in ${project.name}`}
                    className="ml-auto size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
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
              <Menu>
                <MenuTrigger
                  aria-label={`Project actions for ${project.name}`}
                  title={`Project actions for ${project.name}`}
                  className={cn(
                    HOVER_REVEAL,
                    "mr-1 rounded-md p-1 text-muted-foreground opacity-0 outline-none group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  )}
                >
                  <DotsThreeOutlineIcon weight="fill" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem onClick={() => setWorktreesFor(project.path)}>Worktrees…</MenuItem>
                  <MenuItem onClick={() => setPendingRemoval(project)} className="text-destructive">
                    Remove from NativePi
                  </MenuItem>
                </MenuPopup>
              </Menu>
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
                  Reveal in Explorer
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
  const selectProject = useAppStore((s) => s.selectProject);
  const selectChat = useAppStore((s) => s.selectChat);
  const pinnedChats = useAppStore((s) => s.pinnedChats);
  const groups = groupChats(sessions, pinnedChats, query, activeSessionFile, now);
  const visibleCount = groups.reduce((count, group) => count + group.sessions.length, 0);

  return (
    <div className="flex flex-col gap-0.5">
      {isNewChat && projectPath === activeProjectPath && (
        <div className="rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-semibold">New chat</div>
      )}
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="px-3 pb-0.5 pt-2 text-xs font-medium text-muted-foreground">
            {group.label}
          </h3>
          <div className="flex flex-col gap-0.5">
            {group.sessions.map((session) => {
              const pinned = pinnedChats.includes(session.path);
              return (
                <SessionMenu
                  key={session.path}
                  projectPath={projectPath}
                  session={session}
                  className={cn(
                    HOVER_REVEAL,
                    "mr-1 opacity-0 group-hover/chat:opacity-100 group-focus-within/chat:opacity-100 data-[popup-open]:opacity-100",
                  )}
                  renderRow={(menu) => (
                    <div
                      className={cn(
                        "group/chat flex items-center rounded-lg transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent",
                        session.path === activeSessionFile && !isNewChat && "bg-sidebar-accent",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const select = projectPath === activeProjectPath
                            ? Promise.resolve()
                            : selectProject(projectPath);
                          void select.then(() => selectChat(session.path)).then(onNavigate).catch(() => undefined);
                        }}
                        className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
                      >
                        {pinned ? (
                          <PushPinIcon className="mt-0.5 shrink-0 text-favorite" weight="fill" aria-hidden />
                        ) : null}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium">{chatTitle(session)}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {session.lastPrompt || "No user prompt"}
                          </span>
                        </span>
                        <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                          {hoursAgo(session.modified, now)}
                        </span>
                      </button>
                      {menu}
                    </div>
                  )}
                />
              );
            })}
          </div>
        </section>
      ))}
      {sessions.length === 0 && !isNewChat && (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          No chats yet — press {hintFor("newChat", overrides)} to start one
        </p>
      )}
      {sessions.length > 0 && visibleCount === 0 && (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">No matching chats</p>
      )}
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
