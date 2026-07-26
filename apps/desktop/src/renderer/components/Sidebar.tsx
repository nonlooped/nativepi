import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderPlusIcon } from "@phosphor-icons/react/FolderPlus";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { DotsThreeOutlineIcon } from "@phosphor-icons/react/DotsThreeOutline";
import { NotePencilIcon } from "@phosphor-icons/react/NotePencil";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import type { Project } from "../../shared/rpc-schema.ts";
import type { SessionSummary } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { chatTitle } from "../lib/transcript.ts";
import { hintFor, withHint } from "../lib/shortcuts.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";
import SessionMenu from "./SessionMenu.tsx";
import LeftSidebar from "./LeftSidebar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu.tsx";
import { NO_DRAG_REGION, cn } from "@/lib/utils.ts";

export default function Sidebar({ onClose, overlay = false }: { onClose: () => void; overlay?: boolean }) {
  const projects = useAppStore((s) => s.projects);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const addProject = useAppStore((s) => s.addProject);
  const openSettings = useAppStore((s) => s.openSettings);
  const selectProject = useAppStore((s) => s.selectProject);
  const removeProject = useAppStore((s) => s.removeProject);
  const projectBusyStates = useAppStore(
    useShallow((s) => s.projects.map((project) => s.conversations[project.path]?.running ?? false)),
  );
  const importSession = useAppStore((s) => s.importSession);
  const searchFocusRequest = useAppStore((s) => s.searchFocusRequest);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now);
  const [pendingRemoval, setPendingRemoval] = useState<Project | null>(null);
  const [worktreesFor, setWorktreesFor] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchFocusRequest > 0) searchRef.current?.focus();
  }, [searchFocusRequest]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function selectProjectAndClose(path: string) {
    await selectProject(path);
    if (overlay) onClose();
  }

  async function addProjectAndClose() {
    await addProject();
    if (overlay) onClose();
  }

  async function startNewChat(path: string) {
    if (path !== activeProjectPath) await selectProject(path);
    useAppStore.getState().newChat();
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
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search chats"
          className="border-0 bg-transparent pl-8 pr-16 text-base shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:text-base"
        />
        <Kbd className="pointer-events-none absolute right-5 top-4">{hintFor("search")}</Kbd>
      </div>

      <div className="flex items-center justify-between px-4 pb-2">
        <span className="text-sm font-medium text-muted-foreground">Projects</span>
        <div className="flex items-center">
          {activeProjectPath ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void importSession().then(() => overlay && onClose())}
              title={withHint("Import an existing chat", "importChat")}
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
            <div className="group flex items-center rounded-lg transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent">
              <button
                type="button"
                onClick={() => void selectProjectAndClose(project.path)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                )}
                title={busy ? `${project.path} — agent running` : project.path}
              >
                {project.path === activeProjectPath ? (
                  <CaretDownIcon className="shrink-0 text-muted-foreground" weight="bold" />
                ) : null}
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
                    : withHint(`New chat in ${project.name}`, "newChat")
                }
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <NotePencilIcon />
              </Button>
              <Menu>
                <MenuTrigger
                  aria-label={`Project actions for ${project.name}`}
                  title={`Project actions for ${project.name}`}
                  className="mr-1 rounded-md p-1 text-muted-foreground opacity-0 outline-none group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
            </div>
            {project.path === activeProjectPath ? <ChatList projectPath={project.path} query={query} now={now} onNavigate={overlay ? onClose : undefined} /> : null}
          </div>
          );
        })}
      </div>

      <WorktreeDialog projectPath={worktreesFor} onClose={() => setWorktreesFor(null)} />

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
  onNavigate,
}: {
  projectPath: string;
  query: string;
  now: number;
  onNavigate?: () => void;
}) {
  const sessions = useAppStore((s) => s.sessionsByProject[projectPath] ?? EMPTY);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const isNewChat = useAppStore((s) => s.isNewChat);
  const selectChat = useAppStore((s) => s.selectChat);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSessions = normalizedQuery
    ? sessions.filter((session) => chatTitle(session).toLocaleLowerCase().includes(normalizedQuery))
    : sessions;

  return (
    <div className="flex flex-col gap-0.5">
      {isNewChat && (
        <div className="rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-semibold">New chat</div>
      )}
      {visibleSessions.map((session) => (
        <div
          key={session.path}
          className={cn(
            "group/chat flex items-center rounded-lg transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent",
            session.path === activeSessionFile && !isNewChat && "bg-sidebar-accent",
          )}
        >
          <button
            type="button"
            onClick={() => void selectChat(session.path).then(onNavigate).catch(() => undefined)}
            className="flex min-w-0 flex-1 flex-row items-center gap-3 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{chatTitle(session)}</span>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">{hoursAgo(session.modified, now)}</span>
          </button>
          <SessionMenu session={session} className="mr-1 opacity-0 group-hover/chat:opacity-100 group-focus-within/chat:opacity-100 data-[popup-open]:opacity-100" />
        </div>
      ))}
      {sessions.length === 0 && !isNewChat && (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">No chats yet</p>
      )}
      {sessions.length > 0 && visibleSessions.length === 0 && (
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
  return `${Math.floor(hours / 24)}d`;
}
