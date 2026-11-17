import { leaseRendererDocument } from "./clientLeases.ts";
import { app, BrowserWindow, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import { DEFAULT_PREFERENCES } from "../shared/rpc-schema.ts";
import type { HostRequestName, HostRequests } from "../shared/rpc-schema.ts";
import { installDiagnostics, recordRendererCrash, recordRendererLog } from "./diagnostics.ts";
import { bindWindowMaterial, hasWindowMaterial, updateWindowMaterial } from "./windowMaterial.ts";
import { protectDesktopEdits } from "./service/desktopClose.ts";
import { ServiceClient } from "./service/client.ts";
import { connectHost, hostStatus, runHost, serviceFile, serviceMode, setLogin } from "./service/lifecycle.ts";
import { serviceActionSchema } from "../shared/background-service.ts";
import { validateHostRequest } from "../shared/request-params.ts";
import { checkForUpdate, installUpdate, setUpdateChannel, startUpdates, updateState } from "./updates.ts";
// Resolve the original product data directory before splitting Electron profiles.
app.setName("NativePi");
// Only the service imports ipc.ts and can allocate Pi runtimes or persist host state.
const configuredData = process.argv.find(arg => arg.startsWith("--nativepi-data-dir="))?.slice("--nativepi-data-dir=".length)
  ?? (!app.isPackaged ? process.env.NATIVEPI_DEV_USER_DATA : undefined);
if (configuredData) app.setPath("userData", configuredData);
const hostData = app.getPath("userData");
if (!serviceMode) app.setPath("userData", join(hostData, "desktop-client"));
let service = new ServiceClient(serviceFile(hostData), () => {}, () => {});
let startup: Promise<void> | undefined;
function ensureHost() { return startup ??= connectHost(service, hostData).finally(() => { startup = undefined; }); }
let serviceStopped = false;
ipcMain.handle("nativepi:service", async (_event, action: unknown) => {
  if (_event.senderFrame !== _event.sender.mainFrame) throw new Error("Main document required");
  switch (serviceActionSchema.parse(action)) {
    case "start":
      service.dispose();
      service = new ServiceClient(serviceFile(hostData), () => {}, () => {});
      serviceStopped = false; await ensureHost(); break;
    case "stop": {
      const control = new ServiceClient(serviceFile(hostData), () => {}, () => {});
      try { await control.stop(); } finally { control.dispose(); }
      serviceStopped = true;
      for (let attempt = 0; attempt < 50; attempt++) {
        const status = await hostStatus(hostData);
        if (!status.running) return status;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error("The background service is still stopping. Wait before starting it again.");
    }
    case "enableLogin": await setLogin(true, hostData); break;
    case "disableLogin": await setLogin(false, hostData); break;
  }
  return hostStatus(hostData);
});
// This bridge is desktop-only; Local Access cannot raise the owner's window.
ipcMain.handle("nativepi:focus-window", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || event.senderFrame !== event.sender.mainFrame) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});
const rendererClients = new Map<number, ServiceClient>();
const closeGuards = new Map<number, ReturnType<typeof protectDesktopEdits>>();
ipcMain.handle("nativepi:invoke", async (event, name: HostRequestName, raw: unknown) => {
  if (event.senderFrame !== event.sender.mainFrame) throw new Error("Main document required");
  const params = validateHostRequest(name, raw ?? {}) as HostRequests[typeof name]["params"];
  const win = BrowserWindow.fromWebContents(event.sender);
  switch (name) {
    case "windowMinimize": win?.minimize(); return { ok: true };
    case "windowToggleMaximize": if (win?.isMaximized()) win.unmaximize(); else win?.maximize(); return { maximized: win?.isMaximized() ?? false };
    case "windowIsMaximized": return { maximized: win?.isMaximized() ?? false };
    case "windowIsFullScreen": return { fullscreen: win?.isFullScreen() ?? false };
    case "windowClose": win?.close(); return { ok: true };
    case "confirmQuit": { const guard = closeGuards.get(event.sender.id); if (guard) guard.confirmed = true; app.quit(); return { ok: true }; }
    case "workspaceDirty": { const guard = closeGuards.get(event.sender.id); if (guard) guard.files = (params as HostRequests["workspaceDirty"]["params"]).files; break; }
    case "updateState": return updateState();
    case "checkForUpdate": return checkForUpdate();
    case "setUpdateChannel": return setUpdateChannel((params as HostRequests["setUpdateChannel"]["params"]).channel);
    case "installUpdate":
      if (updateState().status !== "ready") return { ok: false, error: "No update has finished downloading. Check for updates again." };
      if ([...closeGuards.values()].some(guard => guard.files.length)) return { ok: false, error: "Save or close your edited files before installing." };
      if ((await hostStatus(hostData)).running) return { ok: false, error: "Stop the background service in Settings before installing. This ends its agents and terminals." };
      installUpdate(); return { ok: true };
  }
  if (serviceStopped) throw new Error("Background service stopped. Start it in Settings.");
  let client = rendererClients.get(event.sender.id);
  if (!client) {
    client = new ServiceClient(serviceFile(hostData), (channel, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    }, (connected, error) => {
      if (!event.sender.isDestroyed()) event.sender.send("nativepi:connection", { connected, error });
    });
    rendererClients.set(event.sender.id, client);
    const current = client;
    leaseRendererDocument(current, event.sender, () => { if (rendererClients.get(event.sender.id) === current) rendererClients.delete(event.sender.id); });
  }
  const result = await client.request(name, params);
  if (name === "saveState") {
    const preferences = (params as HostRequests["saveState"]["params"]).state.preferences;
    updateWindowMaterial(preferences);
    const { updateBrowserPreferences } = await import("./browser/desktop.ts");
    await updateBrowserPreferences(preferences);
  }
  return result;
});
// Not named `__dirname`: rolldown injects a CommonJS `__dirname` shim at the top
// of the main bundle, and a same-named top-level const collides with it at load.
const mainDir = import.meta.dirname;
installDiagnostics();
// Desktop and host use distinct Electron profiles and locks. Every host launch
// uses the original profile, so duplicate starts cannot allocate competing Pi owners.
if (!app.requestSingleInstanceLock())
  app.exit(0);
