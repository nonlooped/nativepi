import { app, BrowserWindow, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc, setMainWindow, stopAllPi } from "./ipc.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

app.setName("NativePi");

function createWindow(): void {
  const win = new BrowserWindow({
    title: "NativePi",
    icon: join(__dirname, "../../resources/icon.png"),
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 560,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0c0c0e",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setMainWindow(win);

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
    void win.loadFile(join(__dirname, "../renderer/index.html"));
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
