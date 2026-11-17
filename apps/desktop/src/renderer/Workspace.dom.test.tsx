import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "./lib/store/testBridge.ts";
import { primaryStore, eachPaneStore, focusPaneStore, releasePaneStore, usePaneStore, activeConversation } from "./lib/store.ts";
import { emptyConversation } from "./lib/store/conversation.ts";
import { draftKeyFor } from "../shared/messages.ts";
import { nativePiStateSchema } from "../shared/rpc-schema.ts";
import type { SessionSummary } from "../shared/pi-types.ts";
import SessionMenu from "./components/SessionMenu.tsx";
import { useWorkspacePanes, THREAD_DRAG_TYPE } from "./lib/workspacePanes.ts";

const rows = ["b", "c", "d"].map(id => ({ path: `/other/${id}.jsonl`, name: `Chat ${id}`, providers: [], firstMessage: `Chat ${id}` } as unknown as SessionSummary));
function PaneTestActions() {
  const panes = useWorkspacePanes();
  return panes && panes.count > 1 ? <>
    <button aria-label="Close focused pane" onClick={() => panes.close(panes.active)} />
    <button aria-label="Focus first pane" onClick={() => panes.select(0)} />
  </> : null;
}
mock.module("./App.tsx", () => ({
  default: ({ renderWorkspace }: { renderWorkspace: (onStart: () => void) => React.ReactNode }) => <>
    <aside>{rows.map(session => <SessionMenu key={session.path} projectPath="/other" session={session} selected={false} running={false} pinned={false}><button>{session.name}</button></SessionMenu>)}</aside>
    <PaneTestActions />
    {renderWorkspace(() => {})}
  </>,
  ConversationSurface: () => {
    const store = usePaneStore();
    const file = store(s => s.activeSessionFile);
    return <div data-open-chat={file}>{file}<span>{store(s => activeConversation(s).running) ? "Running" : "Idle"}</span></div>;
  },
}));
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
Object.defineProperty(globalThis, "DOMRect", { value: window.DOMRect, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true });
const { default: Workspace } = await import("./Workspace.tsx");
const original = primaryStore.getState();
let root: Root | undefined;
let container: HTMLDivElement;
let read: (file: string) => Promise<unknown>;
const snapshot = { consistency: "stable", entries: [], liveEvents: [], eventWatermark: 0 };
async function mount() {
  read = async () => snapshot;
  stubInvoke(async (channel, params: any) => {
    if (channel === "loadState") return nativePiStateSchema.parse({});
    if (channel === "chatWorkspace") return { path: "/chat" };
    if (channel === "workWorkspace") return { path: "/free" };
    if (channel === "checkTrust") return { required: true, trusted: false };
    if (channel === "readSessionSnapshot") return read(params.sessionFile);
    if (channel === "orchestrationSnapshot") return { revision: 0, threads: [] };
    if (channel === "listSessions") return { sessions: rows };
    if (channel === "listProviders") return { providers: [] };
    if (channel === "updateState") return { status: "unsupported", channel: "stable" };
    return { ok: true };
  });
  primaryStore.setState({ ...original, ready: true, init: async () => {}, activeProjectPath: "/first", activeSessionFile: "/first/a.jsonl", confirmedNewLead: "/first/a.jsonl", isNewChat: false,
    preferences: { ...original.preferences, notifyOnTurnEnd: false }, projects: [{ path: "/first", name: "First" }, { path: "/other", name: "Other" }],
    sessionsByProject: {}, conversations: { "/first/a.jsonl": { ...emptyConversation(), projectDir: "/first", sessionFile: "/first/a.jsonl", running: true } },
    drafts: { [draftKeyFor("/first", "/first/a.jsonl")]: "Keep this draft" },
  }, true);
  focusPaneStore(primaryStore);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<Workspace />));
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount()); root = undefined; container?.remove();
  for (const pane of eachPaneStore()) if (pane !== primaryStore) releasePaneStore(pane);
  primaryStore.setState(original, true); focusPaneStore(primaryStore); localStorage.clear();
});
function panes() { return [...container.querySelectorAll("[data-workspace-pane]")]; }
function chats() { return panes().map(pane => pane.querySelector("[data-open-chat]")?.getAttribute("data-open-chat")); }
async function menu(id: string) {
  const row = [...container.querySelectorAll("aside button")].find(button => button.textContent === `Chat ${id}`)!;
  await act(async () => { row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2, clientX: 10, clientY: 10 })); });
  const open = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes("Open to the right"))!;
  expect(open).toBeDefined();
  await act(async () => open.click());
}
function transfer(type?: string) {
  const data = new Map<string, string>(type ? [[type, "external"]] : []);
  return { get types() { return [...data.keys()]; }, effectAllowed: "all", dropEffect: "none", setData: (type: string, value: string) => data.set(type, value) };
}
async function dragEvent(node: Element, type: string, data: ReturnType<typeof transfer>, x = 10, y = 300) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "dataTransfer", { value: data });
  await act(async () => { node.dispatchEvent(event); });
  return event;
}
async function start(id: string) {
  const row = [...container.querySelectorAll("aside button")].find(button => button.textContent === `Chat ${id}`)!.closest("[draggable]")!;
  const data = transfer(); await dragEvent(row, "dragstart", data); return { row, data };
}
function target() {
  const target = container.querySelector("[data-open-chat]")!.parentElement!;
  target.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() {} });
  return target;
}

