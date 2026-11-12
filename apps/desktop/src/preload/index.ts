import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import { validHostEvent } from "../shared/host-events.ts";
import { hostEventKeys } from "../shared/rpc-schema.ts";
import type { HostEventName, HostEvents, HostRequestName, HostRequests } from "../shared/rpc-schema.ts";
// contextBridge clones exposed objects and strips Proxy traps, so the renderer
// builds per-channel request functions over this single invoke boundary.
export type NativePiApi = {
  invoke: <K extends HostRequestName>(channel: K, params: HostRequests[K]["params"]) => Promise<HostRequests[K]["response"]>;
  /**
  * Where a dropped or picked `File` came from on disk.
  *
  * Chromium stopped exposing `File.path` and Electron replaced it with this,
  * which only main and preload can reach. A drop is the one place the renderer
  * needs a real path: a folder becomes a project and a `.jsonl` becomes an
  * imported chat, and neither is anything the browser could hand over as bytes.
  */
  filePath: (file: File) => string;
  events: {
    on: <K extends HostEventName>(channel: K, listener: (payload: HostEvents[K]) => void) => () => void;
  };
};
const api: NativePiApi = {
  invoke: (channel, params) => ipcRenderer.invoke("nativepi:invoke", channel, params),
  filePath: (file) => webUtils.getPathForFile(file),
  events: {
    on(channel, listener) {
      if (!Object.hasOwn(hostEventKeys, channel)) {
        throw new Error(`Unknown host event: ${String(channel)}`);
      }
      const handler = (_event: IpcRendererEvent, payload: HostEvents[typeof channel]) => {
        if (validHostEvent(channel, payload))
          listener(payload);
      };
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
  },
};
contextBridge.exposeInMainWorld("nativepi", api);
