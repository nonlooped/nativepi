import { create } from "zustand";
import { z } from "zod";
import type { PaneStore } from "./store.ts";
import { runtime } from "./store/internals.ts";
import { useWorkspaceEditor } from "./workspaceEditor.ts";

const tabSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("thread"), session: z.string().nullable() }),
  z.object({ kind: z.literal("file"), file: z.string() }),
  z.object({ kind: z.literal("diff"), path: z.string(), staged: z.boolean(), hash: z.string().optional() }),
]);
export type WorkspaceTab = z.infer<typeof tabSchema>;
export const workspaceTabsSchema = z.record(z.string(), z.object({ tabs: z.array(tabSchema).max(200), active: z.string().nullable() }).transform(strip => {
  const tabs = strip.tabs.filter((tab, index) => strip.tabs.findIndex(other => JSON.stringify(other) === JSON.stringify(tab)) === index);
  return { tabs, active: tabs.some(tab => JSON.stringify(tab) === strip.active) ? strip.active : tabs[0] ? JSON.stringify(tabs[0]) : null };
}));
export type WorkspaceTabScopes = z.infer<typeof workspaceTabsSchema>;
export const tabId = (tab: WorkspaceTab) => JSON.stringify(tab);
export const tabScope = (state: ReturnType<PaneStore["getState"]>) => JSON.stringify([state.destination, state.activeProjectPath]);
const empty = { tabs: [] as WorkspaceTab[], active: null as string | null };
const controllers = new Map<PaneStore, ReturnType<typeof createWorkspaceTabs>>();