test("a sidebar context action opens that exact cross-project chat while retaining the running chat and latest draft", async () => {
  await mount();
  let resolve!: (value: unknown) => void;
  read = () => new Promise(done => { resolve = done; });
  await menu("b");
  expect(chats()).toEqual(["/first/a.jsonl"]);
  await act(async () => primaryStore.getState().setDraft("Typed while opening"));
  expect(primaryStore.getState().drafts[draftKeyFor("/first", "/first/a.jsonl")]).toBe("Typed while opening");
  await act(async () => resolve(snapshot));
  expect(chats()).toEqual(["/first/a.jsonl", "/other/b.jsonl"]);
  expect(primaryStore.getState().conversations["/first/a.jsonl"]?.running).toBe(true);
  expect(eachPaneStore().find(pane => pane.getState().activeSessionFile === "/other/b.jsonl")?.getState().drafts[draftKeyFor("/first", "/first/a.jsonl")]).toBe("Typed while opening");
});

test("dropping a sidebar chat to the left opens it there; cancellation and file drags do not split", async () => {
  await mount();
  const external = await dragEvent(target(), "dragover", transfer("Files"));
  expect(external.defaultPrevented).toBe(false);
  const cancelled = await start("b");
  await dragEvent(target(), "dragover", cancelled.data);
  expect(container.textContent).toContain("Open beside this chat");
  await dragEvent(cancelled.row, "dragend", cancelled.data);
  expect(chats()).toEqual(["/first/a.jsonl"]);
  expect(container.textContent).not.toContain("Open beside this chat");
  const accepted = await start("b");
  expect(accepted.data.types).toContain(THREAD_DRAG_TYPE);
  await dragEvent(target(), "dragover", accepted.data);
  await dragEvent(target(), "drop", accepted.data);
  expect(chats()).toEqual(["/other/b.jsonl", "/first/a.jsonl"]);
  expect(container.querySelector('[data-thread-drop-side]')).toBeNull();
});

test("failed opens release the new pane, allow retry, and enforce the three-chat limit", async () => {
  await mount(); read = async () => { throw new Error("unavailable transcript"); };
  await menu("b");
  expect(chats()).toEqual(["/first/a.jsonl"]);
  expect(eachPaneStore()).toHaveLength(1);
  read = async () => snapshot;
  await menu("b"); await menu("b");
  expect(chats()).toHaveLength(2); // A chat already on screen is focused, not duplicated.
  await menu("c");
  expect(chats()).toHaveLength(3);
  const fourth = await start("d");
  await dragEvent(target(), "dragover", fourth.data);
  expect(container.textContent).toContain("Up to three chats can be open");
  await dragEvent(target(), "drop", fourth.data);
  expect(chats()).toHaveLength(3);
  expect(chats()).not.toContain("/other/d.jsonl");
});


test("closing the workspace during a pending split releases its unpublished pane", async () => {
  await mount();
  let resolve!: (value: unknown) => void;
  read = () => new Promise(done => { resolve = done; });
  await menu("b");
  await act(async () => root!.unmount()); root = undefined;
  expect(eachPaneStore()).toHaveLength(1);
  await act(async () => resolve(snapshot));
  expect(eachPaneStore()).toHaveLength(1);
  expect(primaryStore.getState().drafts[draftKeyFor("/first", "/first/a.jsonl")]).toBe("Keep this draft");
});


test("closing either focused split pane leaves a valid selection and preserves the retained pane's work", async () => {
  await mount(); await menu("b");
  await act(async () => container.querySelector<HTMLElement>('[aria-label="Close focused pane"]')!.click());
  expect(chats()).toEqual(["/first/a.jsonl"]);
  expect(primaryStore.getState().conversations["/first/a.jsonl"]?.running).toBe(true);
  await menu("b");
  await act(async () => container.querySelector<HTMLElement>('[aria-label="Focus first pane"]')!.click());
  await act(async () => container.querySelector<HTMLElement>('[aria-label="Close focused pane"]')!.click());
  expect(chats()).toEqual(["/other/b.jsonl"]);
  expect(container.querySelector('[data-pane-active="true"] [data-open-chat]')?.getAttribute("data-open-chat")).toBe("/other/b.jsonl");
  expect(eachPaneStore().find(store => store.getState().activeSessionFile === "/other/b.jsonl")?.getState().drafts[draftKeyFor("/first", "/first/a.jsonl")]).toBe("Keep this draft");
});
