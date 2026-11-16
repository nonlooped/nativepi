import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
let next = 1;
let state: any;
let opened: string | undefined;
let permission: (...args: any[]) => void;
class Contents extends EventEmitter {
  id = next++;
  url = "";
  mainFrame = {};
  navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  debugger = Object.assign(new EventEmitter(), { attach() {}, sendCommand: async () => ({}) });
  popup!: (details: { url: string }) => { action: string };
  setWindowOpenHandler(handler: typeof this.popup) { this.popup = handler; }
  isDestroyed() { return false; }
  stop() {}
  close() {}
  getTitle() { return "Test page"; }
  getURL() { return this.url; }
  async loadURL(url: string) { this.url = url; }
  send(channel: string, value: unknown) { if (channel === "nativepi:browser-state") state = value; }
}
let window: any;
class Window extends EventEmitter {
  webContents = new Contents();
  title = "";
  contentView = { children: [] as any[], addChildView: (view: any) => { this.contentView.children.push(view); }, removeChildView: (view: any) => { this.contentView.children = this.contentView.children.filter(child => child !== view); } };
  constructor() { super(); window = this; }
  isDestroyed() { return false; }
  setTitle(title: string) { this.title = title; }
  getContentSize() { return [1100, 800]; }
  show() {}
  hide() {}
  destroy() {}
  async loadFile() {}
}
const session = Object.assign(new EventEmitter(), { setPermissionRequestHandler(handler: typeof permission) { permission = handler; }, setPermissionCheckHandler() {}, clearStorageData: async () => {}, webRequest: { onBeforeRequest() {} } });
mock.module("electron", () => ({ BrowserWindow: Window, WebContentsView: class { webContents = new Contents(); setBounds() {} }, ipcMain: { handle() {} }, session: { fromPartition: () => session }, nativeTheme: {}, app: { getAppPath: () => "/app" }, shell: { openExternal: async (url: string) => { opened = url; } } }));
mock.module("../state.ts", () => ({ loadState: async () => ({ preferences: {} }) }));
const { SharedBrowser } = await import("./index.ts");
test("a chat browser starts without navigating and blocked actions remain denied with explicit recovery", async () => {
  const browser = new SharedBrowser();
  browser.setOwner("Review the report"); browser.show();
  expect(state.tabs).toEqual([]);
  expect(state.ownerTitle).toBe("Review the report");
  await browser.chrome({ action: "open", url: "https://example.com" });
  const contents = window.contentView.children[0].webContents as Contents;
  expect(contents.popup({ url: "https://example.com/sign-in" })).toEqual({ action: "deny" });
  expect(state.notice.message).toContain("another window");
  expect(opened).toBeUndefined();
  await browser.chrome({ action: "openExternal" });
  expect(opened).toBe("https://example.com/sign-in");
  await browser.chrome({ action: "dismissNotice" });
  expect(state.notice).toBeUndefined();
  let prevented = false;
  session.emit("will-download", { preventDefault: () => { prevented = true; } }, { getURL: () => "https://example.com/report.pdf" }, contents);
  expect(prevented).toBe(true);
  expect(state.notice.message).toContain("Downloads are unavailable");
  let allowed: boolean | undefined;
  permission(contents, "media", (value: boolean) => { allowed = value; });
  expect(allowed).toBe(false);
  expect(state.notice.message).toContain("Camera and microphone");
  await expect(browser.chrome({ action: "openExternal", url: "file:///private" })).rejects.toThrow();
  browser.setOwner("Updated chat name");
  expect(window.title).toContain("Updated chat name");
  browser.dispose();
});
