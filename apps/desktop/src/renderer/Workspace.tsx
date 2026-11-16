import ConnectionNotice from "./components/ConnectionNotice.tsx";
import { createKeybindingsHandler } from "tinykeys";
import { bindings } from "./lib/shortcuts.ts";
import { workspaceShortcutsBlocked } from "./lib/shortcutContext.ts";
import { focusedPaneStore } from "./lib/store.ts";
import { Fragment, useEffect, useRef, useState } from "react";
import { readPaneArrangement, restorePaneSelection } from "./lib/paneArrangement.ts";
import App, { ConversationSurface } from "./App.tsx";
import { WorkspacePanesContext } from "./lib/workspacePanes.ts";
import WorkspacePaneMenu from "./components/WorkspacePaneMenu.tsx";
import { usePaneStore, activeConversation } from "./lib/store.ts";
import { chatTitle } from "./lib/transcript.ts";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { ChatCircleIcon } from "@phosphor-icons/react/ChatCircle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu.tsx";
import { Button } from "./components/ui/button.tsx";
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from "./components/ui/resizable.tsx";
import { createPaneStore, focusPaneStore, primaryStore, PaneStoreContext, releasePaneStore, type PaneStore } from "./lib/store.ts";
import { PaneWidthContext } from "./lib/layout.ts";
import { useTurnCompletionSignal } from "./lib/completion.ts";
import { useAppearance } from "./lib/appearance.ts";
import { runtime } from "./lib/store/internals.ts";
import { dirtyWorkspaceFiles, useWorkspaceEditor } from "./lib/workspaceEditor.ts";
import { toast } from "sonner";

