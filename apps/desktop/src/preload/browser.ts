import { contextBridge, ipcRenderer } from "electron";
// This bridge is installed only in the bundled app-owned browser chrome.
contextBridge.exposeInMainWorld("nativepiBrowser", {
  platform: process.platform,
  invoke: (raw: unknown) => ipcRenderer.invoke("nativepi:browser-chrome", raw),
  onState: (listener: (state: unknown) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      listener(raw);
    };
    ipcRenderer.on("nativepi:browser-state", receive);
    return () => ipcRenderer.removeListener("nativepi:browser-state", receive);
  },
  onTheme: (listener: (theme: unknown) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      listener(raw);
    };
    ipcRenderer.on("nativepi:browser-theme", receive);
    return () => ipcRenderer.removeListener("nativepi:browser-theme", receive);
  },
});
