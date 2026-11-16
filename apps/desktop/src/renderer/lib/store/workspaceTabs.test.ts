import { afterEach, expect, test } from "bun:test";
import { stubInvoke } from "./testBridge.ts";
import { createPaneStore, releasePaneStore, type PaneStore } from "../store.ts";
import { paneWorkspaceTabs, tabId, tabScope, workspaceTabsSchema, type WorkspaceTab } from "../workspaceTabs.ts";
import { useWorkspaceEditor } from "../workspaceEditor.ts";
import { runtime } from "./internals.ts";
import { emptyConversation } from "./conversation.ts";

const stores: PaneStore[] = [];
function pane(project = "/project") {
  const app = createPaneStore(); stores.push(app);
  app.setState({ ready: true, activeProjectPath: project, activeSessionFile: "a", isNewChat: false,
    drafts: { a: "Keep writing" }, conversations: { a: { ...emptyConversation(), running: true, sessionFile: "a", projectDir: project } },
    selectChat: async (session, dir = project) => { app.setState(s => ({ activeProjectPath: dir, activeSessionFile: session, isNewChat: false, selectionVersion: s.selectionVersion + 1 })); },
    newChat: () => { app.setState(s => ({ activeSessionFile: null, isNewChat: true, selectionVersion: s.selectionVersion + 1 })); },
  });
  return app;
}
const thread = (session: string | null): WorkspaceTab => ({ kind: "thread", session });
const file: WorkspaceTab = { kind: "file", file: "one.ts" };
const diff: WorkspaceTab = { kind: "diff", path: "one.ts", staged: false };
function reader() { stubInvoke(async () => ({ text: "original", revision: "v1" })); }
afterEach(() => { stores.splice(0).forEach(releasePaneStore); useWorkspaceEditor.setState({ buffers: {}, selected: {}, loading: {} }); });

test("threads, file and distinct live/commit diffs retain their places; close chooses right then left without stopping work", async () => {
  reader(); const app = pane(), tabs = paneWorkspaceTabs(app);
  await app.getState().selectChat("b");
  await tabs.activate(file); app.getState().setSourceControlReview({ projectDir: "/project", path: "one.ts", staged: false });
  const commit = { ...diff, hash: "1234567" };
  await tabs.activate(commit);
  expect(tabs.current().tabs).toEqual([thread("a"), thread("b"), file, diff, commit]);
  await tabs.activate(file); await tabs.close(file);
  expect(tabs.current().active).toBe(tabId(diff));
  await tabs.close(thread("a")); // inactive close leaves the current location alone
  expect(tabs.current().active).toBe(tabId(diff));
  await tabs.activate(commit); await tabs.close(commit);
  expect(tabs.current().active).toBe(tabId(diff));
  expect(app.getState().conversations.a?.running).toBe(true);
  expect(app.getState().drafts.a).toBe("Keep writing");
});

test("a draft is kept when browsing another conversation and promoted only when its first send creates a session", async () => {
  const app = pane(), tabs = paneWorkspaceTabs(app);
  app.getState().newChat(); await app.getState().selectChat("b");
  expect(tabs.current().tabs).toContainEqual(thread(null));
  await tabs.activate(thread(null));
  app.setState({ activeSessionFile: "created", isNewChat: false });
  expect(tabs.current().tabs).toEqual([thread("a"), thread("created"), thread("b")]);
});

test("closing a dirty file protects the last view, keeps another pane's buffer, and never closes a saving buffer", async () => {
  reader(); const first = pane(), second = pane();
  const a = paneWorkspaceTabs(first), b = paneWorkspaceTabs(second);
  await a.activate(file); await b.activate(file);
  const key = Object.keys(useWorkspaceEditor.getState().buffers)[0]!;
  useWorkspaceEditor.getState().edit(key, "unsaved");
  expect(a.needsDiscard(file)).toBe(false);
  await a.close(file);
  expect(useWorkspaceEditor.getState().buffers[key]?.text).toBe("unsaved");
  expect(b.needsDiscard(file)).toBe(true);
  await b.close(file); expect(b.current().active).toBe(tabId(file));
  useWorkspaceEditor.setState(s => ({ buffers: { ...s.buffers, [key]: { ...s.buffers[key]!, saving: true } } }));
  await b.close(file, true); expect(b.current().active).toBe(tabId(file));
  useWorkspaceEditor.setState(s => ({ buffers: { ...s.buffers, [key]: { ...s.buffers[key]!, saving: false } } }));
  await b.close(file, true); expect(useWorkspaceEditor.getState().buffers[key]).toBeUndefined();
  expect(b.current().active).toBe(tabId(thread("a")));
});

