import { requestParams } from "./request-params.ts";
import type { HostRequestName, HostRequests } from "./rpc-schema.ts";
export const desktopOnlyResponses = {
  pickProject: { path: null },
  importSession: { ok: false, canceled: true },
  windowMinimize: { ok: false },
  windowToggleMaximize: { maximized: false },
  windowClose: { ok: false },
  confirmQuit: { ok: false },
  windowIsMaximized: { maximized: false },
  openExternal: { ok: false },
  listEditors: { editors: [] },
  openProjectIn: { ok: false, error: "This action is only available in the desktop app." },
  openFileIn: { ok: false, error: "This action is only available in the desktop app." },
  showInFolder: { ok: false },
  saveImage: { ok: false, error: "Save this image from the browser instead." },
  updateState: { status: "unsupported", channel: "stable" },
  checkForUpdate: { status: "unsupported", channel: "stable" },
  setUpdateChannel: { status: "unsupported", channel: "stable" },
  installUpdate: { ok: false, error: "Updates can only be managed from the desktop app." },
  accessStatus: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  startLocalAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  stopLocalAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  replaceAccessLink: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  revokeAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  startRemoteAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
  stopRemoteAccess: {
    local: { running: true, links: [], clients: [] },
    remote: { state: "error", error: "Access can only be managed from the desktop app." },
  },
} satisfies {
  [K in HostRequestName]?: HostRequests[K]["response"];
};
type RequestPolicy = {
  [K in HostRequestName]: {
    kind: "shared";
  } | {
    kind: "desktop";
    response: HostRequests[K]["response"];
  };
};
/** Authenticated browser requests share host validation; native UI has explicit denials. */
export const requestPolicy = Object.fromEntries(Object.keys(requestParams).map(name => [
  name, Object.hasOwn(desktopOnlyResponses, name)
    ? { kind: "desktop", response: desktopOnlyResponses[name as keyof typeof desktopOnlyResponses] }
    : { kind: "shared" },
])) as RequestPolicy;
