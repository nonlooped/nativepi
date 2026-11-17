import { create } from "zustand";
import { z } from "zod";
import type { PaneStore } from "./store.ts";
import { getLastChat, runtime } from "./store/internals.ts";
import { useWorkspaceEditor } from "./workspaceEditor.ts";

const legacyTabSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("thread"), session: z.string().nullable() }),
  z.object({ kind: z.literal("file"), file: z.string() }),
  z.object({ kind: z.literal("diff"), path: z.string(), staged: z.boolean(), hash: z.string().optional() }),
]);
const tabSchema = z.discriminatedUnion("kind", [
  legacyTabSchema.options[0].extend({ projectDir: z.string() }),
  legacyTabSchema.options[1].extend({ projectDir: z.string() }),
  legacyTabSchema.options[2].extend({ projectDir: z.string() }),
]);
export type WorkspaceTab = z.infer<typeof tabSchema>;
export function tabId(tab: WorkspaceTab): string {
  return JSON.stringify(tab.kind === "thread" ? [tab.kind, tab.projectDir, tab.session] : tab.kind === "file" ? [tab.kind, tab.projectDir, tab.file] : [tab.kind, tab.projectDir, tab.path, tab.staged, tab.hash ?? null]);
}
const stripSchema = z.object({ tabs: z.array(tabSchema).max(200), active: z.string().nullable() }).transform(strip => {
  const tabs = strip.tabs.filter((tab, index) => strip.tabs.findIndex(other => tabId(other) === tabId(tab)) === index);
  return { tabs, active: tabs.some(tab => tabId(tab) === strip.active) ? strip.active : tabs[0] ? tabId(tabs[0]) : null };
});
const scopesSchema = z.object({ work: stripSchema.optional(), chat: stripSchema.optional() }).strict();
const legacyScopesSchema = z.record(z.string(), z.object({ tabs: z.array(legacyTabSchema).max(200), active: z.string().nullable() })).transform((scopes, context) => {
  const result: z.infer<typeof scopesSchema> = {};
  for (const [key, strip] of Object.entries(scopes)) {
    let scope: unknown;
    try { scope = JSON.parse(key); } catch { context.addIssue({ code: "custom", message: "Invalid workspace tab scope" }); return z.NEVER; }
    const parsed = z.tuple([z.enum(["work", "chat"]), z.string()]).safeParse(scope);
    if (!parsed.success) { context.addIssue({ code: "custom", message: "Invalid workspace tab scope" }); return z.NEVER; }
    const [destination, projectDir] = parsed.data;
    const current = result[destination] ?? { tabs: [], active: null };
    const tabs = strip.tabs.map(tab => ({ ...tab, projectDir }));
    const selected = strip.tabs.find(tab => JSON.stringify(tab) === strip.active);
    result[destination] = { tabs: [...current.tabs, ...tabs], active: selected ? tabId({ ...selected, projectDir }) : current.active };
  }
  return result;
}).pipe(scopesSchema);
/** Migrate the first tab layout without dropping any project's open locations. */
export const workspaceTabsSchema = z.union([scopesSchema, legacyScopesSchema]);
export type WorkspaceTabScopes = z.infer<typeof workspaceTabsSchema>;
export const tabScope = (state: ReturnType<PaneStore["getState"]>) => state.destination;
const empty = { tabs: [] as WorkspaceTab[], active: null as string | null };
const controllers = new Map<PaneStore, ReturnType<typeof createWorkspaceTabs>>();