test("a delayed file read cannot steal selection after returning to a thread or changing projects", async () => {
  const app = pane(), tabs = paneWorkspaceTabs(app);
  let finish!: (value: unknown) => void;
  stubInvoke(async () => new Promise(resolve => { finish = resolve; }));
  const opening = tabs.activate(file);
  await tabs.activate(thread("a"));
  finish({ text: "late", revision: "v1" }); await opening;
  expect(tabs.current().active).toBe(tabId(thread("a")));
  expect(useWorkspaceEditor.getState().selected[`${runtime(app.getState).paneId}:/project`]).toBeUndefined();
  const more = tabs.activate({ kind: "file", file: "two.ts" });
  app.setState({ activeProjectPath: "/other" }); await app.getState().selectChat("other", "/other");
  finish({ text: "other late", revision: "v1" }); await more;
  expect(tabs.current().tabs).toEqual([thread("other")]);
  await app.getState().selectChat("a", "/project");
  expect(tabs.current().tabs).toContainEqual(file);
});

test("pane metadata restores tab order and a clean file lazily, with retryable errors and no saved buffer contents", async () => {
  const app = pane(); const scope = tabScope(app.getState());
  const metadata = workspaceTabsSchema.parse({ [scope]: { tabs: [thread("a"), file, diff], active: tabId(file) } });
  stubInvoke(async () => { throw new Error("File unavailable"); });
  const tabs = paneWorkspaceTabs(app, metadata);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(tabs.state.getState().error).toContain("File unavailable");
  expect(tabs.current().active).toBe(tabId(file));
  reader(); await tabs.activate(file);
  const key = Object.keys(useWorkspaceEditor.getState().buffers)[0]!;
  useWorkspaceEditor.getState().edit(key, "private unsaved text");
  const serialized = JSON.stringify(tabs.state.getState().scopes);
  expect(serialized).not.toContain("private unsaved text");
  expect(serialized).not.toContain("original");
  expect(tabs.state.getState().error).toBeUndefined();
  expect(tabs.current().tabs).toEqual([thread("a"), file, diff]);
  expect(workspaceTabsSchema.safeParse({ [scope]: { tabs: [{ kind: "execute", code: "bad" }], active: "bad" } }).success).toBe(false);
});


test("project switches restore the previous file tab and unsaved buffer without changing another pane", async () => {
  const app = pane(), other = pane();
  const a = paneWorkspaceTabs(app), b = paneWorkspaceTabs(other);
  stubInvoke(async channel => {
    if (channel === "readWorkspaceFile") return { text: "original", revision: "v1" };
    if (channel === "listSessions") return { sessions: [] };
    if (channel === "checkTrust") return { required: true, trusted: false };
    return {};
  });
  await a.activate(file);
  const key = Object.keys(useWorkspaceEditor.getState().buffers)[0]!;
  useWorkspaceEditor.getState().edit(key, "keep my work");
  await app.getState().selectProject("/other");
  expect(a.current().tabs).toEqual([thread(null)]);
  await app.getState().selectProject("/project");
  expect(a.current().active).toBe(tabId(file));
  expect(useWorkspaceEditor.getState().buffers[key]?.text).toBe("keep my work");
  expect(b.current().tabs).toEqual([thread("a")]);
});

test("closing the final tab leaves a recoverable empty workspace while its thread keeps running", async () => {
  const app = pane(), tabs = paneWorkspaceTabs(app);
  await tabs.close(thread("a"));
  expect(tabs.current()).toEqual({ tabs: [], active: null });
  expect(app.getState().conversations.a?.running).toBe(true);
  tabs.record();
  expect(tabs.current().active).toBe(tabId(thread("a")));
});

test("closing a pane during a file read cannot publish a selection into the released pane", async () => {
  const app = pane(), tabs = paneWorkspaceTabs(app);
  const paneId = runtime(app.getState).paneId;
  let finish!: (value: unknown) => void;
  stubInvoke(async channel => channel === "readWorkspaceFile" ? new Promise(resolve => { finish = resolve; }) : {});
  const opening = tabs.activate(file);
  releasePaneStore(app);
  stores.splice(stores.indexOf(app), 1);
  finish({ text: "read completed after close", revision: "v1" });
  await opening;
  expect(useWorkspaceEditor.getState().selected[`${paneId}:/project`]).toBeUndefined();
  expect(useWorkspaceEditor.getState().loading[`${paneId}:/project`]).toBeUndefined();
});
