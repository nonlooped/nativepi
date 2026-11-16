import type { BrowserWindow } from "electron";
/** Closing a client protects only unsaved editor buffers, never stops host work. */
export function protectDesktopEdits(win: Pick<BrowserWindow, "on" | "webContents">) {
  const state = { files: [] as string[], confirmed: false };
  let responsive = true;
  win.on("unresponsive", () => { responsive = false; });
  win.on("responsive", () => { responsive = true; });
  win.webContents.on("render-process-gone", () => { responsive = false; });
  win.on("close", event => {
    if (!state.confirmed && responsive && !win.webContents.isCrashed() && state.files.length) {
      event.preventDefault();
      win.webContents.send("quitRequested", { work: { runs: [], terminals: [], viewers: 0, dirtyFiles: state.files } });
    }
  });
  win.webContents.on("will-prevent-unload", event => { if (state.confirmed) event.preventDefault(); });
  return state;
}