/** Each destination has one pane-local strip, independent of its selected folder. */
export function createWorkspaceTabs(app: PaneStore, initial: WorkspaceTabScopes = {}) {
  const positions = new Map<string, { message: string; offset: number }>();
  const diffPositions = new Map<string, Map<number, { top: number; left: number }>>();
  const state = create<{ scopes: WorkspaceTabScopes; error?: string }>(() => ({ scopes: initial }));
  const paneId = runtime(app.getState).paneId;
  let applying = false;
  let sequence = 0;
  const current = () => state.getState().scopes[tabScope(app.getState())] ?? empty;
  const selectionKey = (project = app.getState().activeProjectPath) => `${paneId}:${project ?? ""}`;
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
  function bufferFor(tab: WorkspaceTab) {
    return tab.kind === "file" ? Object.values(useWorkspaceEditor.getState().buffers).find(b => b.projectDir === tab.projectDir && b.file === tab.file) : undefined;
  }
  function reflect(tab: WorkspaceTab | undefined) {
    const previous = applying; applying = true;
    try {
      if (tab?.kind === "file") {
        app.getState().setSourceControlReview(null);
        const buffer = bufferFor(tab);
        if (buffer) useWorkspaceEditor.setState(s => ({ selected: { ...s.selected, [selectionKey(tab.projectDir)]: buffer.key } }));
        else clearFile();
      } else {
        clearFile();
        app.getState().setSourceControlReview(tab?.kind === "diff" ? { projectDir: tab.projectDir, path: tab.path, staged: tab.staged, ...(tab.hash ? { hash: tab.hash } : {}) } : null);
      }
    } finally { applying = previous; }
  }
  async function activate(tab: WorkspaceTab) {
    const request = ++sequence;
    state.setState({ error: undefined });
    useWorkspaceEditor.getState().cancelOpen(selectionKey());
    try {
      let navigation: Promise<void> | undefined;
      applying = true;
      try {
        const s = app.getState();
        if (tab.kind === "thread") {
          if (tab.projectDir !== s.activeProjectPath || tab.session !== s.activeSessionFile) navigation = tab.session ? s.selectChat(tab.session, tab.projectDir) : s.newChatIn(tab.projectDir);
        } else if (tab.projectDir !== s.activeProjectPath) {
          // Reuse Pi's existing folder/session navigation. Do not create a
          // synthetic conversation tab just to reach a file in another folder.
          const session = getLastChat(app.getState, tab.projectDir) ?? current().tabs.filter(t => t.kind === "thread").find(t => t.projectDir === tab.projectDir && t.session)?.session;
          navigation = session ? s.selectChat(session, tab.projectDir) : s.newChatIn(tab.projectDir);
        }
        show(tab); reflect(tab);
      } finally { applying = false; }
      // Folder/session selection happens synchronously; hydration is guarded by
      // the existing store. Keep navigation errors observed while opening a file.
      const settled = navigation?.catch(error => { if (request === sequence) state.setState({ error: `Could not open this tab. ${String(error)}` }); });
      if (tab.kind === "file" && !bufferFor(tab)) await useWorkspaceEditor.getState().open(tab.projectDir, tab.file, undefined, paneId);
      await settled;
    } catch (error) {
      if (sequence === request) state.setState({ error: `Could not open this tab. ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  function record(promote = false) {
    const s = app.getState();
    if (!s.ready || !s.activeProjectPath) return;
    const tab: WorkspaceTab = { kind: "thread", projectDir: s.activeProjectPath, session: s.activeSessionFile };
    const strip = current();
    if (promote && tab.session && strip.active === tabId({ kind: "thread", projectDir: tab.projectDir, session: null })) {
      update({ tabs: strip.tabs.filter(t => tabId(t) !== tabId(tab)).map(t => t.kind === "thread" && t.projectDir === tab.projectDir && t.session === null ? tab : t), active: tabId(tab) });
    } else show(tab);
    reflect(tab);
  }
  const unsubscribe = app.subscribe((next, previous) => {
    if (applying) return;
    const folderChanged = next.destination !== previous.destination || next.activeProjectPath !== previous.activeProjectPath;
    if (folderChanged) {
      ++sequence; state.setState({ error: undefined });
      useWorkspaceEditor.getState().cancelOpen(selectionKey(previous.activeProjectPath));
      // Folder entry briefly clears the session. Only the following completed
      // selection is a tab; direct atomic route changes are already complete.
      if (next.selectionVersion === previous.selectionVersion && !next.isNewChat) return;
    }
    if (folderChanged || next.selectionVersion !== previous.selectionVersion || next.activeSessionFile !== previous.activeSessionFile || next.ready !== previous.ready || next.isNewChat !== previous.isNewChat) {
      ++sequence; record(!folderChanged && next.selectionVersion === previous.selectionVersion && previous.activeSessionFile === null);
    } else if (next.sourceControlReview !== previous.sourceControlReview) {
      const review = next.sourceControlReview;
      if (review?.projectDir === next.activeProjectPath) {
        show({ kind: "diff", projectDir: review.projectDir, path: review.path, staged: review.staged, ...(review.hash ? { hash: review.hash } : {}) });
        applying = true; try { clearFile(); } finally { applying = false; }
      } else if (!review && current().tabs.find(t => tabId(t) === current().active)?.kind === "diff") record();
    }
  });
  const stopEditor = useWorkspaceEditor.subscribe((next, previous) => {
    if (applying || !app.getState().activeProjectPath) return;
    const key = next.selected[selectionKey()];
    if (key && key !== previous.selected[selectionKey()] && next.buffers[key]) {
      show({ kind: "file", projectDir: next.buffers[key]!.projectDir, file: next.buffers[key]!.file });
      applying = true; try { app.getState().setSourceControlReview(null); } finally { applying = false; }
    }
  });
  if (!initial[tabScope(app.getState())]) { const s = app.getState(); if (s.ready && s.activeProjectPath) show({ kind: "thread", projectDir: s.activeProjectPath, session: s.activeSessionFile }); }
  else {
    const selected = current().tabs.find(t => tabId(t) === current().active);
    if (selected && (app.getState().reopenLastProject || selected.projectDir === app.getState().chatRoot)) void activate(selected);
    else if (selected) update({ ...current(), active: null });
    else reflect(undefined);
  }
  function refreshTitles() {
    if (!app.getState().ready) return;
    for (const project of new Set(current().tabs.filter(tab => tab.kind === "thread").map(tab => tab.projectDir))) {
      if ((app.getState().sessionLoadStates[project] ?? "unloaded") === "unloaded" && !app.getState().sessionsByProject[project]) void app.getState().refreshSessions(project);
    }
  }
  refreshTitles();
  function shared(tab: WorkspaceTab) {
    return [...controllers.entries()].some(([other, controller]) => other !== app && Object.values(controller.state.getState().scopes).some(strip => strip?.tabs.some(t => tabId(t) === tabId(tab))));
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
    ++sequence; update({ tabs, active: next ? tabId(next) : null });
    if (buffer && !shared(tab)) {
      applying = true; try { useWorkspaceEditor.getState().close(buffer.key); } finally { applying = false; }
    }
    if (strip.active === id) { if (next) await activate(next); else reflect(undefined); }
  }
  return { state, positions, diffPositions, refreshTitles, current, activate, close, needsDiscard, record, dispose: () => {
    unsubscribe(); stopEditor();
    for (const key of Object.keys(useWorkspaceEditor.getState().loading)) if (key.startsWith(`${paneId}:`)) useWorkspaceEditor.getState().cancelOpen(key);
    useWorkspaceEditor.setState(s => ({ selected: Object.fromEntries(Object.entries(s.selected).filter(([key]) => !key.startsWith(`${paneId}:`))) }));
  } };
}
export function paneWorkspaceTabs(app: PaneStore, initial?: WorkspaceTabScopes) {
  let controller = controllers.get(app);
  if (!controller) { controller = createWorkspaceTabs(app, initial); controllers.set(app, controller); return controller; }
  if (initial) { controller.state.setState({ scopes: initial }); const strip = controller.current(); const selected = strip.tabs.find(tab => tabId(tab) === strip.active); if (selected && (app.getState().reopenLastProject || selected.projectDir === app.getState().chatRoot)) void controller.activate(selected);
    else if (selected) controller.state.setState(s => ({ scopes: { ...s.scopes, [tabScope(app.getState())]: { ...strip, active: null } } }));
    controller.refreshTitles();
  }
  return controller;
}
export function releaseWorkspaceTabs(app: PaneStore) {
  controllers.get(app)?.dispose(); controllers.delete(app);
}
