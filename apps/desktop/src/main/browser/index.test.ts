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
  script: () => Promise<unknown> = async () => ({});
  executeJavaScriptInIsolatedWorld() { return this.script(); }
  focus() {}
  stop() {}
  close() {}
  async loadFile() {}
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
mock.module("electron", () => ({ BrowserWindow: Window, WebContentsView: class { webContents = new Contents(); setBounds() {} setBackgroundColor() {} }, ipcMain: { handle() {} }, session: { fromPartition: () => session }, nativeTheme: {}, app: { getAppPath: () => "/app" }, shell: { openExternal: async (url: string) => { opened = url; } } }));
mock.module("../state.ts", () => ({ loadState: async () => ({ preferences: {} }) }));
const { SharedBrowser } = await import("./index.ts");
test("a chat browser starts without navigating and blocked actions remain denied with explicit recovery", async () => {
  const host = new Window();
  let visible = false;
  const browser = new SharedBrowser(host as never, () => { visible = true; }, () => { visible = false; });
  browser.setBounds({ x: 600, y: 40, width: 500, height: 700 });
  browser.setOwner("Review the report"); browser.show();
  expect(state.tabs).toEqual([]);
  expect(state.ownerTitle).toBe("Review the report");
  await browser.chrome({ action: "open", url: "https://example.com" });
  expect(visible).toBe(true);
  expect(window).toBe(host);
  const contents = host.contentView.children[1].webContents as Contents;
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
  expect(state.ownerTitle).toBe("Updated chat name");
  await browser.chrome({ action: "windowClose" });
  expect(visible).toBe(false);
  browser.setBounds();
  expect(host.contentView.children).toHaveLength(0);
  browser.show();
  browser.setBounds({ x: 500, y: 40, width: 600, height: 700 });
  expect(host.contentView.children).toHaveLength(2);
  expect(host.contentView.children[1].webContents).toBe(contents);
  browser.dispose();
  expect(host.contentView.children).toHaveLength(0);
  browser.setOwner("Late reply from the closed chat");
  expect(state.ownerTitle).toBe("Updated chat name");
});

test("picking fences agent actions, preserves takeover and discards navigation/cancellation races", async () => {
  const host = new Window();
  const annotations: unknown[] = [];
  const browser = new SharedBrowser(host as never, () => {}, () => {}, annotation => { annotations.push(annotation); });
  browser.setBounds({ x: 500, y: 0, width: 600, height: 700 });
  await browser.chrome({ action: "open", url: "https://example.com" });
  const tab = state.active;
  const contents = host.contentView.children[1].webContents as Contents;
  contents.emit("did-stop-loading");
  await browser.chrome({ action: "handoff", tab });
  await browser.chrome({ action: "annotate" });
  expect(state.selecting).toBe(true);
  expect(host.contentView.children).toHaveLength(3);
  await expect(browser.run({ action: "snapshot", tab })).rejects.toThrow(/handoff|selection/);
  await expect(browser.run({ action: "show", tab })).rejects.toThrow("selection");
  await browser.chrome({ action: "cancelAnnotation" });
  expect(state.selecting).toBe(false);
  expect(state.handoff).toBe(true);
  expect(host.contentView.children).toHaveLength(2);
  await browser.chrome({ action: "annotate" });
  contents.script = async () => ({ error: "Frames and shadow content can’t be selected." });
  expect(await browser.chrome({ action: "annotationPoint", x: 20, y: 30, capture: true })).toEqual({ error: "Frames and shadow content can’t be selected." });
  expect(state.selecting).toBe(true);
  let finish!: (value: unknown) => void;
  contents.script = () => new Promise(resolve => { finish = resolve; });
  const pending = browser.chrome({ action: "annotationPoint", x: 20, y: 30, capture: true });
  contents.emit("did-start-navigation");
  finish({ element: { selector: "button", tag: "button", text: "Buy", attributes: {} } });
  await expect(pending).rejects.toThrow("Page changed");
  expect(annotations).toEqual([]);
  expect(state.selecting).toBe(false);
  contents.script = async () => ({ element: { selector: "button:nth-of-type(2)", tag: "button", text: "Buy", attributes: {} } });
  await browser.chrome({ action: "annotate" });
  await browser.chrome({ action: "annotationPoint", x: 20, y: 30, capture: true });
  expect(annotations).toMatchObject([{ tab, url: "https://example.com", element: { selector: "button:nth-of-type(2)", text: "Buy" } }]);
  expect(state.handoff).toBe(true);
  expect(state.selecting).toBe(false);
  await browser.chrome({ action: "annotate" });
  browser.setBounds(); // Hide, change chat, or place an app-owned dialog above it.
  expect(state.selecting).toBe(false);
  await expect(browser.chrome({ action: "annotationPoint", x: 20, y: 30, capture: true })).rejects.toThrow("Selection ended");
  browser.dispose();
  expect(host.contentView.children).toHaveLength(0);
});
