import { app, BrowserWindow, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import type { HostRequestName, HostRequests } from "../shared/rpc-schema.ts";
import { installDiagnostics, recordRendererCrash, recordRendererLog } from "./diagnostics.ts";

type Host = typeof import("./ipc.ts");
let host: Host | undefined;
let hostPromise: Promise<Host> | undefined;

function loadHost(): Promise<Host> {
  return hostPromise ??= import("./ipc.ts").then((loaded) => (host = loaded));
}

ipcMain.handle("nativepi:invoke", async (_event, name: HostRequestName, params: unknown) => {
  const loaded = await loadHost();
  return loaded.invokeHostRequest(name, (params ?? {}) as HostRequests[typeof name]["params"]);
});

// Not named `__dirname`: rolldown injects a CommonJS `__dirname` shim at the top
// of the main bundle, and a same-named top-level const collides with it at load.
const mainDir = import.meta.dirname;
const webDevelopment = process.env["NATIVEPI_WEB_DEV_PORT"] !== undefined;

app.setName("NativePi");
installDiagnostics();

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

let quitting = false;
let relaunchAfterQuit = false;

app.on("second-instance", () => {
  // The lock is held until this process exits, so a launch that arrives while
  // `stopAllPi` is still running lands here with no window left to raise.
  // Handing it to a second process instead would put two owners on the Pi
  // children and the state file, so honour it by relaunching once this one has
  // finished shutting down.
  if (quitting) {
    relaunchAfterQuit = true;
    return;
  }
  if (webDevelopment) return;
  const win = BrowserWindow.getAllWindows()[0];
  // No window but not quitting: macOS keeps the app alive after the last close.
  if (!win) {
    createWindow();
    return;
  }
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

  host?.setMainWindow(win);

  /**
   * Closing is where an agent turn and a shell die, so it is where the user is
   * asked. Held here rather than in `before-quit`, which can run after the
   * window is already gone and leave nothing left to show a dialog in. A quit
   * that is already under way is let through: by then the answer has been
   * given, or the OS is ending the session and is not waiting for one.
   *
   * A renderer that has crashed or hung is let through too: it can neither draw
   * the confirmation nor answer it, and holding the close for one would leave
   * the window, its Pi processes and its shells with no way out short of a
   * force-kill. An unanswerable question is worse than no question.
   */
  let rendererAnswers = true;
  win.on("unresponsive", () => (rendererAnswers = false));
  win.on("responsive", () => (rendererAnswers = true));
  win.webContents.on("console-message", (_event, level, message) => recordRendererLog(level, message));
  win.webContents.on("render-process-gone", (_event, details) => {
    rendererAnswers = false;
    if (details.reason !== "clean-exit") {
      recordRendererCrash("render-process-gone", `${details.reason} (exit ${details.exitCode})`);
    }
  });

  win.on("close", (event) => {
    if (quitting || !rendererAnswers || win.webContents.isCrashed()) return;
    if (host?.quitBlocked()) event.preventDefault();
  });

  win.on("closed", () => host?.setMainWindow(null));

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

  // Chromium does not draw an editable-field menu for a frameless Electron
  // window. Keep the platform edit and spellcheck behavior as a fallback; app
  // surfaces with richer actions prevent the DOM contextmenu event themselves.
  win.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.selectionText) return;
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
    if (template.length > 0) template.push({ type: "separator" });
    if (params.isEditable) {
      template.push(
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste },
        { type: "separator" },
        { role: "selectAll", enabled: params.editFlags.canSelectAll },
      );
    } else {
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
  } else {
    void win.loadFile(join(mainDir, "../renderer/index.html"));
  }
}

async function startWebDevelopment(): Promise<void> {
  const port = Number(process.env["NATIVEPI_WEB_DEV_PORT"]);
  const token = process.env["NATIVEPI_DEV_GENERATION"];
  if (!Number.isInteger(port) || port < 1 || port > 65_535 || !token) {
    throw new Error("NativePi web development was started without a valid host configuration.");
  }

  const loaded = await loadHost();
  loaded.setMainWindow(null);
  loaded.initializeHost();
  await loaded.startWebDevelopmentHost(port, token);
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"] ?? "http://127.0.0.1:5173";
  console.info(`NativePi web development is ready at ${rendererUrl}`);
}

app.whenReady().then(() => {
  if (webDevelopment) {
    void startWebDevelopment().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      app.quit();
    });
    return;
  }

  createWindow();
  void loadHost().then((loaded) => {
    loaded.setMainWindow(BrowserWindow.getAllWindows()[0] ?? null);
    loaded.initializeHost();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!webDevelopment && process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void loadHost().then((loaded) => loaded.stopAllPi()).finally(() => {
    if (relaunchAfterQuit) app.relaunch();
    app.quit();
  });
});
