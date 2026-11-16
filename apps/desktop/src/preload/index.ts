import type { ServiceAction, ServiceStatus } from "../shared/background-service.ts";
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import { validHostEvent } from "../shared/host-events.ts";
import { hostEventKeys } from "../shared/rpc-schema.ts";
import type { HostEventName, HostEvents, HostRequestName, HostRequests } from "../shared/rpc-schema.ts";
// contextBridge clones exposed objects and strips Proxy traps, so the renderer
// builds per-channel request functions over this single invoke boundary.
export type NativePiApi = {
  browserPanel?: {
    onChange(listener: (id: string | null) => void): () => void;
    layout(id: string, bounds?: { x: number; y: number; width: number; height: number }): Promise<void>;
  };
  windowMaterial?: boolean;
  service?: (action: ServiceAction) => Promise<ServiceStatus>;
  connection?: (listener: (state: { connected: boolean; error?: string }) => void) => () => void;
  focusWindow?: () => Promise<void>;
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
  browserPanel: {
    onChange(listener) { const receive = (_event: IpcRendererEvent, id: string | null) => listener(id); ipcRenderer.on("nativepi:browser-panel", receive); return () => { ipcRenderer.removeListener("nativepi:browser-panel", receive); }; },
    layout: (id, bounds) => ipcRenderer.invoke("nativepi:browser-panel", { id, bounds }),
  },
  service: action => ipcRenderer.invoke("nativepi:service", action),
  connection: listener => {
    const handler = (_event: IpcRendererEvent, state: { connected: boolean; error?: string }) => listener(state);
    ipcRenderer.on("nativepi:connection", handler);
    return () => { ipcRenderer.removeListener("nativepi:connection", handler); };
  },
  focusWindow: () => ipcRenderer.invoke("nativepi:focus-window"),
  windowMaterial: process.argv.includes("--nativepi-window-material"),
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
