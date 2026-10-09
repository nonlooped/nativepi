import { lazy, Suspense, useEffect, useState } from "react";
import { tinykeys } from "tinykeys";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { GitDiffIcon } from "@phosphor-icons/react/GitDiff";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/SlidersHorizontal";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { WifiHighIcon } from "@phosphor-icons/react/WifiHigh";
import { XIcon } from "@phosphor-icons/react/X";
import Sidebar from "./components/Sidebar.tsx";
import Composer from "./components/Composer.tsx";
import { ExtensionConversationControls, ExtensionConversationView } from "./components/ExtensionSlots.tsx";
import DropZone from "./components/DropZone.tsx";
import ExtensionUi from "./components/ExtensionUi.tsx";
import NativePiWordmark from "./components/NativePiWordmark.tsx";
import ProjectStatus, { PiStartingNotice } from "./components/ProjectStatus.tsx";
import QuitDialog from "./components/QuitDialog.tsx";
import Settings from "./components/Settings.tsx";
import Toaster from "./components/Toaster.tsx";
import TrustDialog from "./components/TrustDialog.tsx";
import WindowControls from "./components/WindowControls.tsx";
import BrandIcon from "./components/BrandIcon.tsx";
import { activeConversation, useAppStore } from "./lib/store.ts";
import { startNewChatFlow } from "./lib/newChat.ts";
import { providerIconName } from "./lib/providerIcons.ts";
import { isRemote } from "./lib/rpc.ts";
import { chatTitle } from "./lib/transcript.ts";
import { bindingFor, bindings, hintFor, withHint } from "./lib/shortcuts.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useCollapsiblePanel,
} from "@/components/ui/resizable.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet.tsx";
import { DRAG_REGION, NO_DRAG_REGION, SCROLLBAR_GUTTER_OFFSET, TRAFFIC_LIGHTS_CLEARANCE, WINDOW_CONTROLS_CLEARANCE, cn } from "@/lib/utils.ts";
import { useTurnCompletionSignal } from "./lib/completion.ts";
import { useAppearance } from "./lib/appearance.ts";
import { useWorkspaceLayout, type WorkspaceLayout } from "./lib/layout.ts";

const ChatSearchDialog = lazy(() => import("./components/ChatSearchDialog.tsx"));
const NewChatProjectDialog = lazy(() => import("./components/NewChatProjectDialog.tsx"));
const ContextPane = lazy(() => import("./components/ContextPane.tsx"));
const TerminalDock = lazy(() => import("./components/TerminalDock.tsx"));
const Transcript = lazy(() => import("./components/Transcript.tsx"));
const TuiOverlay = lazy(() => import("./components/TuiSurface.tsx"));

