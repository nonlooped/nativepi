import { useEffect, useState } from "react";
import { tinykeys } from "tinykeys";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/SlidersHorizontal";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XIcon } from "@phosphor-icons/react/X";
import Sidebar from "./components/Sidebar.tsx";
import Transcript from "./components/Transcript.tsx";
import Composer from "./components/Composer.tsx";
import { ExtensionConversationControls, ExtensionConversationView } from "./components/ExtensionSlots.tsx";
import ContextPane from "./components/ContextPane.tsx";
import DropZone from "./components/DropZone.tsx";
import ExtensionUi from "./components/ExtensionUi.tsx";
import TuiOverlay from "./components/TuiSurface.tsx";
import NativePiWordmark from "./components/NativePiWordmark.tsx";
import ProjectStatus, { PiStartingNotice } from "./components/ProjectStatus.tsx";
import QuitDialog from "./components/QuitDialog.tsx";
import OpenWith from "./components/OpenWith.tsx";
import Settings from "./components/Settings.tsx";
import Toaster from "./components/Toaster.tsx";
import TrustDialog from "./components/TrustDialog.tsx";
import WindowControls from "./components/WindowControls.tsx";
import TerminalDock from "./components/TerminalDock.tsx";
import { activeConversation, useAppStore } from "./lib/store.ts";
import { isRemote } from "./lib/rpc.ts";
import { showHint } from "./lib/toast.tsx";
import { chatTitle } from "./lib/transcript.ts";
import { bindingFor, bindings, withHint } from "./lib/shortcuts.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet.tsx";
import { DRAG_REGION, NO_DRAG_REGION, SCROLLBAR_GUTTER_OFFSET, WINDOW_CONTROLS_CLEARANCE } from "@/lib/utils.ts";
import { useTurnCompletionSignal } from "./lib/completion.ts";
import { useAppearance } from "./lib/appearance.ts";
import { useWorkspaceLayout, type WorkspaceLayout } from "./lib/layout.ts";