/** UI locations only. Buffers, drafts, transcripts and Pi runs keep their existing owners. */
export function createWorkspaceTabs(app: PaneStore, initial: WorkspaceTabScopes = {}) {
  const positions = new Map<string, { message: string; offset: number }>();
  const state = create<{ scopes: WorkspaceTabScopes; error?: string }>(() => ({ scopes: initial }));
  const paneId = runtime(app.getState).paneId;
  let applying = false;
  let sequence = 0;
  const current = () => state.getState().scopes[tabScope(app.getState())] ?? empty;
  const selectionKey = () => `${paneId}:${app.getState().activeProjectPath ?? ""}`;
  function update(strip: typeof empty) {
    state.setState(s => ({ scopes: { ...s.scopes, [tabScope(app.getState())]: strip }, error: undefined }));
  }
  function show(tab: WorkspaceTab) {
    const strip = current(), id = tabId(tab);
    if (strip.active === id && strip.tabs.some(t => tabId(t) === id)) return;
    update({ tabs: strip.tabs.some(t => tabId(t) === id) ? strip.tabs : [...strip.tabs, tab], active: id });
  }
  function clearFile() {
    useWorkspaceEditor.getState().cancelOpen(selectionKey());
    useWorkspaceEditor.setState(s => ({ selected: Object.fromEntries(Object.entries(s.selected).filter(([key]) => key !== selectionKey())) }));
  }
  function reflect(tab: WorkspaceTab | undefined) {
    applying = true;
    try {
      if (tab?.kind === "file") {
        app.getState().setSourceControlReview(null);
        const buffer = Object.values(useWorkspaceEditor.getState().buffers).find(b => b.projectDir === app.getState().activeProjectPath && b.file === tab.file);
        if (buffer) useWorkspaceEditor.setState(s => ({ selected: { ...s.selected, [selectionKey()]: buffer.key } }));
        else clearFile();
      } else {
        clearFile();
        app.getState().setSourceControlReview(tab?.kind === "diff" ? { projectDir: app.getState().activeProjectPath!, path: tab.path, staged: tab.staged, ...(tab.hash ? { hash: tab.hash } : {}) } : null);
      }
    } finally { applying = false; }
  }
  async function activate(tab: WorkspaceTab) {
    const project = app.getState().activeProjectPath;
    if (!project) return;
    const request = ++sequence;
    state.setState({ error: undefined });
    useWorkspaceEditor.getState().cancelOpen(selectionKey());
    show(tab); reflect(tab);
    try {
      if (tab.kind === "thread") {
        if (tab.session !== app.getState().activeSessionFile) {
          if (tab.session) await app.getState().selectChat(tab.session, project);
          else app.getState().newChat();
        }
      } else if (tab.kind === "file") {
        const buffer = Object.values(useWorkspaceEditor.getState().buffers).find(b => b.projectDir === project && b.file === tab.file);
        if (!buffer) await useWorkspaceEditor.getState().open(project, tab.file, undefined, paneId);
      }
    } catch (error) {
      if (sequence === request) state.setState({ error: `Could not open this tab. ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  function record(promote = false) {
    const s = app.getState();
    if (!s.ready || !s.activeProjectPath) return;
    const tab: WorkspaceTab = { kind: "thread", session: s.activeSessionFile };
    const strip = current();
    // The first sent message promotes the existing new-chat tab in place.
    if (promote && tab.session && strip.active === tabId({ kind: "thread", session: null })) {
      update({ tabs: strip.tabs.filter(t => tabId(t) !== tabId(tab)).map(t => t.kind === "thread" && t.session === null ? tab : t), active: tabId(tab) });
    } else show(tab);
    reflect(tab);
  }
  const unsubscribe = app.subscribe((next, previous) => {
    if (applying) return;
    if (next.destination !== previous.destination || next.activeProjectPath !== previous.activeProjectPath) {
      ++sequence;
      state.setState({ error: undefined });
      useWorkspaceEditor.getState().cancelOpen(`${paneId}:${previous.activeProjectPath ?? ""}`);
      return; // Folder entry is followed by a session selection; avoid its intermediate route.
    }
    if (next.selectionVersion !== previous.selectionVersion || next.activeSessionFile !== previous.activeSessionFile || next.ready !== previous.ready) {
      ++sequence; record(next.selectionVersion === previous.selectionVersion && previous.activeSessionFile === null);
    } else if (next.sourceControlReview !== previous.sourceControlReview) {
      const review = next.sourceControlReview;
      if (review?.projectDir === next.activeProjectPath) {
        show({ kind: "diff", path: review.path, staged: review.staged, ...(review.hash ? { hash: review.hash } : {}) });
        applying = true; try { clearFile(); } finally { applying = false; }
      } else if (!review && current().tabs.find(t => tabId(t) === current().active)?.kind === "diff") record();
    }
  });
  const stopEditor = useWorkspaceEditor.subscribe((next, previous) => {
    if (applying || !app.getState().activeProjectPath) return;
    const key = next.selected[selectionKey()];
    if (key && key !== previous.selected[selectionKey()] && next.buffers[key]) {
      show({ kind: "file", file: next.buffers[key]!.file });
      applying = true; try { app.getState().setSourceControlReview(null); } finally { applying = false; }
    }
  });
  if (!initial[tabScope(app.getState())]) { const s = app.getState(); if (s.ready && s.activeProjectPath) show({ kind: "thread", session: s.activeSessionFile }); }
  else {
    const selected = current().tabs.find(t => tabId(t) === current().active);
    if (selected) void activate(selected); else reflect(undefined);
  }
  function bufferFor(tab: WorkspaceTab) {
    return tab.kind === "file" ? Object.values(useWorkspaceEditor.getState().buffers).find(b => b.projectDir === app.getState().activeProjectPath && b.file === tab.file) : undefined;
  }
  function shared(tab: WorkspaceTab) {
    return [...controllers.entries()].some(([other, controller]) => other !== app && Object.entries(controller.state.getState().scopes).some(([scope, strip]) => scope === tabScope(app.getState()) && strip.tabs.some(t => tabId(t) === tabId(tab))));
  }
  function needsDiscard(tab: WorkspaceTab) {
    const b = bufferFor(tab); return !!b && b.text !== b.saved && !shared(tab);
  }
  async function close(tab: WorkspaceTab, discard = false) {
    const strip = current(), id = tabId(tab), index = strip.tabs.findIndex(t => tabId(t) === id);
    if (index < 0) return;
    const buffer = bufferFor(tab);
    if (buffer?.saving || (needsDiscard(tab) && !discard)) return;
    const tabs = strip.tabs.filter(t => tabId(t) !== id);
    const next = strip.active === id ? tabs[index] ?? tabs[index - 1] : tabs.find(t => tabId(t) === strip.active);
    ++sequence;
    update({ tabs, active: next ? tabId(next) : null });
    if (buffer && !shared(tab)) {
      applying = true; try { useWorkspaceEditor.getState().close(buffer.key); } finally { applying = false; }
    }
    if (strip.active === id) { if (next) await activate(next); else reflect(undefined); }
  }
  return { state, positions, current, activate, close, needsDiscard, record, dispose: () => {
    unsubscribe(); stopEditor();
    for (const key of Object.keys(useWorkspaceEditor.getState().loading)) if (key.startsWith(`${paneId}:`)) useWorkspaceEditor.getState().cancelOpen(key);
    useWorkspaceEditor.setState(s => ({ selected: Object.fromEntries(Object.entries(s.selected).filter(([key]) => !key.startsWith(`${paneId}:`))) }));
  } };
}
export function paneWorkspaceTabs(app: PaneStore, initial?: WorkspaceTabScopes) {
  let controller = controllers.get(app);
  if (!controller) { controller = createWorkspaceTabs(app, initial); controllers.set(app, controller); return controller; }
  if (initial) { controller.state.setState({ scopes: initial }); const strip = controller.current(); const selected = strip.tabs.find(tab => tabId(tab) === strip.active); if (selected) void controller.activate(selected); }
  return controller;
}
export function releaseWorkspaceTabs(app: PaneStore) {
  controllers.get(app)?.dispose(); controllers.delete(app);
}

/** Project navigation restores its UI location; choosing a specific sidebar chat still opens that chat. */
export function rememberWorkspaceTab(get: PaneStore["getState"], project: string) {
  const entry = [...controllers].find(([app]) => app.getState === get);
  if (!entry) return () => {};
  const [app, controller] = entry;
  const strip = controller.state.getState().scopes[JSON.stringify([get().destination, project])];
  const tab = strip?.tabs.find(tab => tabId(tab) === strip.active);
  return () => { if (tab && app.getState().activeProjectPath === project) void controller.activate(tab); };
}