export default function App() {
  const init = useAppStore((s) => s.init);
  const ready = useAppStore((s) => s.ready);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeProjectName = useAppStore(
    (s) => s.projects.find((project) => project.path === s.activeProjectPath)?.name,
  );
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const error = useAppStore((s) => activeConversation(s).error);
  const externalChange = useAppStore((s) => activeConversation(s).externalChange);
  const hasConversation = useAppStore((s) => {
    const c = activeConversation(s);
    return c.entries.length > 0 || !!c.streaming || c.pending.length > 0 || c.running;
  });
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const closeSettings = useAppStore((s) => s.closeSettings);
  const contextPaneOpen = useAppStore((s) => s.contextPaneOpen);
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const [sidebarSheetOpen, setSidebarSheetOpen] = useState(false);
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newChatProjectOpen, setNewChatProjectOpen] = useState(false);
  const [extensionView, setExtensionView] = useState<string | null>(null);
  const layout = useWorkspaceLayout();
  const [startupError, setStartupError] = useState<string>();
  const terminalProjects = useAppStore((s) => s.terminalProjects);
  const hasTuiOverlay = useAppStore((s) => s.extSurfaces.some((surface) => surface.placement === "overlay"));
  const toggleProjectTerminal = useAppStore((s) => s.toggleTerminal);
  const sidebarDocked = layout !== "compact" && sidebarOpen;
  const contextDocked = layout === "wide" && contextPaneOpen;
  const contextPanelRef = useCollapsiblePanel(contextPaneOpen, layout === "wide" ? activeProjectPath : null);
  const terminalOpen = activeProjectPath ? terminalProjects.has(activeProjectPath) : false;
  const branchMenuRequested = useAppStore((s) => s.branchMenuRequested);

  const toggleTerminal = () => {
    if (!activeProjectPath) return;
    toggleProjectTerminal(activeProjectPath);
  };

  useEffect(() => {
    void init().catch((error: unknown) => {
      setStartupError(error instanceof Error ? error.message : String(error));
    });
  }, [init]);

  useTurnCompletionSignal();
  useAppearance();

  useEffect(() => {
    setSidebarSheetOpen(false);
    setContextSheetOpen(false);
  }, [layout]);

  useEffect(() => setExtensionView(null), [activeProjectPath, activeSessionFile]);

  useEffect(() => {
    if (branchMenuRequested && layout !== "wide") setContextSheetOpen(true);
  }, [branchMenuRequested, layout]);

  useWorkspaceShortcuts(
    layout,
    setSidebarSheetOpen,
    setContextSheetOpen,
    setSearchOpen,
    setNewChatProjectOpen,
    toggleTerminal,
  );

  if (startupError || !ready) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden bg-background text-foreground">
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center" role={startupError ? "alert" : "status"}>
          <NativePiWordmark display />
          <p className="text-sm text-body-muted-foreground">
            {startupError ?? "Starting NativePi…"}
          </p>
          {startupError ? (
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          ) : null}
        </div>
        <WindowControls />
        <QuitDialog />
      </div>
    );
  }

  return (
    <div className="app-viewport relative h-full overflow-hidden bg-background text-foreground">
      {/* Settings is an overlay, not a replacement. It used to early-return over
          the whole app, unmounting the transcript, composer and run status while
          an agent was mid-edit — and its most likely entry point is the
          composer's own "Connect a provider" button. */}
      <div className="h-full" inert={settingsOpen || undefined}>
      <ResizablePanelGroup orientation="horizontal">
        {layout !== "compact" ? (
          <Sidebar
            open={sidebarOpen}
            layoutKey={contextDocked}
            onClose={() => setSidebarOpen(false)}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenNewChat={() => startNewChatFlow(() => setNewChatProjectOpen(true))}
          />
        ) : null}
        <ResizablePanel id="conversation" minSize="35%">
          <ResizablePanelGroup orientation="vertical">
          <ResizablePanel id="workspace" minSize="35%">
          {/* `relative` anchors `PiStartingNotice`, which floats under the
              header rather than taking a row and shifting the conversation. */}
          <main className="conversation-shell relative flex h-full min-h-0 min-w-0 flex-col">
            <WorkspaceHeader
              layout={layout}
              sidebarDocked={sidebarDocked}
              contextDocked={contextDocked}
              terminalOpen={terminalOpen}
              extensionView={extensionView}
              onSelectExtensionView={setExtensionView}
              onOpenSidebar={() => (layout === "compact" ? setSidebarSheetOpen(true) : setSidebarOpen(true))}
              onOpenContext={() => (layout === "wide" ? toggleContextPane() : setContextSheetOpen(true))}
              onToggleTerminal={toggleTerminal}
            />
            <PiStartingNotice />

            {activeProjectPath ? (
              extensionView ? (
                <Suspense fallback={<SurfaceLoading label="Loading extension view…" />}>
                  <ExtensionConversationView active={extensionView} onClose={() => setExtensionView(null)} />
                </Suspense>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  {hasConversation ? (
                    <Suspense fallback={<SurfaceLoading label="Loading conversation…" />}>
                      <Transcript key={activeSessionFile ?? "new"} />
                    </Suspense>
                  ) : (
                    <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
                      <div className="mx-auto my-auto w-full max-w-(--conversation-width)">
                        <div className="mb-5 max-w-xl px-1 text-left">
                          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <FolderOpenIcon className="shrink-0" weight="fill" />
                            Ready to work
                          </p>
                          <h1 className="text-balance font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                            {activeProjectName ?? "New project"}
                          </h1>
                          <p className="mt-2 text-pretty text-sm leading-6 text-body-muted-foreground">
                            Tell Pi what you want to understand, fix, or build.
                          </p>
                        </div>
                        <Composer prominent />
                      </div>
                    </div>
                  )}
                  {externalChange ? <ExternalChangeNotice /> : null}
                  {error ? <ErrorBanner /> : null}
                  {hasConversation ? <Composer /> : null}
                </div>
              )
            ) : (
              <WelcomeScreen />
            )}
          </main>
          </ResizablePanel>
          {activeProjectPath && terminalOpen ? (
            <>
              <ResizableHandle className="hover:bg-ring focus-visible:bg-ring" />
              <ResizablePanel id={`terminal-${activeProjectPath}`} defaultSize="34%" minSize="15%" maxSize="65%">
                <Suspense fallback={<SurfaceLoading label="Loading terminal…" />}>
                  <TerminalDock key={activeProjectPath} projectDir={activeProjectPath} onMinimize={toggleTerminal} />
                </Suspense>
              </ResizablePanel>
            </>
          ) : null}
          </ResizablePanelGroup>
        </ResizablePanel>

        {activeProjectPath && layout === "wide" ? (
          <>
            <ResizableHandle
              disabled={!contextPaneOpen}
              className={cn(
                "transition-[opacity,background-color] duration-200 ease-out hover:bg-ring focus-visible:bg-ring",
                !contextPaneOpen && "w-0 opacity-0 after:hidden",
              )}
            />
            <ResizablePanel
              id="context"
              panelRef={contextPanelRef}
              collapsible
              collapsedSize="0%"
              defaultSize="28%"
              minSize="20%"
              maxSize="45%"
              data-pane-motion="right"
              inert={!contextPaneOpen || undefined}
              className={cn(
                "h-full transition-[opacity,translate] duration-200 ease-out",
                contextPaneOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0",
              )}
              onResize={(size, _id, previousSize) => {
                if (size.inPixels === 0 && previousSize && previousSize.inPixels > 0 && contextPaneOpen) {
                  toggleContextPane();
                }
              }}
            >
              <Suspense fallback={<SurfaceLoading label="Loading project context…" />}>
                <ContextPane />
              </Suspense>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
      </div>

      {layout === "compact" ? (
        <Sheet open={sidebarSheetOpen} onOpenChange={setSidebarSheetOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[min(22rem,88vw)] border-sidebar-border bg-sidebar p-0"
          >
            <SheetTitle className="sr-only">Projects and chats</SheetTitle>
            <SheetDescription className="sr-only">Open a project or chat in NativePi.</SheetDescription>
            <Sidebar
              overlay
              onClose={() => setSidebarSheetOpen(false)}
              onOpenSearch={() => {
                setSidebarSheetOpen(false);
                setSearchOpen(true);
              }}
              onOpenNewChat={() => {
                setSidebarSheetOpen(false);
                startNewChatFlow(() => setNewChatProjectOpen(true));
              }}
            />
          </SheetContent>
        </Sheet>
      ) : null}

      {layout !== "wide" && activeProjectPath ? (
        <Sheet open={contextSheetOpen} onOpenChange={setContextSheetOpen}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="w-[min(28rem,92vw)] border-sidebar-border bg-sidebar p-0 sm:max-w-none"
          >
            <SheetTitle className="sr-only">Project context</SheetTitle>
            <SheetDescription className="sr-only">Browse files and changes, and review extension panels.</SheetDescription>
            {contextSheetOpen ? (
              <Suspense fallback={<SurfaceLoading label="Loading project context…" />}>
                <ContextPane onClose={() => setContextSheetOpen(false)} />
              </Suspense>
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}

      {searchOpen ? (
        <Suspense fallback={null}>
          <ChatSearchDialog
            open
            onOpenChange={setSearchOpen}
            onNavigate={() => setSidebarSheetOpen(false)}
          />
        </Suspense>
      ) : null}

      {newChatProjectOpen ? (
        <Suspense fallback={null}>
          <NewChatProjectDialog
            open
            onOpenChange={setNewChatProjectOpen}
            onNavigate={() => setSidebarSheetOpen(false)}
          />
        </Suspense>
      ) : null}

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-40 bg-overlay p-0 sm:p-5"
          onClick={closeSettings}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            className="settings-viewport h-full w-full overflow-hidden bg-background sm:rounded-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <Settings />
          </div>
        </div>
      ) : null}

      <DropZone />
      <Toaster />
      <WindowControls />

      <TrustDialog />
      <QuitDialog />
      <ExtensionUi />
      {hasTuiOverlay ? (
        <Suspense fallback={null}>
          <TuiOverlay />
        </Suspense>
      ) : null}
    </div>
  );
}

function SurfaceLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background text-sm text-body-muted-foreground" role="status">
      {label}
    </div>
  );
}

function OnboardingStep({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground"
      >
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm leading-6 text-body-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

function ExternalChangeNotice() {
  const reload = useAppStore((s) => s.reloadActiveSession);
  const cloneChat = useAppStore((s) => s.cloneChat);
  const sessionFile = useAppStore((s) => s.activeSessionFile);

  return (
    <div className={`mx-auto w-full max-w-(--conversation-width) px-4 pb-2 ${SCROLLBAR_GUTTER_OFFSET}`}>
      <div
        role="alert"
        className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning"
      >
        <WarningCircleIcon weight="fill" className="shrink-0" />
        <p className="min-w-0 flex-1 break-words">
          This chat changed outside NativePi. Sending is paused so the two copies can't diverge. Your draft is safe.
        </p>
        <Button size="sm" variant="ghost" className="shrink-0 text-warning hover:bg-warning/15 hover:text-warning" onClick={() => void reload()}>
          <ArrowClockwiseIcon data-icon="inline-start" />
          Reload
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-warning hover:bg-warning/15 hover:text-warning"
          onClick={() => sessionFile && void cloneChat(sessionFile)}
        >
          <CopyIcon data-icon="inline-start" />
          Duplicate
        </Button>
      </div>
    </div>
  );
}

/** The drag-region title bar: project, chat title, and pane toggles. */
function WorkspaceHeader({
  layout,
  sidebarDocked,
  contextDocked,
  terminalOpen,
  extensionView,
  onSelectExtensionView,
  onOpenSidebar,
  onOpenContext,
  onToggleTerminal,
}: {
  layout: WorkspaceLayout;
  sidebarDocked: boolean;
  contextDocked: boolean;
  terminalOpen: boolean;
  extensionView: string | null;
  onSelectExtensionView: (key: string | null) => void;
  onOpenSidebar: () => void;
  onOpenContext: () => void;
  onToggleTerminal: () => void;
}) {
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const isNewChat = useAppStore((s) => s.isNewChat);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const activeProjectName = useAppStore(
    (s) => s.projects.find((project) => project.path === s.activeProjectPath)?.name,
  );
  const activeSession = useAppStore((s) =>
    s.activeProjectPath
      ? s.sessionsByProject[s.activeProjectPath]?.find((session) => session.path === s.activeSessionFile)
      : undefined,
  );
  const selectedProvider = useAppStore((s) => s.model?.provider);
  const provider = selectedProvider ?? activeSession?.providers[0];
  const title = isNewChat ? "New chat" : activeSession ? chatTitle(activeSession) : "Untitled chat";
  const compact = layout === "compact";
  const sharing = useAppStore((s) => s.accessHandoffs.length > 0);
  const openSettings = useAppStore((s) => s.openSettings);

  return (
    <header
      className={`${DRAG_REGION} flex h-12 shrink-0 items-center gap-2 border-b border-border/70 pr-2 pl-2 sm:pl-5 ${sidebarDocked ? "" : TRAFFIC_LIGHTS_CLEARANCE} ${contextDocked ? "" : WINDOW_CONTROLS_CLEARANCE}`}
    >
      {!sidebarDocked ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenSidebar}
          title={withHint("Open sidebar", "toggleSidebar", keybindingOverrides)}
          aria-label="Open sidebar"
          className={NO_DRAG_REGION}
        >
          <SidebarSimpleIcon />
        </Button>
      ) : null}
      <div className="min-w-0 flex-1 self-stretch">
        {activeProjectPath ? (
          <div className="flex h-full min-w-0 items-center gap-2 text-sm font-medium">
            {provider ? (
              <span className="inline-flex shrink-0 text-muted-foreground" title={`Model provider: ${provider}`}>
                <BrandIcon name={providerIconName(provider)} size={16} />
              </span>
            ) : null}
            {activeSession && !isNewChat ? (
              <h1 className="flex min-w-0">
                <ChatTitle sessionPath={activeSession.path} title={title} />
              </h1>
            ) : (
              <span className="min-w-0 max-w-80 truncate" title={title}>
                {title}
              </span>
            )}
            <span className="hidden min-w-0 truncate text-muted-foreground sm:inline">
              {activeProjectName ?? activeProjectPath}
            </span>
          </div>
        ) : (
          <NativePiWordmark className="flex h-full items-center" />
        )}
      </div>
      {activeProjectPath ? (
        <div className={cn(NO_DRAG_REGION, "hidden min-w-0 shrink items-center gap-1 min-[480px]:flex")}>
          <ExtensionConversationControls active={extensionView} onSelect={onSelectExtensionView} />
        </div>
      ) : null}
      {sharing ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openSettings("Access")}
          title="A remote access link was shared from this window"
          className={NO_DRAG_REGION}
        >
          <WifiHighIcon data-icon="inline-start" />
          Sharing
        </Button>
      ) : null}
      {activeProjectPath ? <ProjectStatus compact={compact} className={NO_DRAG_REGION} /> : null}
      {activeProjectPath ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleTerminal}
          title={withHint(terminalOpen ? "Hide terminal" : "Show terminal", "toggleTerminal", keybindingOverrides)}
          aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
          aria-pressed={terminalOpen}
          className={cn(NO_DRAG_REGION, "hidden min-[480px]:flex")}
        >
          <TerminalWindowIcon />
        </Button>
      ) : null}
      {activeProjectPath ? (
        <div className={cn(NO_DRAG_REGION, "min-[480px]:hidden")}>
          <HeaderCompactOverflow
            terminalOpen={terminalOpen}
            onToggleTerminal={onToggleTerminal}
            extensionView={extensionView}
            onSelectExtensionView={onSelectExtensionView}
          />
        </div>
      ) : null}
      {activeProjectPath && !contextDocked ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenContext}
          title={withHint("Show files and changes", "toggleContextPane", keybindingOverrides)}
          aria-label="Show files and changes"
          // Always false while rendered — the button leaves the header once the
          // pane is docked — but the attribute still tells assistive tech this
          // is a pane toggle, matching the terminal button beside it.
          aria-pressed={false}
          className={NO_DRAG_REGION}
        >
          <GitDiffIcon />
        </Button>
      ) : null}
    </header>
  );
}