let quitting = false;

app.on("second-instance", () => {
  if (serviceMode) return;
  if (quitting) return;
  const win = BrowserWindow.getAllWindows()[0];
  // No window but not quitting: macOS keeps the app alive after the last close.
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized())
    win.restore();
  // `show` as well as `focus`: the window starts hidden until `ready-to-show`,
  // and focusing a window that was never shown leaves the user with nothing.
  win.show();
  win.focus();
});
let creatingWindow: Promise<void> | undefined;
function createWindow(): Promise<void> {
  // A second launch can arrive while the saved appearance is being read.
  return creatingWindow ??= createMainWindow().finally(() => { creatingWindow = undefined; });
}
async function createMainWindow(): Promise<void> {
  // Still open the renderer if state is unreadable so its recovery UI can explain it.
  const { preferences } = await service.request("loadState", {}).then(value => value as { preferences: typeof DEFAULT_PREFERENCES }).catch(() => ({ preferences: DEFAULT_PREFERENCES }));
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    title: "NativePi",
    icon: join(mainDir, "../../resources/icon.png"),
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 560,
    show: false,
    // macOS keeps a real frame so the traffic lights stay native and on the
    // left; Windows and Linux stay frameless and NativePi draws the buttons.
    frame: !isMac,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 16, y: 17 } : undefined,
    backgroundColor: "#1b1b1b",
    transparent: isMac,
    // Keep vibrancy active even while another application has focus.
    visualEffectState: isMac ? "active" : undefined,
    webPreferences: {
      preload: join(mainDir, "../preload/index.cjs"),
      additionalArguments: hasWindowMaterial ? ["--nativepi-window-material"] : [],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const browserClient = new ServiceClient(serviceFile(hostData), () => {}, () => {});
  void ensureHost().then(async () => {
    const { desktopBrowserCommand } = await import("./browser/desktop.ts");
    await browserClient.attachBrowser(desktopBrowserCommand);
  }).catch(error => console.error("Browser connection failed", error));
  win.once("closed", () => browserClient.dispose());

  bindWindowMaterial(win, preferences);
  // Only NativePi's main document may capture microphone audio. Artifacts and
  // embedded extension frames must not inherit that grant; other permissions
  // retain Electron's existing default behavior.
  win.webContents.session.setPermissionCheckHandler((contents, permission, _origin, details) =>
    permission !== "media" || (contents === win.webContents && details.isMainFrame && details.mediaType === "audio"));
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const audio = "mediaTypes" in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === "audio";
    callback(permission !== "media" || (contents === win.webContents && details.isMainFrame && !!audio));
  });

  // The renderer's beforeunload protects unsaved buffers. Pi and terminals
  // stay in the independent service, including when this renderer crashes.
  const contentsId = win.webContents.id;
  closeGuards.set(contentsId, protectDesktopEdits(win));
  win.on("closed", () => { closeGuards.delete(contentsId); });
  win.webContents.on("console-message", (_event, level, message) => recordRendererLog(level, message));
  win.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") {
      recordRendererCrash("render-process-gone", `${details.reason} (exit ${details.exitCode})`);
    }
  });
  win.on("ready-to-show", () => win.show());
  const sendMaximized = () => {
    win.webContents.send("windowMaximized", { maximized: win.isMaximized() });
  };
  win.on("enter-full-screen", () => {
    win.webContents.send("windowFullScreen", { fullscreen: true });
  });
  win.on("leave-full-screen", () => {
    win.webContents.send("windowFullScreen", { fullscreen: false });
  });
  win.on("maximize", sendMaximized);
  win.on("unmaximize", sendMaximized);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  // Chromium does not draw an editable-field menu for a frameless Electron
  // window. Keep the platform edit and spellcheck behavior as a fallback; app
  // surfaces with richer actions prevent the DOM contextmenu event themselves.
  win.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.selectionText)
      return;
    const template: MenuItemConstructorOptions[] = [];
    for (const suggestion of params.dictionarySuggestions) {
      template.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) });
    }
    if (params.misspelledWord) {
      template.push({
        label: "Add to dictionary",
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
    }
    if (template.length > 0)
      template.push({ type: "separator" });
    if (params.isEditable) {
      template.push({ role: "cut", enabled: params.editFlags.canCut }, { role: "copy", enabled: params.editFlags.canCopy }, { role: "paste", enabled: params.editFlags.canPaste }, { type: "separator" }, { role: "selectAll", enabled: params.editFlags.canSelectAll });
    }
    else {
      template.push({ role: "copy", enabled: params.editFlags.canCopy });
    }
    Menu.buildFromTemplate(template).popup({ window: win });
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  }
  else {
    void win.loadFile(join(mainDir, "../renderer/index.html"));
  }
}
if (serviceMode) {
  app.on("window-all-closed", () => {});
  app.whenReady().then(() => runHost(hostData)).catch(error => { console.error("Host startup failed", error); app.exit(1); });
} else {
  app.whenReady().then(async () => {
    const isMac = process.platform === "darwin";
    const template: MenuItemConstructorOptions[] = [
      ...(isMac ? [{ role: "appMenu" } as const] : []),
      { label: "File", submenu: isMac
        ? [{ label: "Close Window", click: () => BrowserWindow.getFocusedWindow()?.close() }]
        : [{ role: "quit" }] },
      { role: "editMenu" },
      { label: "View", submenu: [
        { role: "togglefullscreen" },
        {
          label: "Toggle Developer Tools",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools(),
        },
      ] },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }] },
    ];
    // Workspace tabs and interface scale own their shortcuts. Leave browser
    // reload and page zoom out of the native menu so they have no accelerators.
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    await ensureHost().catch(error => console.error("Host unavailable", error instanceof Error ? error.message : "Startup failed"));
    startUpdates(state => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send("updateState", state); }, hostData);
    await createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => { quitting = true; service.dispose(); for (const client of rendererClients.values()) client.dispose(); });
}