export default function App() {
  const init = useAppStore((s) => s.init);
  const ready = useAppStore((s) => s.ready);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const error = useAppStore((s) => activeConversation(s).error);
  const externalChange = useAppStore((s) => activeConversation(s).externalChange);
  const hasConversation = useAppStore((s) => {
    const c = activeConversation(s);
    return c.entries.length > 0 || !!c.streaming || c.pending.length > 0 || c.running;
  });
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const contextPaneOpen = useAppStore((s) => s.contextPaneOpen);
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const [sidebarSheetOpen, setSidebarSheetOpen] = useState(false);
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [extensionView, setExtensionView] = useState<string | null>(null);
  const layout = useWorkspaceLayout();
  const [startupError, setStartupError] = useState<string>();
  const terminalProjects = useAppStore((s) => s.terminalProjects);
  const toggleProjectTerminal = useAppStore((s) => s.toggleTerminal);
  const sidebarDocked = layout !== "compact" && sidebarOpen;
  const contextDocked = layout === "wide" && contextPaneOpen;
  const terminalOpen = activeProjectPath ? terminalProjects.has(activeProjectPath) : false;

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

  useWorkspaceShortcuts(layout, setSidebarSheetOpen, setContextSheetOpen, toggleTerminal);

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
    <div className="relative h-full overflow-hidden bg-background text-foreground">
      {/* Settings is an overlay, not a replacement. It used to early-return over
          the whole app, unmounting the transcript, composer and run status while
          an agent was mid-edit — and its most likely entry point is the
          composer's own "Connect a provider" button. */}
      <div className="h-full" inert={settingsOpen || undefined}>
      <ResizablePanelGroup orientation="horizontal">
        {sidebarDocked ? (
          <Sidebar
            onClose={() => setSidebarOpen(false)}
            onOpenSourceControl={() => {
              if (layout === "wide") {
                if (!contextPaneOpen) toggleContextPane();
              } else setContextSheetOpen(true);
            }}
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
                <ExtensionConversationView active={extensionView} onClose={() => setExtensionView(null)} />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  {hasConversation ? (
                    <Transcript key={activeSessionFile ?? "new"} />
                  ) : (
                    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 pb-8 sm:px-6">
                      <div className="my-auto flex w-full max-w-(--conversation-width) flex-col items-center gap-4">
                        <h1 className="font-heading text-2xl font-semibold tracking-tight">What would you like to work on?</h1>
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
                <TerminalDock key={activeProjectPath} projectDir={activeProjectPath} onMinimize={toggleTerminal} />
              </ResizablePanel>
            </>
          ) : null}
          </ResizablePanelGroup>
        </ResizablePanel>

        {activeProjectPath && contextDocked ? (
          <>
            <ResizableHandle className="hover:bg-ring focus-visible:bg-ring" />
            <ResizablePanel id="context" defaultSize="24%" minSize="18%" maxSize="40%">
              <ContextPane />
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
              onOpenSourceControl={() => setContextSheetOpen(true)}
            />
          </SheetContent>
        </Sheet>
      ) : null}

      {layout !== "wide" && activeProjectPath ? (
        <Sheet open={contextSheetOpen} onOpenChange={setContextSheetOpen}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="w-[min(42rem,92vw)] border-sidebar-border bg-sidebar p-0 sm:max-w-none"
          >
            <SheetTitle className="sr-only">Project context</SheetTitle>
            <SheetDescription className="sr-only">Manage source control, browse project files, and review extension panels.</SheetDescription>
            <ContextPane overlay onClose={() => setContextSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      ) : null}

      {settingsOpen ? (
        <div className="absolute inset-0 z-40 bg-background">
          <Settings />
        </div>
      ) : null}

      <DropZone />
      <Toaster />
      <WindowControls />

      <TrustDialog />
      <QuitDialog />
      <ExtensionUi />
      <TuiOverlay />
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
          This chat changed outside NativePi. Sending is paused so the two copies can't diverge — your draft is safe.
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
  const title = isNewChat ? "New chat" : activeSession ? chatTitle(activeSession) : "Untitled chat";
  const compact = layout === "compact";

  return (
    <header
      className={`${DRAG_REGION} flex h-12 shrink-0 items-center gap-2 pr-2 pl-2 sm:pl-5 ${contextDocked ? "" : WINDOW_CONTROLS_CLEARANCE}`}
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
          // The project half of the breadcrumb is the first thing to go when the
          // header runs out of room: the sidebar the user just came from already
          // says which project is open, and the chat title does not.
          <div className="flex h-full min-w-0 items-center gap-2 text-sm font-medium">
            <span className="hidden min-w-0 items-center gap-1.5 text-muted-foreground sm:flex">
              <FolderIcon className="shrink-0" />
              <span className="truncate">{activeProjectName ?? activeProjectPath}</span>
            </span>
            <span aria-hidden="true" className="hidden shrink-0 text-muted-foreground/50 sm:inline">
              /
            </span>
            <span className="min-w-0 max-w-80 truncate" title={title}>
              {title}
            </span>
          </div>
        ) : (
          <NativePiWordmark className="flex h-full items-center" />
        )}
      </div>
      {activeProjectPath ? (
        <div className={`${NO_DRAG_REGION} flex min-w-0 shrink items-center gap-1 overflow-hidden`}>
          <ExtensionConversationControls active={extensionView} onSelect={onSelectExtensionView} />
        </div>
      ) : null}
      {/* Opens an editor on the machine running Pi, which is not the machine
          holding the phone — and it is the widest control in the header. It
          stays in the sidebar's project menu. */}
      {activeProjectPath && !compact ? <OpenWith projectDir={activeProjectPath} /> : null}
      {activeProjectPath ? <ProjectStatus className={NO_DRAG_REGION} /> : null}
      {activeProjectPath ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleTerminal}
          title={withHint(terminalOpen ? "Hide terminal" : "Show terminal", "toggleTerminal", keybindingOverrides)}
          aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
          aria-pressed={terminalOpen}
          className={NO_DRAG_REGION}
        >
          <TerminalWindowIcon />
        </Button>
      ) : null}
      {activeProjectPath && !contextDocked ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenContext}
          title={withHint("Show source control", "toggleContextPane", keybindingOverrides)}
          aria-label="Show source control"
          // Always false while rendered — the button leaves the header once the
          // pane is docked — but the attribute still tells assistive tech this
          // is a pane toggle, matching the terminal button beside it.
          aria-pressed={false}
          className={NO_DRAG_REGION}
        >
          <SidebarSimpleIcon className="-scale-x-100" />
        </Button>
      ) : null}
    </header>
  );
}