function ChatTitle({ sessionPath, title }: { sessionPath: string; title: string }) {
  const renameChat = useAppStore((s) => s.renameChat);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setName(title);
  }, [editing, title]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === title) {
      setEditing(false);
      setName(title);
      return;
    }
    setSaving(true);
    try {
      const res = await renameChat(sessionPath, trimmed);
      if (res.ok) setEditing(false);
      else setName(title);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Rename chat"
        aria-label={`Rename ${title}`}
        onClick={() => setEditing(true)}
        className={cn(
          NO_DRAG_REGION,
          "min-w-0 max-w-80 truncate rounded-md px-1 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {title}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={name}
      disabled={saving}
      aria-label="Chat name"
      onChange={(event) => setName(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void save();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setName(title);
          setEditing(false);
        }
      }}
      className={cn(NO_DRAG_REGION, "h-7 max-w-80 min-w-32 px-2 text-sm")}
    />
  );
}

function HeaderCompactOverflow({
  terminalOpen,
  onToggleTerminal,
  extensionView,
  onSelectExtensionView,
}: {
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  extensionView: string | null;
  onSelectExtensionView: (key: string | null) => void;
}) {
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const extRenderers = useAppStore((s) => s.extRenderers);
  const extensionViews = extRenderers.flatMap((ext) =>
    (ext.renderer.conversationViews ?? []).map((view) => ({
      ext,
      view,
      key: `${ext.id}:${view.id}`,
    })),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="More workspace actions" title="More workspace actions" />}
      >
        <DotsThreeIcon weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {extensionViews.length > 0
          ? extensionViews.map(({ view, key }) => (
              <DropdownMenuItem
                key={key}
                onClick={() => onSelectExtensionView(extensionView === key ? null : key)}
                className="gap-2"
              >
                {view.label}
                {extensionView === key ? <span className="ml-auto text-xs text-success">Active</span> : null}
              </DropdownMenuItem>
            ))
          : null}
        {extensionViews.length > 0 ? <div className="my-1 h-px bg-border/50" aria-hidden /> : null}
        <DropdownMenuItem onClick={onToggleTerminal} className="gap-2">
          <TerminalWindowIcon />
          {terminalOpen ? "Hide terminal" : "Show terminal"}
          <span className="ml-auto text-xs text-muted-foreground">{hintFor("toggleTerminal", keybindingOverrides)}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Global keyboard shortcuts for the workspace, routed per layout. */
function useWorkspaceShortcuts(
  layout: WorkspaceLayout,
  setSidebarSheetOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setContextSheetOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setNewChatProjectOpen: React.Dispatch<React.SetStateAction<boolean>>,
  toggleTerminal: () => void,
) {
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const running = useAppStore((s) => activeConversation(s).running);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const abort = useAppStore((s) => s.abort);
  const openSettings = useAppStore((s) => s.openSettings);
  const closeSettings = useAppStore((s) => s.closeSettings);
  const importSession = useAppStore((s) => s.importSession);
  const selectAdjacentProject = useAppStore((s) => s.selectAdjacentProject);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const requestJumpToLatest = useAppStore((s) => s.requestJumpToLatest);
  const cycleThinkingLevel = useAppStore((s) => s.cycleThinkingLevel);
  const keybindingOverrides = useAppStore((s) => s.keybindingOverrides);
  const stopTurnBinding = bindingFor("stopTurn", keybindingOverrides);

  useEffect(() => {
    /** Shortcuts that need a project open do nothing without one. */
    const withProject = (run: () => void) => (event: KeyboardEvent) => {
      if (!activeProjectPath) return;
      event.preventDefault();
      run();
    };
    const always = (run: () => void) => (event: KeyboardEvent) => {
      event.preventDefault();
      run();
    };

    return tinykeys(
      window,
      bindings({
        openSettings: always(openSettings),

        stopTurn: (event) => {
          // Escape belongs to a single-line field first — it clears or closes
          // whatever the user is typing in. The composer is a textarea, so
          // stopping a run while writing the next message still works.
          const modalOpen = settingsOpen || document.querySelector('[role="dialog"]') !== null;
          if (!modalOpen && running && (stopTurnBinding !== "Escape" || !(event.target instanceof HTMLInputElement))) {
            event.preventDefault();
            abort();
          }
        },

        toggleSidebar: always(() => {
          if (layout === "compact") setSidebarSheetOpen((open) => !open);
          else toggleSidebar();
        }),

        search: always(() => {
          setSidebarSheetOpen(false);
          setSearchOpen(true);
        }),

        jumpToLatest: always(requestJumpToLatest),
        nextProject: always(() => void selectAdjacentProject(1)),
        previousProject: always(() => void selectAdjacentProject(-1)),

        toggleContextPane: withProject(() => {
          if (layout === "wide") toggleContextPane();
          else setContextSheetOpen((open) => !open);
        }),

        toggleTerminal: withProject(toggleTerminal),

        newChat: always(() => {
          closeSettings();
          setSidebarSheetOpen(false);
          startNewChatFlow(() => setNewChatProjectOpen(true));
        }),

        importChat: withProject(() => {
          closeSettings();
          void importSession();
        }),

        cycleThinking: withProject(() => void cycleThinkingLevel()),
      }, keybindingOverrides),
      // tinykeys otherwise ignores keystrokes originating in inputs and
      // textareas, which would silence every one of these inside the composer.
      // Only IME composition is filtered: mid-composition keys belong to the
      // candidate window, not to NativePi.
      { ignore: (event) => (event as KeyboardEvent).isComposing },
    );
  }, [
    abort,
    activeProjectPath,
    closeSettings,
    cycleThinkingLevel,
    importSession,
    keybindingOverrides,
    layout,
    openSettings,
    requestJumpToLatest,
    running,
    selectAdjacentProject,
    setSearchOpen,
    setNewChatProjectOpen,
    setSidebarSheetOpen,
    setContextSheetOpen,
    stopTurnBinding,
    settingsOpen,
    toggleContextPane,
    toggleTerminal,
    toggleSidebar,
  ]);
}

function ErrorBanner() {
  const error = useAppStore((s) => activeConversation(s).error);
  const errorRecovery = useAppStore((s) => activeConversation(s).errorRecovery);
  const restartPi = useAppStore((s) => s.restartPi);
  const send = useAppStore((s) => s.send);
  const clearError = useAppStore((s) => s.clearError);

  return (
    <div className={`mx-auto w-full max-w-(--conversation-width) px-4 pb-2 ${SCROLLBAR_GUTTER_OFFSET}`}>
      <div
        role="alert"
        className="flex flex-wrap items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
      >
        <WarningCircleIcon weight="fill" className="mt-0.5 shrink-0" />
        {/* A plain-language headline first: the raw message below is often a
            long Pi stderr string, and nobody should have to parse one to learn
            which kind of bad news this is. */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {errorRecovery === "retrySend"
              ? "Your message didn't send"
              : errorRecovery === "restartPi"
                ? "Pi stopped unexpectedly"
                : "This turn hit an error"}
          </p>
          <p className="mt-0.5 break-words text-body-muted-foreground">{error}</p>
        </div>
        {/* The action is whatever actually recovers from *this*
            failure. Retry used to be offered unconditionally and
            did nothing at all on the Pi-error path, because that
            path never restores a draft for send() to read. */}
        {errorRecovery === "retrySend" ? (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-destructive hover:bg-destructive/15 hover:text-destructive"
            onClick={() => void send()}
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            Retry
          </Button>
        ) : errorRecovery === "restartPi" ? (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-destructive hover:bg-destructive/15 hover:text-destructive"
            onClick={() => void restartPi()}
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            Restart Pi
          </Button>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          className="shrink-0 text-destructive hover:bg-destructive/15 hover:text-destructive"
          onClick={clearError}
          title="Dismiss"
          aria-label="Dismiss error"
        >
          <XIcon />
        </Button>
      </div>
    </div>
  );
}

function WelcomeScreen() {
  const addProject = useAppStore((s) => s.addProject);
  const openSettings = useAppStore((s) => s.openSettings);

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-8">
      <div className="mx-auto my-auto grid w-full max-w-4xl items-center gap-10 md:grid-cols-[minmax(0,1.08fr)_minmax(18rem,0.92fr)] md:gap-16">
        <section className="flex min-w-0 flex-col items-start text-left">
          <NativePiWordmark display />
          <h1 className="mt-7 max-w-xl text-balance font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Pi, in a focused desktop workspace.
          </h1>
          <p className="mt-3 max-w-[58ch] text-pretty text-sm leading-6 text-body-muted-foreground">
            Open a local project, direct the agent, and review every change without giving up your Pi setup.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-start gap-2">
            <Button size="lg" onClick={() => void addProject()}>
              <FolderOpenIcon data-icon="inline-start" weight="fill" />
              Open folder
            </Button>
            <Button size="lg" variant="outline" onClick={() => openSettings("Providers")}>
              <SlidersHorizontalIcon data-icon="inline-start" />
              Connect a provider
            </Button>
          </div>
          {isRemote ? null : (
            <p className="mt-3 text-xs text-muted-foreground">You can also drag a folder onto this window.</p>
          )}
        </section>

        <section className="border-t border-border/70 pt-7 md:border-t-0 md:border-l md:py-2 md:pl-10">
          <h2 className="font-heading text-sm font-semibold">Start with your existing Pi setup</h2>
          <ol className="mt-5 flex w-full flex-col gap-5 text-left">
            <OnboardingStep index={1} title="Connect a provider">
              Sign in with a subscription or add an API key. Existing Pi credentials are already available.
            </OnboardingStep>
            <OnboardingStep index={2} title="Open a project folder">
              Pi starts in that folder with the same settings, sessions, skills, and extensions.
            </OnboardingStep>
            <OnboardingStep index={3} title="Describe the work">
              Follow the run, inspect changed files, and steer Pi while it works.
            </OnboardingStep>
          </ol>
        </section>
      </div>
    </div>
  );
}