const sharedPaneFields = ["reopenLastProject", "commitMessageModel", "collapsedChatFolders", "drafts", "preferences", "projects", "favoriteModels", "keybindingOverrides", "chatFolders", "chatFolderBySession", "chatExtensions", "sidebarOpen", "sidebarWidth", "sidebarScope", "contextPaneOpen", "contextPaneWidth", "contextPaneTab", "terminalHeight", "terminalProjects"] as const;
const restored = readPaneArrangement();
const initializations = new WeakMap<PaneStore, Promise<void>>();
function initializePane(store: PaneStore) {
  let pending = initializations.get(store);
  if (!pending) { pending = store.getState().init(); initializations.set(store, pending); }
  return pending;
}
const paneIdentity = (store: PaneStore) => runtime(store.getState).paneId;
export default function Workspace() {
  const initialized = useRef(false);
  const [titles, setTitles] = useState<string[]>([]);
  const [stores, setStores] = useState<PaneStore[]>([primaryStore]);
  const [startupError, setStartupError] = useState<string>();
  const [splitting, setSplitting] = useState(false);
  const [active, setActive] = useState(0);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(restored?.orientation ?? "horizontal");
  const [width, setWidth] = useState(window.innerWidth);
  const [paneElement, setPaneElement] = useState<HTMLDivElement | null>(null);
  const [areaWidth, setAreaWidth] = useState(window.innerWidth);
  useEffect(() => {
    if (!paneElement) return;
    const observer = new ResizeObserver(entries => { if (entries[0]) setAreaWidth(entries[0].contentRect.width); });
    observer.observe(paneElement); return () => observer.disconnect();
  }, [paneElement]);
  const sizes = useRef(restored?.sizes);
  const current = useRef({ stores, active, orientation });
  useEffect(() => { current.current = { stores, active, orientation }; save(); }, [stores, active, orientation]);
  useEffect(() => () => { for (const store of current.current.stores) if (store !== primaryStore) releasePaneStore(store); }, []);
  useTurnCompletionSignal(); useAppearance();
  useEffect(() => useWorkspaceEditor.subscribe(() => {
    void import("./lib/rpc.ts").then(({ rpc }) => rpc.request.workspaceDirty({ files: dirtyWorkspaceFiles().map(b => b.file) }));
  }), []);
  const save = () => {
    if (!initialized.current) return;
    const value = current.current;
    try { localStorage.setItem("nativepi-conversation-panes", JSON.stringify({ orientation: value.orientation, active: value.active, sizes: sizes.current, panes: value.stores.map(store => ({ project: store.getState().activeProjectPath, session: store.getState().activeSessionFile })) })); } catch { console.warn("Could not save conversation pane layout."); }
  };
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener("resize", update);
    const warn = (event: BeforeUnloadEvent) => { if (dirtyWorkspaceFiles().length) { event.preventDefault(); event.returnValue = ""; } save(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("beforeunload", warn); };
  }, []);
  useEffect(() => {
    let mirroring = false;
    setTitles(stores.map(paneTitle));
    return stores.map(store => store.subscribe((next, previous) => {
      if (next.activeProjectPath !== previous.activeProjectPath || next.activeSessionFile !== previous.activeSessionFile) save();
      if (next.activeSessionFile !== previous.activeSessionFile || next.sessionsByProject !== previous.sessionsByProject || activeConversation(next).sessionName !== activeConversation(previous).sessionName) setTitles(stores.map(paneTitle));
      if (mirroring) return;
      mirroring = true;
      // NativePi-owned shared settings/drafts are shared. Selection, model,
      // attachments, conversation view state and extension UI stay in their pane.
      const patch: Partial<ReturnType<PaneStore["getState"]>> = {};
      for (const key of sharedPaneFields) {
        if (next[key] !== previous[key]) Object.assign(patch, { [key]: next[key] });
      }
      if (Object.keys(patch).length) for (const other of new Set([primaryStore, ...stores])) if (other !== store) other.setState(patch);
      mirroring = false;
    })).reduce((dispose, stop) => () => { dispose(); stop(); }, () => {});
  }, [stores]);
  useEffect(() => {

    let disposed = false;
    void (async () => {
      await initializePane(primaryStore);
      if (disposed) return;
      await restorePaneSelection(primaryStore, restored?.panes[0]);
      const extras: PaneStore[] = [];
      for (const pane of restored?.panes.slice(1) ?? []) {
        const store = createPaneStore(); await store.getState().init();
        await restorePaneSelection(store, pane);
        extras.push(store);
      }
      if (disposed) { extras.forEach(releasePaneStore); return; }
      initialized.current = true;
      setStores([primaryStore, ...extras]);
      const selected = Math.min(restored?.active ?? 0, extras.length); setActive(selected); focusPaneStore([primaryStore, ...extras][selected]!);
    })().catch(error => { if (!disposed) setStartupError(String(error)); });
    return () => { disposed = true; };
  }, []);
  const focus = (index: number) => { focusPaneStore(stores[index]!); setActive(index); };
  const split = async (direction: "horizontal" | "vertical" = orientation) => {
    if (splitting || stores.length >= 3) return;
    setSplitting(true);
    const store = createPaneStore();
    try {
      await store.getState().init();
      const source = stores[active]!.getState();
      const candidate = (source.sessionsByProject[source.activeProjectPath ?? ""] ?? []).find(session => !stores.some(s => s.getState().activeSessionFile === session.path));
      if (candidate && source.activeProjectPath) await store.getState().selectChat(candidate.path, source.activeProjectPath);
      else if (source.activeProjectPath) await store.getState().selectProject(source.activeProjectPath);
      store.setState(Object.fromEntries(sharedPaneFields.map(key => [key, source[key]])));
      setOrientation(direction); setStores([...stores, store]); focusPaneStore(store); setActive(stores.length);
    } catch (error) { releasePaneStore(store); toast.error(String(error)); } finally { setSplitting(false); }
  };
  const narrow = width < 760 || (orientation === "horizontal" && areaWidth < stores.length * 420);
  if (startupError) return <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 bg-background p-6 text-foreground"><div className="w-full max-w-lg"><ConnectionNotice startupError={startupError} /></div>{!window.nativepi?.service && <Button variant="ghost" onClick={() => location.reload()}>Reload workspace</Button>}</div>;
  return <div className="flex h-full min-h-0 flex-col bg-background text-foreground" onKeyDownCapture={event => {
    if (workspaceShortcutsBlocked()) return;
    const move = (direction: number) => {
      const next = (active + direction + stores.length) % stores.length; focus(next);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-workspace-pane="${next}"] [data-composer-input]`)?.focus());
    };
    createKeybindingsHandler(bindings({
      nextPane: e => { e.preventDefault(); move(1); },
      previousPane: e => { e.preventDefault(); move(-1); },
      splitConversation: e => { e.preventDefault(); void split(); },
    }, focusedPaneStore().getState().keybindingOverrides))(event.nativeEvent);
  }}>
    <WorkspacePanesContext value={{
      count: stores.length, active, activePaneId: paneIdentity(stores[active]!), narrow, orientation, splitting, select: focus,
      split: direction => void split(direction), arrange: setOrientation,
      close: index => { const store = stores[index]!; releasePaneStore(store); const remaining = stores.filter(s => s !== store); setStores(remaining); setActive(0); focusPaneStore(remaining[0]!); },
      unsplit: () => { const keep = stores[active]!; stores.filter(s => s !== keep).forEach(releasePaneStore); setStores([keep]); focusPaneStore(keep); setActive(0); },
      titles: stores.map((store, index) => titles[index] ?? paneTitle(store)),
    }}>
      <PaneStoreContext value={stores[active]!}>
        <App initialize={false} renderWorkspace={onStart => <div ref={setPaneElement} className="min-h-0 flex-1">
          <ResizablePanelGroup orientation={orientation} defaultLayout={sizes.current} onLayoutChanged={(layout, meta) => { if (meta.isUserInteraction && !narrow) { sizes.current = layout; save(); } }}>
            {stores.map((store, index) => <Fragment key={paneIdentity(store)}>
              {index > 0 && !narrow ? <ResizableHandle withHandle /> : null}
              <ResizablePanel id={`pane-${index}`} minSize={narrow ? 0 : orientation === "horizontal" ? "320px" : "180px"} defaultSize={narrow ? (index === active ? "100%" : "0%") : undefined} style={narrow ? { flexGrow: index === active ? 1 : 0, flexBasis: 0 } : undefined} className={narrow && index !== active ? "hidden" : ""}>
                <Pane store={store} index={index} active={index === active} multiple={stores.length > 1} onFocus={() => focus(index)} onStart={onStart} />
              </ResizablePanel>
            </Fragment>)}
          </ResizablePanelGroup>
        </div>} />
      </PaneStoreContext>
    </WorkspacePanesContext>
  </div>;
}
function paneTitle(store: PaneStore) {
  const state = store.getState();
  const session = (state.sessionsByProject[state.activeProjectPath ?? ""] ?? []).find(session => session.path === state.activeSessionFile);
  return session ? chatTitle(session) : activeConversation(state).sessionName || (state.isNewChat ? "New chat" : "Conversation");
}
function Pane({ store, index, active, multiple, onFocus, onStart }: { store: PaneStore; index: number; active: boolean; multiple: boolean; onFocus: () => void; onStart: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => { const observer = new ResizeObserver(entries => { if (entries[0]) setWidth(entries[0].contentRect.width); }); if (element.current) observer.observe(element.current); return () => observer.disconnect(); }, []);
  return <PaneStoreContext value={store}><PaneWidthContext value={width}>
    <div ref={element} data-workspace-pane={index} data-pane-active={active} className="@container/conversation flex h-full min-h-0 min-w-0 flex-col" onPointerDownCapture={onFocus} onFocusCapture={onFocus} onDragOverCapture={onFocus}>
      {multiple ? <ConversationPaneHeader active={active} /> : null}
      <ConversationSurface onStart={onStart} />
    </div>
  </PaneWidthContext></PaneStoreContext>;
}
function ConversationPaneHeader({ active }: { active: boolean }) {
  const useAppStore = usePaneStore();
  const project = useAppStore(s => s.activeProjectPath);
  const selected = useAppStore(s => s.activeSessionFile);
  const sessions = useAppStore(s => s.sessionsByProject[project ?? ""]);
  const name = useAppStore(s => activeConversation(s).sessionName);
  const isNewChat = useAppStore(s => s.isNewChat);
  const running = useAppStore(s => activeConversation(s).running);
  const file = useWorkspaceEditor(s => s.selected[`${runtime(useAppStore.getState).paneId}:${project}`]);
  if (file) return null;
  const session = sessions?.find(session => session.path === selected);
  const title = session ? chatTitle(session) : name || (isNewChat ? "New chat" : "Conversation");
  return <div className={`flex h-10 shrink-0 items-center gap-2 border-b px-3 ${active ? "border-border bg-muted/30" : "border-border/40"}`}>
    <ChatCircleIcon className="shrink-0 text-muted-foreground" />
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start px-1" title={title} />}><span className="truncate text-sm font-medium">{title}</span><CaretDownIcon data-icon="inline-end" className="text-muted-foreground" /></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {(sessions ?? []).map(session => <DropdownMenuItem key={session.path} onClick={() => void useAppStore.getState().selectChat(session.path, project!)}><span className="truncate">{chatTitle(session)}</span></DropdownMenuItem>)}
        {!sessions?.length ? <DropdownMenuItem disabled>Choose a chat from the sidebar</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
    {running ? <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Pi is running" /> : null}
    <WorkspacePaneMenu contextual />
  </div>;
}