/** Global keyboard shortcuts for the workspace, routed per layout. */
function useWorkspaceShortcuts(
  layout: WorkspaceLayout,
  setSidebarSheetOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setContextSheetOpen: React.Dispatch<React.SetStateAction<boolean>>,
  toggleTerminal: () => void,
) {
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const running = useAppStore((s) => activeConversation(s).running);
  // A new chat has no session file yet, so it binds to whichever Pi the project
  // already has — which is the one mid-turn. The sidebar button has always been
  // disabled for this; the shortcut used to check only the open chat and let the
  // second message land in the first chat's process.
  const projectRunning = useAppStore((s) =>
    Object.values(s.conversations).some((c) => c.projectDir === s.activeProjectPath && c.running),
  );
  const abort = useAppStore((s) => s.abort);
  const openSettings = useAppStore((s) => s.openSettings);
  const closeSettings = useAppStore((s) => s.closeSettings);
  const newChat = useAppStore((s) => s.newChat);
  const importSession = useAppStore((s) => s.importSession);
  const selectAdjacentProject = useAppStore((s) => s.selectAdjacentProject);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleContextPane = useAppStore((s) => s.toggleContextPane);
  const requestJumpToLatest = useAppStore((s) => s.requestJumpToLatest);
  const requestSearchFocus = useAppStore((s) => s.requestSearchFocus);
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
          if (running && (stopTurnBinding !== "Escape" || !(event.target instanceof HTMLInputElement))) {
            event.preventDefault();
            abort();
          }
        },

        toggleSidebar: always(() => {
          if (layout === "compact") setSidebarSheetOpen((open) => !open);
          else toggleSidebar();
        }),

        search: always(() => {
          if (layout === "compact") setSidebarSheetOpen(true);
          else setSidebarOpen(true);
          requestSearchFocus();
        }),

        jumpToLatest: always(requestJumpToLatest),
        nextProject: always(() => void selectAdjacentProject(1)),
        previousProject: always(() => void selectAdjacentProject(-1)),

        toggleContextPane: withProject(() => {
          if (layout === "wide") toggleContextPane();
          else setContextSheetOpen((open) => !open);
        }),

        toggleTerminal: withProject(toggleTerminal),

        newChat: withProject(() => {
          if (projectRunning) {
            showHint("Stop the current run before starting a new chat");
            return;
          }
          closeSettings();
          newChat();
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
    newChat,
    openSettings,
    projectRunning,
    requestJumpToLatest,
    requestSearchFocus,
    running,
    selectAdjacentProject,
    setSidebarOpen,
    setSidebarSheetOpen,
    setContextSheetOpen,
    stopTurnBinding,
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
        className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
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
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-5 pb-12 sm:px-8">
      <div className="my-auto flex max-w-md flex-col items-center gap-6 text-center">
        <NativePiWordmark display />
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Start building with NativePi</h1>
          {/* The first question an existing Pi user has is whether this is a
              second setup to maintain. It is not, and that is worth saying
              before the three steps ask them to connect anything. */}
          <p className="text-sm leading-6 text-body-muted-foreground">
            NativePi is a desktop window onto the Pi coding agent. It uses the Pi you already have — the same
            credentials, settings, and session files, all still on this computer and still usable from the terminal.
          </p>
        </div>

        {/* Three sentences of orientation on the one screen where a
            first-timer has nothing else to read. */}
        <ol className="flex w-full flex-col gap-3 text-left">
          <OnboardingStep index={1} title="Connect a provider">
            Sign in with a subscription or paste an API key. If you have already done this in Pi, skip it.
          </OnboardingStep>
          <OnboardingStep index={2} title="Open a project folder">
            The agent reads and edits files in that folder, and nothing outside it.
          </OnboardingStep>
          <OnboardingStep index={3} title="Describe a task">
            Watch the run, review the files it changed, and steer it while it works.
          </OnboardingStep>
        </ol>

        {/* Same order and same words as the numbered steps above, so the
            buttons read as "do step 1, do step 2" rather than contradicting
            them. Open folder keeps the primary treatment: existing Pi users
            arrive with a credential already stored. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="lg" variant="outline" onClick={() => openSettings()}>
            <SlidersHorizontalIcon data-icon="inline-start" />
            Connect a provider
          </Button>
          <Button size="lg" onClick={() => void addProject()}>
            <FolderOpenIcon data-icon="inline-start" weight="fill" />
            Open folder
          </Button>
        </div>
        {/* The only place the window says it takes a drop before one is in the
            air, and the screen with the most room to say it. */}
        {isRemote ? null : (
          <p className="text-xs text-muted-foreground">Or drag a folder onto this window.</p>
        )}
      </div>
    </div>
  );
}

