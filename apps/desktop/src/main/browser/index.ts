import {
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  nativeTheme,
  app,
} from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  browserChromeActionSchema,
  browserAction,
  browserUrl,
  type BrowserAction,
} from "../../shared/browser.ts";
import { loadState } from "../state.ts";
import { builtInTheme, DEFAULT_THEME } from "../../shared/themes.ts";
import { snapshotPage } from "./page.ts";

type Tab = {
  id: string;
  view: WebContentsView;
  logs: string[];
  generation: string;
  loading: boolean;
  error?: string;
};
export class SharedBrowser {
  private window?: BrowserWindow;
  private tabs = new Map<string, Tab>();
  private active?: string;
  private handoff = false;
  private tail: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private closed = false;
  private sessionConfigured = false;
  private chromeHeight = 92;
  private partition = `nativepi-browser-${randomUUID()}`;
  cancel() {
    this.epoch++;
    for (const tab of this.tabs.values()) {
      tab.generation = "";
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.stop();
    }
  }
  dispose() {
    this.closed = true;
    this.cancel();
    this.window?.destroy();
    for (const tab of this.tabs.values())
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    this.tabs.clear();
    void session.fromPartition(this.partition).clearStorageData();
  }
  run(raw: unknown, signal?: AbortSignal) {
    const operation = browserAction.parse(raw);
    const epoch = this.epoch;
    const execute = async () => {
      if (this.closed || signal?.aborted || epoch !== this.epoch)
        throw new Error(
          "Browser action cancelled. Observe before retrying; previous delivery may have occurred.",
        );
      if (
        this.handoff &&
        !["list", "show", "handoff"].includes(operation.action)
      )
        throw new Error(
          "Human handoff active. Wait for the person to resume agent control.",
        );
      const cancel = () => this.cancel();
      signal?.addEventListener("abort", cancel, { once: true });
      let rejectAbort: (() => void) | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          this.execute(operation, () => {
            if (this.closed || signal?.aborted || epoch !== this.epoch)
              throw new Error("Browser cancelled; inspect before retrying.");
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              this.cancel();
              reject(new Error("Browser timed out; inspect before retrying."));
            }, 20000);
          }),
          new Promise<never>((_, reject) => {
            rejectAbort = () =>
              reject(
                new Error(
                  "Cancelled; action delivery may have occurred. Observe before retrying.",
                ),
              );
            signal?.addEventListener("abort", rejectAbort, { once: true });
          }),
        ]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        if (rejectAbort) signal?.removeEventListener("abort", rejectAbort);
      }
    };
    const result = this.tail.then(execute);
    this.tail = result.catch(() => {});
    return result;
  }
  private ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return;
    const win = (this.window = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 420,
      minHeight: 400,
      maxWidth: 2400,
      maxHeight: 1800,
      title: "Browser · NativePi",
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
      webPreferences: {
        preload: join(app.getAppPath(), "out/preload/browser.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    }));
    win.webContents.on("page-title-updated", (event) => {
      event.preventDefault();
      win.setTitle("Browser · NativePi");
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.on("resize", () => this.layout());
    win.on("close", (event) => {
      if (!this.closed) {
        event.preventDefault();
        win.hide();
      }
    });
    win.webContents.on("did-finish-load", () => {
      this.state();
      void this.theme().catch(() => {});
    });
    win.on("focus", () => {
      void this.theme().catch(() => {});
    });
    if (process.env.ELECTRON_RENDERER_URL)
      void win.loadURL(
        new URL("browser.html", process.env.ELECTRON_RENDERER_URL).href,
      );
    else void win.loadFile(join(app.getAppPath(), "out/renderer/browser.html"));
    const chromeId = win.webContents.id;
    chromeOwners.set(chromeId, this);
    win.on("closed", () => chromeOwners.delete(chromeId));
  }
  async chrome(raw: unknown) {
    const op = browserChromeActionSchema.parse(raw);
    if (op.action === "layout") {
      if (op.height) this.chromeHeight = op.height;
      this.layout();
      return;
    }
    if (op.action === "windowClose") {
      this.window?.hide();
      return;
    }
    if (op.action === "windowMinimize") {
      this.window?.minimize();
      return;
    }
    if (op.action === "windowMaximize") {
      if (this.window?.isMaximized()) this.window.unmaximize();
      else this.window?.maximize();
      return;
    }
    if (op.action === "new") {
      this.active = undefined;
      this.layout();
      this.state();
      return;
    }
    if (op.action === "state") {
      this.state();
      await this.theme();
      return;
    }
    if (op.action === "resume") {
      this.cancel();
      this.handoff = false;
      this.state();
      return;
    }
    // Human actions fence queued agent actions and invalidate all references.
    this.cancel();
    const action = browserAction.parse(op);
    const epoch = this.epoch;
    const result = await this.execute(action, () => {
      if (this.closed || epoch !== this.epoch)
        throw new Error("Browser cancelled.");
    });
    this.state();
    return result;
  }
  private async theme() {
    const { preferences } = await loadState();
    const appearance =
      preferences.theme === "system"
        ? nativeTheme.shouldUseDarkColors
          ? "dark"
          : "light"
        : preferences.theme;
    const theme =
      preferences.customThemes.find((t) => t.id === preferences.themeId) ??
      builtInTheme(preferences.themeId)?.theme ??
      DEFAULT_THEME;
    if (this.closed || !this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("nativepi:browser-theme", {
      appearance,
      colors: theme.colors[appearance],
      scale: preferences.interfaceScale,
      motion: preferences.reducedMotion,
    });
  }
  private state() {
    if (this.closed || !this.window || this.window.isDestroyed()) return;
    const current = this.active ? this.tabs.get(this.active) : undefined;
    this.layout();
    this.window.webContents.send("nativepi:browser-state", {
      tabs: [...this.tabs.values()].map((t) => ({
        id: t.id,
        title: t.view.webContents.getTitle().slice(0, 300) || "New tab",
      })),
      active: this.active,
      url: this.active
        ? this.tabs.get(this.active)?.view.webContents.getURL()
        : "",
      handoff: this.handoff,
      loading: current?.loading ?? false,
      error: current?.error,
      canGoBack:
        current?.view.webContents.navigationHistory.canGoBack() ?? false,
      canGoForward:
        current?.view.webContents.navigationHistory.canGoForward() ?? false,
    });
  }
  private layout() {
    if (this.closed || !this.window || this.window.isDestroyed()) return;
    const [width, height] = this.window.getContentSize();
    for (const tab of this.tabs.values()) {
      const visible = tab.id === this.active && !tab.error;
      const attached = this.window.contentView.children.includes(tab.view);
      if (visible && !attached) this.window.contentView.addChildView(tab.view);
      else if (!visible && attached)
        this.window.contentView.removeChildView(tab.view);
      tab.view.setBounds({
        x: 0,
        y: this.chromeHeight,
        width,
        height: Math.max(1, height - this.chromeHeight),
      });
    }
  }
  private async execute(op: BrowserAction, check = () => {}): Promise<unknown> {
    if (op.action === "list")
      return {
        tabs: [...this.tabs.values()].map((t) => ({
          tab: t.id,
          title: t.view.webContents.getTitle().slice(0, 300),
          url: t.view.webContents.getURL().slice(0, 8192),
        })),
        handoff: this.handoff,
      };
    this.ensureWindow();
    if (op.action === "open") {
      if (this.tabs.size >= 8)
        throw new Error("Eight tabs per chat. Close a tab first.");
      const ses = session.fromPartition(this.partition);
      ses.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      ses.setPermissionCheckHandler(() => false);
      if (!this.sessionConfigured) {
        this.sessionConfigured = true;
        ses.on("will-download", (event) => event.preventDefault());
        ses.webRequest.onBeforeRequest((details, callback) => {
          let allowed = false;
          try {
            allowed = [
              "http:",
              "https:",
              "ws:",
              "wss:",
              "data:",
              "blob:",
            ].includes(new URL(details.url).protocol);
          } catch {}
          callback({ cancel: !allowed });
        });
      }
      const view = new WebContentsView({
        webPreferences: {
          session: ses,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
          navigateOnDragDrop: false,
        },
      });
      const tab: Tab = {
        id: randomUUID(),
        view,
        logs: [],
        generation: "",
        loading: true,
      };
      this.tabs.set(tab.id, tab);
      this.active = tab.id;
      this.window!.contentView.addChildView(view);
      this.layout();
      this.window!.show();
      const wc = view.webContents;
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
      const guard = (event: Electron.Event, url: string) => {
        if (!browserUrl.safeParse(url).success) event.preventDefault();
      };
      wc.on("will-navigate", guard);
      wc.on("will-redirect", guard);
      wc.on("will-frame-navigate", (event) => {
        if (!browserUrl.safeParse(event.url).success) event.preventDefault();
      });
      wc.on("did-start-navigation", () => {
        tab.generation = "";
      });
      wc.on("did-start-loading", () => {
        tab.loading = true;
        tab.error = undefined;
        this.state();
      });
      wc.on("did-stop-loading", () => {
        tab.loading = false;
        this.state();
      });
      wc.on("page-title-updated", () => this.state());
      wc.on("did-navigate", () => this.state());
      wc.on("console-message", (event) => {
        tab.logs.push(
          `console ${event.level}: ${event.message.slice(0, 1000)}`,
        );
        tab.logs = tab.logs.slice(-60);
      });
      wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
        if (isMainFrame && code !== -3) {
          tab.error = description.slice(0, 1000);
          tab.loading = false;
          this.state();
        }
        tab.logs.push(
          `load ${code}: ${description.slice(0, 200)} ${url.slice(0, 500)}`,
        );
        tab.logs = tab.logs.slice(-60);
      });
      await wc.loadURL("about:blank");
      check();
      wc.debugger.attach("1.3");
      wc.debugger.on("message", (_e, method, data) => {
        if (method === "Network.responseReceived") {
          tab.logs.push(
            `network ${data.response.status}: ${String(data.response.url).slice(0, 500)}`,
          );
          tab.logs = tab.logs.slice(-60);
        }
      });
      await wc.debugger.sendCommand("Network.enable", {
        maxTotalBufferSize: 0,
        maxResourceBufferSize: 0,
      });
      check();
      await wc.loadURL(op.url);
      check();
      this.state();
      return { tab: tab.id, url: wc.getURL() };
    }
    const tab = this.tabs.get(op.tab);
    if (!tab)
      throw new Error("Tab does not belong to this chat or has closed.");
    const wc = tab.view.webContents;
    if (op.action === "close") {
      this.window!.contentView.removeChildView(tab.view);
      this.tabs.delete(tab.id);
      wc.close();
      this.active = this.tabs.keys().next().value;
      this.layout();
      this.state();
      return { closed: tab.id };
    }
    if (op.action === "show" || op.action === "handoff") {
      this.active = tab.id;
      if (op.action === "handoff") {
        this.cancel();
        this.handoff = true;
      }
      this.layout();
      this.state();
      this.window!.show();
      return { tab: tab.id, handoff: this.handoff };
    }
    if (op.action === "navigate") {
      tab.generation = "";
      check();
      await wc.loadURL(op.url);
      check();
      this.state();
      return { url: wc.getURL() };
    }
    if (
      op.action === "reload" ||
      op.action === "back" ||
      op.action === "forward"
    ) {
      tab.generation = "";
      if (op.action === "reload") wc.reload();
      else if (op.action === "back" && wc.navigationHistory.canGoBack())
        wc.navigationHistory.goBack();
      else if (op.action === "forward" && wc.navigationHistory.canGoForward())
        wc.navigationHistory.goForward();
      return { navigation: "started; observe after loading" };
    }
    if (op.action === "diagnostics")
      return {
        entries: tab.logs,
        note: "Untrusted bounded metadata; no headers, bodies or cookies.",
      };
    if (op.action === "screenshot") {
      if (tab.error)
        throw new Error(
          "The page failed to load. Use diagnostics or reload before capturing it.",
        );
      this.active = tab.id;
      this.layout();
      this.state();
      this.window!.show();
      const image = await wc.capturePage();
      const size = image.getSize();
      return {
        image: {
          type: "image",
          mimeType: "image/png",
          data: image
            .resize({ width: Math.min(size.width, 1440) })
            .toPNG()
            .toString("base64"),
        },
      };
    }
    if (op.action === "snapshot") {
      tab.generation = randomUUID();
      return wc.executeJavaScriptInIsolatedWorld(999, [
        {
          code: `(${snapshotPage.toString()})(${JSON.stringify(tab.generation)})`,
        },
      ]);
    }
    if (op.action === "scroll") {
      tab.generation = "";
      return wc.executeJavaScriptInIsolatedWorld(999, [
        {
          code: `window.scrollBy(0,${op.delta}); 'Scrolled. Take a fresh snapshot.'`,
        },
      ]);
    }
    if (!("ref" in op)) throw new Error("Unsupported action.");
    if (!tab.generation || !op.ref.startsWith(tab.generation + ":"))
      throw new Error("STALE_REF: take a fresh snapshot.");
    tab.generation = "";
    const result = await wc.executeJavaScriptInIsolatedWorld(999, [
      {
        code: `(() => { try { return {value:globalThis.nativepiBrowser.act(${JSON.stringify(op.ref)},${JSON.stringify(op.action)},${JSON.stringify(op.text)})}; } catch(error) { return {error:String(error).slice(0,1000)}; } })()`,
      },
    ]);
    if (result.error) throw new Error(result.error);
    return result.value;
  }
}
const chromeOwners = new Map<number, SharedBrowser>();
ipcMain.handle("nativepi:browser-chrome", async (event, raw: unknown) => {
  const owner = chromeOwners.get(event.sender.id);
  if (!owner || event.senderFrame !== event.sender.mainFrame)
    throw new Error("Browser chrome only.");
  try {
    return await owner.chrome(raw);
  } catch (error) {
    return { error: String(error).slice(0, 4000) };
  }
});
