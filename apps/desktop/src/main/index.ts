import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { registerIpc, setMainWindow, stopAllPi } from "./ipc.ts";

// Not named `__dirname`: rolldown injects a CommonJS `__dirname` shim at the top
// of the main bundle, and a same-named top-level const collides with it at load.
const mainDir = import.meta.dirname;

app.setName("NativePi");

/**
 * One NativePi at a time.
 *
 * A second copy would keep its own Pi process per project and its own copy of
 * the state file, so the two would overwrite each other's projects, drafts and
 * pane sizes, and each would see the other's session writes as an external
 * edit. Electron hands the losing launch to the instance holding the lock,
 * which raises the window the user already has. `exit` rather than `quit`: this
 * process owns nothing yet, so there is nothing for `before-quit` to shut down.
 */
if (!app.requestSingleInstanceLock()) app.exit(0);

app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  // `show` as well as `focus`: the window starts hidden until `ready-to-show`,
  // and focusing a window that was never shown leaves the user with nothing.
  win.show();
  win.focus();
});

function createWindow(): void {
  const win = new BrowserWindow({
    title: "NativePi",
    icon: join(mainDir, "../../resources/icon.png"),
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 560,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0c0c0e",
    webPreferences: {
      preload: join(mainDir, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setMainWindow(win);

  win.on("closed", () => setMainWindow(null));

  win.on("ready-to-show", () => win.show());

  const sendMaximized = () => {
    win.webContents.send("windowMaximized", { maximized: win.isMaximized() });
  };
  win.on("maximize", sendMaximized);
  win.on("unmaximize", sendMaximized);

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(mainDir, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void stopAllPi().finally(() => app.quit());
});
