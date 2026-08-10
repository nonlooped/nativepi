import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import type { HostEventName, HostEvents, HostRequestName, HostRequests } from "../shared/rpc-schema.ts";

/**
 * The bridge.
 *
 * Requests cross as a single `invoke(name, params)` rather than one bound
 * function per channel. The hand-written list of 48 channel names this replaces
 * could only catch a name that does not exist, never the one someone forgot to
 * add — that failed at runtime as "not a function". The renderer rebuilds the
 * typed, per-channel shape over this in `lib/rpc.ts`, where a Proxy is possible;
 * contextBridge clones what it passes, so a Proxy cannot survive the crossing.
 *
 * Every `ipcMain` channel is one of `HostRequests`, so forwarding by name grants
 * the renderer nothing it could not already reach, and `invoke` on a channel
 * with no handler simply rejects.
 *
 * Events keep an explicit allowlist. They flow the other way — main decides when
 * to send — so the set a renderer may subscribe to is worth stating outright.
 */

/**
 * A map rather than an array so the allowlist is exhaustive: adding an event to
 * `HostEvents` without listing it here is a type error, where an array would
 * have compiled and then thrown the first time a renderer subscribed.
 */
const allowedEvents: Record<HostEventName, true> = {
  piStatus: true,
  piEvent: true,
  piError: true,
  sessionChangedExternally: true,
  sessionsChanged: true,
  projectFilesChanged: true,
  authPrompt: true,
  authNotice: true,
  windowMaximized: true,
  updateState: true,
  quitRequested: true,
  terminalData: true,
  terminalExit: true,
  terminalRestart: true,
  tuiFrame: true,
};

export type NativePiApi = {
  devGeneration: string;
  invoke: <K extends HostRequestName>(
    channel: K,
    params: HostRequests[K]["params"],
  ) => Promise<HostRequests[K]["response"]>;
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
    on: <K extends HostEventName>(
      channel: K,
      listener: (payload: HostEvents[K]) => void,
    ) => () => void;
  };
};

const api: NativePiApi = {
  devGeneration: __NATIVEPI_DEV_GENERATION__,
  invoke: (channel, params) => ipcRenderer.invoke(channel, params),
  filePath: (file) => webUtils.getPathForFile(file),
  events: {
    on(channel, listener) {
      if (!Object.hasOwn(allowedEvents, channel)) {
        throw new Error(`Unknown host event: ${String(channel)}`);
      }
      const handler = (_event: IpcRendererEvent, payload: HostEvents[typeof channel]) => {
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
