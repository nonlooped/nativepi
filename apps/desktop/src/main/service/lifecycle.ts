import { app } from "electron";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SERVICE_PROTOCOL, serviceDescriptorSchema, type ServiceStatus } from "../../shared/background-service.ts";
import { ServiceClient } from "./client.ts";
import { serveHost } from "./server.ts";

export const serviceMode = process.argv.includes("--nativepi-service");
export function serviceFile(root: string) { return join(root, "background", "host.json"); }
export function launchHost(root: string) {
  const args = [...(app.isPackaged ? [] : [app.getAppPath()]), "--nativepi-service", `--nativepi-data-dir=${root}`];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.env.APPIMAGE || process.execPath, args, { detached: true, stdio: "ignore", env });
  child.on("error", () => {});
  child.unref();
}
export async function connectHost(client: ServiceClient, root: string) {
  // A stale descriptor is never proof that a host is alive. Electron's
  // single-instance lock arbitrates concurrent start requests and crash recovery.
  try { await client.connect(); return; } catch (error) {
    if (error instanceof Error && error.message.includes("incompatible")) throw error;
  }
  launchHost(root);
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await client.connect(); return; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("NativePi could not start its background service. Retry in Settings.", { cause: lastError });
}
export async function runHost(root: string) {
  const host = await import("../ipc.ts");
  const directory = join(root, "background");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
  const server = await serveHost({
    createClient: () => new host.HostClient(), invoke: host.invokeHostRequest, subscribe: listener => { const off = host.subscribeHostEvents(listener); const offDesktop = host.subscribeDesktopEvents(listener); return () => { off(); offDesktop(); }; },
    stop: async () => { await host.shutdownHost(); setTimeout(() => app.quit(), 100); },
  });
  const discovery = `${serviceFile(root)}.${process.pid}.tmp`;
  await writeFile(discovery, JSON.stringify({ protocol: SERVICE_PROTOCOL, version: app.getVersion(), pid: process.pid, port: server.port, token: server.token }), { mode: 0o600 });
  await rename(discovery, serviceFile(root));
  host.initializeHost();
  let stopping = false;
  app.on("before-quit", event => {
    if (stopping) return;
    event.preventDefault(); stopping = true;
    void host.shutdownHost().finally(async () => {
      await server.close(); await rm(serviceFile(root), { force: true }); app.quit();
    });
  });
  process.once("SIGTERM", () => app.quit());
  process.once("SIGINT", () => app.quit());
}
const loginArgs = (root: string) => ["--nativepi-service", `--nativepi-data-dir=${root}`];
const linuxEntry = () => join(process.env.XDG_CONFIG_HOME || join(app.getPath("home"), ".config"), "autostart", "nativepi.desktop");
const macEntry = () => join(app.getPath("home"), "Library", "LaunchAgents", "dev.nativepi.background.plist");
export async function loginEnabled(root: string): Promise<boolean> {
  if (process.platform === "win32") return app.getLoginItemSettings({ path: process.execPath, args: loginArgs(root) }).openAtLogin;
  try { await readFile(process.platform === "darwin" ? macEntry() : linuxEntry()); return true; } catch { return false; }
}
export async function setLogin(enabled: boolean, root: string) {
  if (!app.isPackaged) throw new Error("Start at login is available in installed builds.");
  const args = loginArgs(root);
  if (process.platform === "win32") {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args });
    return;
  }
  const file = process.platform === "darwin" ? macEntry() : linuxEntry();
  if (!enabled) { await rm(file, { force: true }); return; }
  await mkdir(join(file, ".."), { recursive: true });
  const command = [process.env.APPIMAGE || process.execPath, ...args];
  if (process.platform === "darwin") {
    const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    await writeFile(file, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>dev.nativepi.background</string><key>ProgramArguments</key><array>${command.map(arg => `<string>${xml(arg)}</string>`).join("")}</array><key>RunAtLoad</key><true/></dict></plist>`, { mode: 0o600 });
  } else {
    const quote = (value: string) => '\"' + value.replace(/[\\"`$]/g, "\\$&").replace(/%/g, "%%") + '\"';
    await writeFile(file, `[Desktop Entry]\nType=Application\nName=NativePi background service\nExec=${command.map(quote).join(" ")}\nTerminal=false\n`, { mode: 0o600 });
  }
}
export async function hostStatus(root: string): Promise<ServiceStatus> {
  const startAtLogin = await loginEnabled(root);
  try {
    const descriptor = serviceDescriptorSchema.parse(JSON.parse(await readFile(serviceFile(root), "utf8")));
    const probe = new ServiceClient(serviceFile(root), () => {}, () => {});
    try { await probe.probe(); } finally { probe.dispose(); }
    return { running: true, compatible: descriptor.protocol === SERVICE_PROTOCOL, version: descriptor.version, startAtLogin };
  } catch { return { running: false, compatible: true, startAtLogin }; }
}
