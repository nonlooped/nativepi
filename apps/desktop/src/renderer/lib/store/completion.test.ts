import { afterEach, expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import "./testBridge.ts";
import { createAppState } from "../store.ts";
import { subscribeTurnCompletion } from "../completion.ts";
import { emptyConversation } from "./conversation.ts";
import type { AppState } from "./types.ts";

const notices: FakeNotification[] = [];
class FakeNotification {
  static permission = "granted";
  static requestPermission = async () => "granted" as NotificationPermission;
  onclick?: () => void;
  onclose?: () => void;
  onerror?: (error: unknown) => void;
  closed = false;
  constructor(public title: string, public options: NotificationOptions) { notices.push(this); }
  close() { this.closed = true; this.onclose?.(); }
}
const original = globalThis.Notification;
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); notices.length = 0; globalThis.Notification = original; });
function fixture() {
  globalThis.Notification = FakeNotification as unknown as typeof Notification;
  FakeNotification.permission = "granted";
  Object.assign(globalThis, { document: { hasFocus: () => false } });
  const store = createStore<AppState>()(createAppState);
  store.setState({ projects: [{ path: "/repo", name: "Project" }], conversations: {
    chat: { ...emptyConversation(), projectDir: "/repo", sessionFile: "chat", sessionName: "Fix login", running: true, runStartedAt: Date.now() - 1000 },
  } });
  const selections: unknown[] = [];
  store.setState({ selectChat: async (...args) => { selections.push(args); } });
  cleanups.push(subscribeTurnCompletion(store));
  const finish = (extra = {}) => store.setState(state => ({ conversations: { chat: { ...state.conversations.chat!, running: false, ...extra } } }));
  return { store, finish, selections };
}
test("identity, outcome, sound preference and exact navigation survive selection changes", async () => {
  const { store, finish, selections } = fixture();
  let focused = false;
  window.nativepi!.focusWindow = async () => { focused = true; };
  store.setState(state => ({ preferences: { ...state.preferences, notificationSound: false } }));
  finish();
  expect(notices[0]?.title).toBe("Fix login");
  expect(notices[0]?.options).toMatchObject({ body: "Project · Finished in 1s", silent: true, tag: "nativepi:chat" });
  store.setState({ activeSessionFile: "other", activeProjectPath: "/other" });
  notices[0]!.onclick!();
  expect(focused).toBe(true);
  expect(selections).toEqual([["chat", "/repo"]]);
  expect(notices[0]!.closed).toBe(true);
  finish(); expect(notices).toHaveLength(1);
});
test("failed turns notify; aborted turns and disabled preferences do not", () => {
  const { store, finish } = fixture();
  finish({ error: "Offline" }); expect(notices[0]?.options.body).toContain("Failed");
  store.setState(state => ({ conversations: { chat: { ...state.conversations.chat!, running: true } } }));
  finish({ aborted: true }); expect(notices).toHaveLength(1);
  store.setState(state => ({ preferences: { ...state.preferences, notifyOnTurnEnd: false }, conversations: { chat: { ...state.conversations.chat!, running: true } } }));
  finish({ aborted: false }); expect(notices).toHaveLength(1);
});
test("permission resolution after teardown does not deliver stale notifications", async () => {
  const { finish } = fixture();
  FakeNotification.permission = "default";
  finish(); cleanups.splice(0).forEach(fn => fn());
  await Promise.resolve(); expect(notices).toHaveLength(0);
});
test("denied permission, removed chats, and focused chats do not notify", () => {
  const { store, finish } = fixture();
  FakeNotification.permission = "denied"; finish(); expect(notices).toHaveLength(0);
  FakeNotification.permission = "granted";
  store.setState(state => ({ activeSessionFile: "chat", conversations: { chat: { ...state.conversations.chat!, running: true } } }));
  document.hasFocus = () => true;
  finish(); expect(notices).toHaveLength(0);
  store.setState({ conversations: {} }); expect(notices).toHaveLength(0);
});
test("Local Access does not duplicate desktop delivery", () => {
  const { store, finish } = fixture();
  cleanups.splice(0).forEach(fn => fn());
  const bridge = window.nativepi;
  delete window.nativepi;
  try { cleanups.push(subscribeTurnCompletion(store)); finish(); expect(notices).toHaveLength(0); }
  finally { window.nativepi = bridge; }
});
test("delivery errors are reported and do not break later transitions", () => {
  const { store, finish } = fixture();
  const warnings: unknown[] = [];
  const warn = console.warn;
  console.warn = (...args) => { warnings.push(args); };
  try {
    globalThis.Notification = class extends FakeNotification {
      constructor(title: string, options: NotificationOptions) { super(title, options); throw new Error("Unavailable"); }
    } as unknown as typeof Notification;
    finish(); expect(warnings).toHaveLength(1);
    globalThis.Notification = FakeNotification as unknown as typeof Notification;
    store.setState(state => ({ conversations: { chat: { ...state.conversations.chat!, running: true } } }));
    finish(); expect(notices).toHaveLength(2);
    cleanups.splice(0).forEach(fn => fn()); expect(notices[1]!.closed).toBe(true);
  } finally { console.warn = warn; }
});
test("permission granted asynchronously delivers the original task", async () => {
  const { finish } = fixture(); FakeNotification.permission = "default";
  finish(); await Promise.resolve();
  expect(notices[0]?.title).toBe("Fix login");
});
