import { afterAll, expect, mock, spyOn, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs/promises";
import * as sessions from "./sessions.ts";
import type { PiMessage } from "./pi/protocol.ts";
import type { TuiHostFrame } from "../shared/tui-frames.ts";
const root = await mkdtemp(join(tmpdir(), "nativepi-runtime-"));
const previous = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
const actualStat = fs.stat;
const actualWatch = sessions.watchSessionFile;
const statGates = new Map<string, { entered: ReturnType<typeof Promise.withResolvers<void>>; release: ReturnType<typeof Promise.withResolvers<void>> }>();
const fileWatches: Array<{ file: string; closed: boolean }> = [];
mock.module("node:fs/promises", () => ({ ...fs, stat: async (...args: Parameters<typeof fs.stat>) => {
  const gate = statGates.get(String(args[0]));
  if (gate)
    statGates.delete(String(args[0]));
  const result = await actualStat(...args);
  if (gate) {
    gate.entered.resolve();
    await gate.release.promise;
  }
  return result;
} }));
mock.module("./sessions.ts", () => ({ ...sessions, watchSessionFile: (...args: Parameters<typeof sessions.watchSessionFile>) => {
  const watch = { file: args[0], closed: false };
  fileWatches.push(watch);
  const stop = actualWatch(...args);
  return () => { watch.closed = true; stop(); };
} }));
function gateStat(file: string) {
  const gate = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
  statGates.set(file, gate);
  return gate;
}
const processes: FakePi[] = [];
let attachments = 0;
let blockStartup = false;
class FakePi {
  boundSessionFile?: string;
  isRunning = false;
  isAvailable = true;
  stopped = false;
  loaded = "";
  commands: unknown[] = [];
  logins = new Map<string, () => void>();
  loginProvider(_provider: string, _type: string, flowId: string) { return new Promise<void>(resolve => { this.logins.set(flowId, resolve); this.frame({ type: "nativepi_tui_auth_prompt", flowId, id: "same-pi-id", prompt: { kind: "text", message: "code" } }); }); }
  cancelStartup?: (error: Error) => void;
  constructor(readonly projectDir: string, readonly event: (value: PiMessage) => void, readonly exit: (code: number, error?: Error, expected?: boolean) => void, readonly frame: (value: TuiHostFrame) => void, args: string[]) {
    this.boundSessionFile = args.includes("--session") ? args[args.indexOf("--session") + 1] : join(root, `draft-${processes.length}.jsonl`);
    try {
      this.loaded = readFileSync(this.boundSessionFile!, "utf8");
    }
    catch { }
    processes.push(this);
  }
  async request(command: {
    type: string;
    [key: string]: unknown;
  }): Promise<any> {
    if (!this.isAvailable)
      throw new Error("stopped");
    this.commands.push(command);
    if (command.type === "get_state") {
      if (blockStartup)
        return new Promise((_, reject) => { this.cancelStartup = reject; });
      return { sessionFile: this.boundSessionFile };
    }
    return {};
  }
  emit(type: string) {
    if (type === "agent_start")
      this.isRunning = true;
    if (type === "agent_settled")
      this.isRunning = false;
    this.event({ type } as PiMessage);
  }
  send() { }
  sendRaw(value: unknown) { this.commands.push(value); }
  sendFrame(value: unknown) { this.commands.push(value); }
  async callExtension(extension: string, method: string, params: unknown) { this.commands.push({ extension, method, params }); return {}; }
  respondAuthPrompt(id: string, value: unknown) { this.commands.push({ id, value }); }
  getProviders() { return Promise.resolve([]); }
  async stop() {
    if (this.stopped)
      return;
    this.isAvailable = false;
    this.stopped = true;
    this.cancelStartup?.(new Error("stopped"));
    this.exit(0, undefined, true);
  }
}
mock.module("electron", () => ({ nativeTheme: new EventEmitter(), app: { getPath: () => root }, BrowserWindow: class {
  }, dialog: {}, shell: {}, powerSaveBlocker: { start: () => 1, isStarted: () => true, stop: () => { } } }));
mock.module("electron-updater", () => ({ default: { autoUpdater: {} } }));
mock.module("./pi/client.ts", () => ({ PiProcess: FakePi }));
mock.module("./terminal.ts", () => ({
  attachTerminal: () => { attachments++; return { output: "snapshot", sequence: 7 }; }, detachTerminal: () => { attachments--; },
  clearTerminal: () => { }, closeTerminal: () => { }, closeProjectTerminals: () => { }, createTerminal: () => { },
  listShellProfiles: () => [], listTerminals: () => [], liveTerminalProjects: () => [], renameTerminal: () => { }, terminalDiagnostics: () => [], resizeTerminal: () => { }, restartTerminal: () => { }, stopAllTerminals: () => { }, writeTerminal: () => { },
}));
const folderWatches: Array<{
  path: string;
  closed: boolean;
  notify: () => void;
}> = [];
let folderGate: ReturnType<typeof Promise.withResolvers<void>> | undefined;
mock.module("./fileExplorer.ts", () => ({
  readProjectDirectory: async () => [],
  watchProjectDirectory: async (_project: string, path: string, notify: () => void) => {
    const watcher = { path, closed: false, notify };
    folderWatches.push(watcher);
    await folderGate?.promise;
    return () => { watcher.closed = true; };
  },
}));
let origin: {
  port: number;
  token: string;
} | undefined;
let localMode = false;
let tunnelState: {
  state: "idle" | "running" | "starting";
  link?: string;
} = { state: "idle" };
let remoteGate: ReturnType<typeof Promise.withResolvers<void>> | undefined;
let originStarts = 0;
let tunnelGeneration = 0;
mock.module("./localServer.ts", () => ({
  localServerConnection: () => origin,
  localServerStatus: () => ({ running: localMode, links: [], clients: [] }),
  startLocalServer: async (options: {
    token?: string;
  }, local: boolean) => { originStarts++; origin = { port: 1, token: options.token ?? `token-${originStarts}` }; localMode = local; return { running: local, links: [], clients: [] }; },
  stopLocalServer: async () => { origin = undefined; localMode = false; },
}));
mock.module("./remoteAccess.ts", () => ({
  remoteAccessRunning: () => tunnelState.state !== "idle", remoteAccessStatus: () => tunnelState,
  startRemoteAccess: async () => {
    const generation = tunnelGeneration;
    tunnelState = { state: "starting" };
    await remoteGate?.promise;
    if (generation === tunnelGeneration)
      tunnelState = { state: "running", link: "public" };
    return tunnelState;
  },
  stopRemoteAccess: async () => { tunnelGeneration++; tunnelState = { state: "idle" }; },
}));
const { invokeHostRequest: request, HostClient, quitBlocked, shutdownHost, subscribeHostEvents } = await import("./ipc.ts");
afterAll(async () => {
  await shutdownHost();
  if (previous === undefined)
    delete process.env.PI_CODING_AGENT_DIR;
  else
    process.env.PI_CODING_AGENT_DIR = previous;
  await rm(root, { recursive: true, force: true });
});
async function session(name: string) {
  const file = join(root, name + ".jsonl");
  await writeFile(file, JSON.stringify({ type: "session", id: name, cwd: root }) + "\n");
  return { projectDir: root, sessionFile: file };
}
test("idle reclamation releases old projects while protecting viewers, extension work and prompts", async () => {
  const originalInterval = globalThis.setInterval;
  let sweep: (() => void) | undefined;
  const intervals = spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, ms: number) => {
    if (ms === 30_000) sweep = callback;
    return originalInterval(callback, ms);
  }) as typeof setInterval);
  let now = Date.now();
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  const client = new HostClient();
  const viewer = new HostClient();
  const created: FakePi[] = [];
  const targets: { projectDir: string; sessionFile: string }[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const target = { projectDir: join(root, `idle-project-${i}`), sessionFile: join(root, `idle-chat-${i}.jsonl`) };
      targets.push(target);
      await writeFile(target.sessionFile, JSON.stringify({ type: "session", id: `idle-${i}`, cwd: target.projectDir }) + "\n");
      await request("watchSession", target, client);
      expect(await request("ensurePi", target, client)).toEqual({ ok: true });
      created.push(processes.at(-1)!);
      if (i === 0) created[0]!.event({ type: "extension_ui_request", method: "setStatus", statusKey: "subagents", statusText: "1 running" });
      if (i === 1) await request("watchSession", target, viewer);
      if (i === 2) created[2]!.event({ type: "extension_ui_request", id: "pending", method: "confirm" });
      now += 60_000;
    }
    expect(created.every(pi => !pi.stopped)).toBe(true);
    created[0]!.event({ type: "extension_ui_request", method: "setStatus", statusKey: "subagents" });
    created[0]!.frame({ type: "nativepi_tui_open", surface: { id: "background-widget", key: "activity", placement: "aboveEditor" } });
    await request("extensionRespond", { ...targets[2]!, response: { type: "extension_ui_response", id: "pending", confirmed: true } }, client);
    now += 60_000;
    expect(sweep).toBeDefined();
    sweep!();
    await Promise.resolve();
    expect(created.map(pi => pi.stopped)).toEqual([false, false, true, false]);
    created[0]!.frame({ type: "nativepi_tui_close", surfaceId: "background-widget" });
    viewer.dispose();
    now += 60_000;
    sweep!();
    await Promise.resolve();
    expect(created[1]!.stopped).toBe(true);
    expect(created[0]!.stopped).toBe(true);
    expect(created[3]!.stopped).toBe(false);
  } finally { intervals.mockRestore(); clock.mockRestore(); client.dispose(); viewer.dispose(); }
});

test("slow idle disposal does not block a new chat and reacquiring it waits safely", async () => {
  const client = new HostClient();
  let now = Date.now();
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  const oldTarget = await session("slow-idle");
  const nextTarget = { ...await session("next-idle"), projectDir: join(root, "another-project") };
  const finish = Promise.withResolvers<void>();
  try {
    await request("watchSession", oldTarget, client);
    await request("ensurePi", oldTarget, client);
    const old = processes.at(-1)!;
    const stop = old.stop.bind(old);
    old.stop = async () => { old.isAvailable = false; await finish.promise; await stop(); };
    now += 60_000;
    await request("watchSession", nextTarget, client);
    expect(await request("ensurePi", nextTarget, client)).toEqual({ ok: true });
    expect(old.isAvailable).toBe(false);
    let recovered = false;
    const recovery = request("ensurePi", oldTarget, client).then(value => { recovered = true; return value; });
    await Promise.resolve();
    expect(recovered).toBe(false);
    finish.resolve();
    expect(await recovery).toEqual({ ok: true });
    expect(old.stopped).toBe(true);
    expect(processes.at(-1)).not.toBe(old);
  } finally { finish.resolve(); clock.mockRestore(); client.dispose(); }
});

test("owned turns do not rescan the sidebar, but outside session writes still notify it", async () => {
  const { SessionManager } = await import("@earendil-works/pi-coding-agent");
  const projectDir = join(root, "sidebar-project");
  const file = join(SessionManager.create(projectDir).getSessionDir(), "sidebar.jsonl");
  const target = { projectDir, sessionFile: file };
  await writeFile(file, JSON.stringify({ type: "session", id: "sidebar", cwd: projectDir }) + "\n");
  const client = new HostClient();
  let notifications = 0;
  const outside = Promise.withResolvers<void>();
  const off = subscribeHostEvents((name, payload) => {
    if (name === "sessionsChanged" && (payload as { projectDir: string }).projectDir === projectDir) {
      notifications++;
      outside.resolve();
    }
  });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await request("watchSession", target, client);
    await request("ensurePi", target, client);
    await request("watchProjectSessions", { projectDir }, client);
    const pi = processes.at(-1)!;
    pi.emit("agent_start");
    await writeFile(file, await readFile(file, "utf8") + JSON.stringify({ type: "future_entry", id: "own" }) + "\n");
    pi.emit("agent_settled");
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(notifications).toBe(0);
    await writeFile(file, await readFile(file, "utf8") + JSON.stringify({ type: "future_entry", id: "external" }) + "\n");
    await Promise.race([outside.promise, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error("Sidebar missed outside write")), 2000);
    })]);
    expect(notifications).toBeGreaterThan(0);
  } finally { clearTimeout(deadline); off(); client.dispose(); }
});

test("idle conflict blocks writes; reload retires stale Pi and next acquisition reads external entries", async () => {
  const target = await session("conflict");
  await request("ensurePi", target);
  const old = processes.at(-1)!;
  await writeFile(target.sessionFile, await readFile(target.sessionFile, "utf8") + JSON.stringify({ type: "future_entry", id: "external" }) + "\n");
  expect(await request("setModel", { ...target, provider: "test", modelId: "test" })).toMatchObject({ ok: false, error: expect.stringContaining("Reload") });
  expect(old.commands.filter((value: any) => value.type === "set_model")).toHaveLength(0);
  expect(await request("reloadSession", target)).toEqual({ ok: true });
  expect(old.stopped).toBe(true);
  expect(await request("setModel", { ...target, provider: "test", modelId: "test" })).toEqual({ ok: true });
  expect(processes.at(-1)!.loaded).toContain("external");
});
test("active hydration is explicit retry and settled hydration provides stable history and AFTER watermark", async () => {
  const target = await session("snapshot");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  pi.emit("agent_start");
  expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
  expect(await request("reloadSession", target)).toMatchObject({ ok: false });
  pi.emit("agent_settled");
  const value = await request("readSessionSnapshot", target);
  expect(value.consistency).toBe("stable");
  expect(value.entries).toHaveLength(1);
  expect(value.runtimeId).toBeString();
  expect(value.eventWatermark).toBeGreaterThan(0);
});
test("terminal interests are idempotent per client and surface, and disconnect releases only its leases", async () => {
  const a = new HostClient(), b = new HostClient();
  const target = { projectDir: root, terminalId: "term" };
  await request("terminalAttach", target, a);
  await request("terminalAttach", target, a);
  await request("terminalAttach", target, b);
  expect(attachments).toBe(2);
  await request("terminalDetach", { ...target, attachmentId: "unowned" }, a);
  expect(attachments).toBe(2);
  await request("terminalAttach", { ...target, attachmentId: "second-surface" }, a);
  expect(attachments).toBe(3);
  a.dispose();
  expect(attachments).toBe(1);
  b.dispose();
  expect(attachments).toBe(0);
});
test("draft identity stays null before bind and auth IDs route to their originating runtime", async () => {
  const events: unknown[] = [];
  const release = subscribeHostEvents((name, value) => {
    if (name === "piEvent")
      events.push(value);
  });
  await request("ensurePi", { projectDir: root, sessionFile: null });
  const draft = processes.at(-1)!;
  draft.emit("agent_start");
  draft.emit("agent_settled");
  expect(events).toMatchObject([{ sessionFile: undefined, runtimeId: expect.any(String) }, { sessionFile: undefined, runtimeId: expect.any(String) }]);
  release();
  const a = await session("auth-a"), b = await session("auth-b");
  await request("ensurePi", a);
  const pa = processes.at(-1)!;
  await request("ensurePi", b);
  const pb = processes.at(-1)!;
  const prompts: string[] = [];
  const stop = subscribeHostEvents((name, value) => {
    if (name === "authPrompt")
      prompts.push((value as {
        id: string;
      }).id);
  });
  for (const pi of [pa, pb])
    pi.frame({ type: "nativepi_tui_auth_prompt", id: "auth-1", prompt: { kind: "text", message: "code" } });
  expect(prompts[0]).not.toBe(prompts[1]);
  await request("authRespond", { projectDir: root, id: prompts[0]!, value: "A" });
  await request("authRespond", { projectDir: root, id: prompts[1]!, value: "B" });
  expect(pa.commands.at(-1)).toEqual({ id: "auth-1", value: { value: "A", cancel: undefined } });
  expect(pb.commands.at(-1)).toEqual({ id: "auth-1", value: { value: "B", cancel: undefined } });
  stop();
});
test("restart cancels acquisitions and waits without reviving stale startup", async () => {
  const target = await session("starting");
  blockStartup = true;
  const acquisition = request("ensurePi", target);
  await Promise.resolve();
  await Promise.resolve();
  const restart = request("restartPi", { projectDir: root });
  expect(await acquisition).toMatchObject({ ok: false });
  expect(await restart).toEqual({ ok: true });
  blockStartup = false;
  expect(await request("ensurePi", target)).toEqual({ ok: true });
  expect(processes.at(-1)!.stopped).toBe(false);
});
test("invalid payloads are rejected at the common boundary before allocation", async () => {
  const count = processes.length;
  for (const [name, params] of [["setModel", { projectDir: root }], ["installPackage", { projectDir: root, source: "test", scope: "other" }], ["extensionRespond", { projectDir: root, response: { type: "prompt", id: "x", message: "bad" } }], ["submit", { projectDir: root, sessionFile: null, message: "x", images: [{ type: "image", mimeType: "image/png", data: 4 }] }]] as const) {
    await expect(request(name as never, params as never)).rejects.toThrow();
  }
  expect(processes).toHaveLength(count);
});
test("access mode transitions preserve LAN token and revoke dominates pending public startup", async () => {
  await request("startLocalAccess", {});
  const original = origin!.token;
  const starts = originStarts;
  await request("startRemoteAccess", {});
  expect(origin!.token).toBe(original);
  expect(originStarts).toBe(starts + 1);
  // A same-mode origin request is allowed, but no origin teardown/token rotation.
  await request("stopRemoteAccess", {});
  expect(origin!.token).toBe(original);
  expect(localMode).toBe(true);
  remoteGate = Promise.withResolvers<void>();
  const start = request("startRemoteAccess", {});
  for (let i = 0; i < 12; i++)
    await Promise.resolve();
  const revoke = request("revokeAccess", {});
  remoteGate.resolve();
  await Promise.all([start, revoke]);
  expect(origin).toBeUndefined();
  expect(tunnelState.state).toBe("idle");
  remoteGate = undefined;
});
test("two client selections do not unwatch one another and a null selection releases only its lease", async () => {
  const a = await session("observer-a"), b = await session("observer-b");
  const ca = new HostClient(), cb = new HostClient();
  await request("ensurePi", a, ca);
  await request("ensurePi", b, cb);
  await request("watchSession", a, ca);
  await request("watchSession", b, cb);
  expect(ca.sessions.get(root)).toBe(a.sessionFile);
  expect(cb.sessions.get(root)).toBe(b.sessionFile);
  await request("watchSession", { projectDir: root, sessionFile: null }, ca);
  ca.dispose();
  expect(cb.sessions.get(root)).toBe(b.sessionFile);
  await writeFile(b.sessionFile, await readFile(b.sessionFile, "utf8") + JSON.stringify({ type: "future_entry", id: "outside" }) + "\n");
  expect(await request("setModel", { ...b, provider: "test", modelId: "test" }, cb)).toMatchObject({ ok: false });
  cb.dispose();
});
test("auth flow IDs isolate same-target retries and stale notices are ignored", async () => {
  const target = await session("flow");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const prompts: Array<any> = [], notices: Array<any> = [];
  const release = subscribeHostEvents((name, value) => {
    if (name === "authPrompt")
      prompts.push(value);
    if (name === "authNotice")
      notices.push(value);
  });
  const first = request("login", { ...target, providerId: "provider", type: "oauth", flowId: "old" });
  for (let i = 0; i < 5; i++)
    await Promise.resolve();
  expect(prompts.at(-1)).toMatchObject({ ...target, flowId: "old", runtimeId: expect.any(String) });
  pi.logins.get("old")!();
  await first;
  const second = request("login", { ...target, providerId: "provider", type: "oauth", flowId: "new" });
  for (let i = 0; i < 5; i++)
    await Promise.resolve();
  pi.frame({ type: "nativepi_tui_auth_notice", flowId: "old", notice: { kind: "info", message: "stale" } });
  pi.frame({ type: "nativepi_tui_auth_notice", flowId: "new", notice: { kind: "info", message: "current" } });
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ ...target, flowId: "new" });
  const id = prompts.at(-1).id;
  expect(await request("authRespond", { id, flowId: "old", value: "wrong" })).toEqual({ ok: false });
  expect(await request("authRespond", { id, flowId: "new", value: "right" })).toEqual({ ok: true });
  expect(pi.commands.at(-1)).toEqual({ id: "same-pi-id", value: { value: "right", cancel: undefined } });
  pi.logins.get("new")!();
  await second;
  release();
});
test("concurrent duplicate attachment requests release surplus allocations", async () => {
  const client = new HostClient();
  const target = { projectDir: root, terminalId: "parallel", attachmentId: "surface" };
  await Promise.all([request("terminalAttach", target, client), request("terminalAttach", target, client)]);
  expect(attachments).toBe(1);
  client.dispose();
  expect(attachments).toBe(0);
});
test("a cold file observer detects outside writes without starting Pi", async () => {
  const target = await session("cold-watch");
  const client = new HostClient();
  const count = processes.length;
  const changed = Promise.withResolvers<void>();
  const release = subscribeHostEvents((name, value) => {
    if (name === "sessionChangedExternally" && (value as {
      sessionFile: string;
    }).sessionFile === target.sessionFile)
      changed.resolve();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await request("watchSession", target, client);
    await writeFile(target.sessionFile, await readFile(target.sessionFile, "utf8") + JSON.stringify({ type: "future_entry", id: "outside-cold" }) + "\n");
    await Promise.race([changed.promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("cold observer missed change")), 2000); })]);
    expect(processes).toHaveLength(count);
  }
  finally {
    clearTimeout(timer);
    client.dispose();
    release();
  }
});
test("folder subscriptions union client interests and close late watcher allocations", async () => {
  const state = await request("loadState", {});
  await request("saveState", { state: { ...state, projects: [{ path: root, name: "fixture" }] } });
  const a = new HostClient(), b = new HostClient();
  await request("watchProjectDirectories", { projectDir: root, paths: ["a"] }, a);
  await request("watchProjectDirectories", { projectDir: root, paths: ["b"] }, b);
  const first = folderWatches.find(watch => watch.path === "a")!, second = folderWatches.find(watch => watch.path === "b")!;
  await request("watchProjectDirectories", { projectDir: root, paths: [] }, a);
  expect(first.closed).toBe(true);
  expect(second.closed).toBe(false);
  a.dispose();
  expect(second.closed).toBe(false);
  b.dispose();
  expect(second.closed).toBe(true);
  const late = new HostClient();
  folderGate = Promise.withResolvers<void>();
  await request("watchProjectDirectories", { projectDir: root, paths: ["late"] }, late);
  late.dispose();
  folderGate.resolve();
  for (let i = 0; i < 5; i++)
    await Promise.resolve();
  expect(folderWatches.at(-1)?.closed).toBe(true);
  folderGate = undefined;
});
test("disconnect during attach releases allocation before rejecting its result", async () => {
  const client = new HostClient();
  const attaching = request("terminalAttach", { projectDir: root, terminalId: "late-attach" }, client);
  client.dispose();
  await expect(attaching).rejects.toThrow("disconnected");
  expect(attachments).toBe(0);
});

async function appendOutside(file: string, id = "outside") {
  await writeFile(file, await readFile(file, "utf8") + JSON.stringify({ type: "future_entry", id }) + "\n");
}
async function replaceOutside(file: string) {
  const replacement = file + ".replacement";
  await writeFile(replacement, await readFile(file, "utf8") + JSON.stringify({ type: "future_entry", id: "outside-replaced" }) + "\n");
  await rename(replacement, file);
}
async function rejectStaleMutations(target: { projectDir: string; sessionFile: string }, pi: FakePi) {
  const before = pi.commands.length;
  for (const [name, params] of [
    ["setModel", { ...target, provider: "test", modelId: "test" }],
    ["renameChat", { ...target, name: "stale" }],
    ["submit", { ...target, message: "stale" }],
    ["callExtension", { ...target, extension: "test", method: "change", params: {} }],
    ["extensionRespond", { ...target, response: { type: "extension_ui_response", id: "test", confirmed: true } }],
    ["tuiSend", { ...target, frame: { type: "nativepi_tui_input", surfaceId: "test", data: "x" } }],
  ] as const)
    expect(await request(name, params)).toMatchObject({ ok: false, error: expect.stringContaining("Reload") });
  expect(pi.commands).toHaveLength(before);
}
for (const operation of ["fork", "clone"] as const) {
  for (const change of ["append", "replace"] as const) {
    test(`${operation} completion observes its replacement before external ${change} and rejects every stale mutation`, async () => {
      const target = await session(`${operation}-${change}-original`);
      const replacement = await session(`${operation}-${change}-new`);
      await request("ensurePi", target);
      const pi = processes.at(-1)!;
      const original = pi.request.bind(pi);
      pi.request = async command => {
        if (command.type === operation) {
          pi.frame({ type: "nativepi_tui_session", sessionFile: replacement.sessionFile });
          return { cancelled: false, text: "fork text" };
        }
        return original(command);
      };
      const result = operation === "clone" ? await request("cloneChat", target) : await request("forkChat", { ...target, entryId: "entry" });
      expect(result).toMatchObject({ ok: true, sessionFile: replacement.sessionFile });
      // Selection warming must reuse the same observed binding, not adopt later disk data.
      await request("ensurePi", replacement);
      expect(processes.at(-1)).toBe(pi);
      await (change === "append" ? appendOutside(replacement.sessionFile) : replaceOutside(replacement.sessionFile));
      await rejectStaleMutations(replacement, pi);
      expect(await request("reloadSession", replacement)).toEqual({ ok: true });
      expect(pi.stopped).toBe(true);
      expect(await request("renameChat", { ...replacement, name: "fresh" })).toEqual({ ok: true });
      expect(processes.at(-1)!.loaded).toContain("outside");
    });
  }
}
test("extension-driven replacement waits for its baseline and guards the new idle session", async () => {
  const target = await session("extension-original"), replacement = await session("extension-new");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const gate = gateStat(replacement.sessionFile);
  pi.callExtension = async () => {
    pi.frame({ type: "nativepi_tui_session", sessionFile: replacement.sessionFile });
    return { replaced: true };
  };
  let completed = false;
  const replacing = request("callExtension", { ...target, extension: "test", method: "replace", params: {} }).then(result => { completed = true; return result; });
  await gate.entered.promise;
  await Promise.resolve();
  expect(completed).toBe(false);
  gate.release.resolve();
  expect(await replacing).toEqual({ result: { replaced: true } });
  await appendOutside(replacement.sessionFile);
  await rejectStaleMutations(replacement, pi);
  expect(await request("reloadSession", replacement)).toEqual({ ok: true });
  expect(await request("setModel", { ...replacement, provider: "test", modelId: "fresh" })).toEqual({ ok: true });
  expect(processes.at(-1)!.loaded).toContain("outside");
});
test("clone without a session frame also waits for the replacement stat before success", async () => {
  const target = await session("clone-no-frame"), replacement = await session("clone-no-frame-new");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const original = pi.request.bind(pi);
  const gate = gateStat(replacement.sessionFile);
  pi.request = async command => {
    if (command.type === "clone") {
      pi.boundSessionFile = replacement.sessionFile;
      return { cancelled: false };
    }
    return original(command);
  };
  let completed = false;
  const cloning = request("cloneChat", target).then(result => { completed = true; return result; });
  await gate.entered.promise;
  expect(completed).toBe(false);
  gate.release.resolve();
  expect(await cloning).toMatchObject({ ok: true, sessionFile: replacement.sessionFile });
  await appendOutside(replacement.sessionFile);
  await rejectStaleMutations(replacement, pi);
});
async function externallyChanged(file: string, action: () => Promise<void>) {
  const changed = Promise.withResolvers<void>();
  const off = subscribeHostEvents((name, value) => {
    if (name === "sessionChangedExternally" && (value as { sessionFile: string }).sessionFile === file)
      changed.resolve();
  });
  const timer = setTimeout(() => changed.reject(new Error(`Missed external change: ${file}`)), 2000);
  try {
    await action();
    await changed.promise;
  }
  finally { clearTimeout(timer); off(); }
}
for (const observers of [1, 2]) {
  test(`reload retains ${observers} observer leases through append, replacement and last disconnect`, async () => {
    const target = await session(`reload-observers-${observers}`);
    const owners = Array.from({ length: observers }, () => new HostClient());
    try {
      for (const owner of owners)
        await request("watchSession", target, owner);
      await request("ensurePi", target, owners[0]);
      const count = processes.length;
      const watch = fileWatches.findLast(watch => watch.file === target.sessionFile)!;
      expect(await request("reloadSession", target, owners[0])).toEqual({ ok: true });
      expect(watch.closed).toBe(false);
      expect((await request("readSessionSnapshot", target, owners[0])).consistency).toBe("stable");
      await externallyChanged(target.sessionFile, () => appendOutside(target.sessionFile));
      if (observers === 2) {
        owners[0]!.dispose();
        expect(watch.closed).toBe(false);
      }
      await externallyChanged(target.sessionFile, () => replaceOutside(target.sessionFile));
      expect(processes).toHaveLength(count);
      owners.at(-1)!.dispose();
      expect(watch.closed).toBe(true);
    }
    finally { for (const owner of owners) owner.dispose(); }
  });
}
test("disconnect during cold watch setup cannot install a late watcher", async () => {
  const target = await session("late-file-watch");
  const owner = new HostClient();
  const gate = gateStat(target.sessionFile);
  const observing = request("watchSession", target, owner);
  await gate.entered.promise;
  owner.dispose();
  gate.release.resolve();
  await expect(observing).rejects.toThrow("disconnected");
  expect(fileWatches.filter(watch => watch.file === target.sessionFile)).toHaveLength(0);
  const fresh = new HostClient();
  await request("watchSession", target, fresh);
  await externallyChanged(target.sessionFile, () => appendOutside(target.sessionFile));
  fresh.dispose();
  expect(fileWatches.findLast(watch => watch.file === target.sessionFile)!.closed).toBe(true);
});

test("late session observation cannot overwrite a newer binding of the same runtime and path", async () => {
  const original = await session("binding-original"), next = await session("binding-next"), other = await session("binding-other");
  await request("ensurePi", original);
  const pi = processes.at(-1)!;
  const gate = gateStat(next.sessionFile);
  const errors = spyOn(console, "error").mockImplementation(() => { });
  try {
    pi.frame({ type: "nativepi_tui_session", sessionFile: next.sessionFile });
    await gate.entered.promise;
    pi.frame({ type: "nativepi_tui_session", sessionFile: other.sessionFile });
    await request("ensurePi", other);
    pi.frame({ type: "nativepi_tui_session", sessionFile: next.sessionFile });
    await request("ensurePi", next);
    await appendOutside(next.sessionFile);
    gate.release.resolve();
    for (let i = 0; i < 10; i++)
      await Promise.resolve();
    await rejectStaleMutations(next, pi);
    expect(errors).toHaveBeenCalledWith("Could not observe replacement session", expect.objectContaining({ message: "Pi session replacement was cancelled" }));
  }
  finally { gate.release.resolve(); errors.mockRestore(); }
});
test("reload during replacement stat retires the process and a late baseline cannot bless its successor", async () => {
  const target = await session("reload-rebind-original"), replacement = await session("reload-rebind-new");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const gate = gateStat(replacement.sessionFile);
  const errors = spyOn(console, "error").mockImplementation(() => { });
  try {
    pi.frame({ type: "nativepi_tui_session", sessionFile: replacement.sessionFile });
    await gate.entered.promise;
    expect(await request("reloadSession", replacement)).toEqual({ ok: true });
    expect(await request("ensurePi", replacement)).toEqual({ ok: true });
    const successor = processes.at(-1)!;
    expect(successor).not.toBe(pi);
    await appendOutside(replacement.sessionFile);
    gate.release.resolve();
    for (let i = 0; i < 10; i++)
      await Promise.resolve();
    await rejectStaleMutations(replacement, successor);
  }
  finally { gate.release.resolve(); errors.mockRestore(); }
});

test("write attribution: late clone completion cannot acknowledge a successor's external write", async () => {
  const a = await session("late-clone-a"), b = await session("late-clone-b");
  const observer = new HostClient();
  await request("watchSession", a, observer);
  await request("ensurePi", a);
  const old = processes.at(-1)!;
  const original = old.request.bind(old);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  old.request = async command => {
    if (command.type === "clone") {
      old.frame({ type: "nativepi_tui_session", sessionFile: b.sessionFile });
      entered.resolve();
      await release.promise;
      return { cancelled: false };
    }
    return original(command);
  };
  try {
    const cloning = request("cloneChat", a);
    await entered.promise;
    await request("ensurePi", b);
    expect(await request("ensurePi", a)).toEqual({ ok: true });
    const successor = processes.at(-1)!;
    expect(successor).not.toBe(old);
    expect(successor.loaded).not.toContain("outside");
    await appendOutside(a.sessionFile);
    release.resolve();
    expect(await cloning).toMatchObject({ ok: true, sessionFile: b.sessionFile });
    await rejectStaleMutations(a, successor);
  }
  finally { release.resolve(); observer.dispose(); }
});
test("write attribution: old extension completion cannot bless an idle successor after the watcher window", async () => {
  const a = await session("extension-successor-a"), b = await session("extension-successor-b");
  await request("ensurePi", a);
  const old = processes.at(-1)!;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  old.callExtension = async () => {
    old.frame({ type: "nativepi_tui_session", sessionFile: b.sessionFile });
    entered.resolve();
    await release.promise;
    return { finished: true };
  };
  try {
    const calling = request("callExtension", { ...a, extension: "fixture", method: "replace" });
    await entered.promise;
    await request("ensurePi", b);
    expect(await request("ensurePi", a)).toEqual({ ok: true });
    const successor = processes.at(-1)!;
    expect(successor).not.toBe(old);
    expect(successor.isRunning).toBe(false);
    expect(successor.loaded).not.toContain("outside");
    await externallyChanged(a.sessionFile, async () => {
      await appendOutside(a.sessionFile);
      await Bun.sleep(220);
    });
    release.resolve();
    expect(await calling).toEqual({ result: { finished: true } });
    await rejectStaleMutations(a, successor);
  }
  finally { release.resolve(); }
});
test("write attribution: A to B to A cannot let an old request acknowledge the new A binding", async () => {
  const a = await session("aba-request-a"), b = await session("aba-request-b");
  await request("ensurePi", a);
  const pi = processes.at(-1)!;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  pi.callExtension = async () => { entered.resolve(); await release.promise; return { finished: true }; };
  try {
    const calling = request("callExtension", { ...a, extension: "fixture", method: "wait" });
    await entered.promise;
    pi.frame({ type: "nativepi_tui_session", sessionFile: b.sessionFile });
    await request("ensurePi", b);
    pi.frame({ type: "nativepi_tui_session", sessionFile: a.sessionFile });
    await request("ensurePi", a);
    await appendOutside(a.sessionFile);
    release.resolve();
    expect(await calling).toEqual({ result: { finished: true } });
    await rejectStaleMutations(a, pi);
  }
  finally { release.resolve(); }
});

test("write attribution: a cold mutation owns its real writes before completion and advances only that baseline", async () => {
  const target = await session("cold-mutation");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const original = FakePi.prototype.request;
  const hook = spyOn(FakePi.prototype, "request").mockImplementation(async function (this: FakePi, command) {
    const result = await original.call(this, command);
    if (command.type === "set_model") {
      await appendOutside(this.boundSessionFile!, "own-cold-write");
      entered.resolve();
      await release.promise;
    }
    return result;
  });
  const changes: unknown[] = [];
  const off = subscribeHostEvents((name, value) => {
    if (name === "sessionChangedExternally" && (value as { sessionFile: string }).sessionFile === target.sessionFile)
      changes.push(value);
  });
  const count = processes.length;
  try {
    const setting = request("setModel", { ...target, provider: "test", modelId: "cold" });
    await entered.promise;
    const pi = processes.at(-1)!;
    expect(processes).toHaveLength(count + 1);
    expect(pi.loaded).not.toContain("own-cold-write");
    await Bun.sleep(220);
    expect(changes).toHaveLength(0);
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    expect(await request("reloadSession", target)).toMatchObject({ ok: false });
    release.resolve();
    expect(await setting).toEqual({ ok: true });
    expect(await request("renameChat", { ...target, name: "valid" })).toEqual({ ok: true });
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
  }
  finally { release.resolve(); hook.mockRestore(); off(); }
});
test("write attribution: cold draft controls and submit retain their own hidden-file baseline", async () => {
  const draft = { projectDir: join(root, "draft-project"), sessionFile: null };
  const original = FakePi.prototype.callExtension;
  const hook = spyOn(FakePi.prototype, "callExtension").mockImplementation(async function (this: FakePi, ...args) {
    const result = await original.apply(this, args);
    await writeFile(this.boundSessionFile!, JSON.stringify({ type: "session", id: "own-draft", cwd: draft.projectDir }) + "\n");
    return result;
  });
  try {
    expect(await request("callExtension", { ...draft, extension: "fixture", method: "write" })).toEqual({ result: {} });
    const pi = processes.at(-1)!;
    expect(await request("setModel", { ...draft, provider: "test", modelId: "draft" })).toEqual({ ok: true });
    expect(await request("submit", { ...draft, message: "/handled" })).toEqual({ ok: true, sessionFile: pi.boundSessionFile });
    expect(processes.at(-1)).toBe(pi);
    const target = { projectDir: draft.projectDir, sessionFile: pi.boundSessionFile! };
    expect(await request("renameChat", { ...target, name: "valid" })).toEqual({ ok: true });
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
  }
  finally { hook.mockRestore(); }
});
test("write attribution: every same-binding mutation preserves legitimate JSONL writes", async () => {
  const target = await session("same-binding-writes");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const original = pi.request.bind(pi);
  const ownWrite = () => appendFileSync(target.sessionFile, JSON.stringify({ type: "future_entry", id: `own-${pi.commands.length}` }) + "\n");
  pi.request = async command => {
    const result = await original(command);
    if (command.type !== "get_state")
      ownWrite();
    return result;
  };
  pi.callExtension = async () => { ownWrite(); return { written: true }; };
  pi.sendRaw = value => { pi.commands.push(value); ownWrite(); };
  pi.sendFrame = value => { pi.commands.push(value); ownWrite(); };
  for (const [name, params] of [
    ["setModel", { ...target, provider: "test", modelId: "valid" }],
    ["setThinkingLevel", { ...target, level: "high" }],
    ["renameChat", { ...target, name: "valid" }],
    ["compact", target],
    ["submit", { ...target, message: "/handled" }],
    ["enqueue", { ...target, behavior: "steer", message: "valid" }],
    ["extensionRespond", { ...target, response: { type: "extension_ui_response", id: "fixture", confirmed: true } }],
    ["tuiSend", { ...target, frame: { type: "nativepi_tui_input", surfaceId: "fixture", data: "valid" } }],
  ] as const)
    expect(await request(name, params)).toEqual({ ok: true, ...(name === "submit" ? { sessionFile: target.sessionFile } : {}) });
  expect(await request("callExtension", { ...target, extension: "fixture", method: "write" })).toEqual({ result: { written: true } });
  await Bun.sleep(220);
  expect(await request("renameChat", { ...target, name: "still valid" })).toEqual({ ok: true });
  await appendOutside(target.sessionFile);
  await rejectStaleMutations(target, pi);
});
test("write attribution: overlapping same-binding operations retain the last writer's protection", async () => {
  const target = await session("overlapping-writes");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const release = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  let index = 0;
  pi.callExtension = async () => {
    const slot = index++;
    appendFileSync(target.sessionFile, JSON.stringify({ type: "future_entry", id: `own-${slot}` }) + "\n");
    entered[slot]!.resolve();
    await release[slot]!.promise;
    return { slot };
  };
  try {
    const first = request("callExtension", { ...target, extension: "fixture", method: "first" });
    await entered[0]!.promise;
    const second = request("callExtension", { ...target, extension: "fixture", method: "second" });
    await entered[1]!.promise;
    release[0]!.resolve();
    expect(await first).toEqual({ result: { slot: 0 } });
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    expect(await request("reloadSession", target)).toMatchObject({ ok: false });
    expect(await request("deleteChat", target)).toMatchObject({ ok: false });
    expect(await request("setModel", { ...target, provider: "test", modelId: "valid" })).toEqual({ ok: true });
    release[1]!.resolve();
    expect(await second).toEqual({ result: { slot: 1 } });
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
  }
  finally { for (const gate of release) gate.resolve(); }
});
for (const replacement of ["successor", "aba", "new-file"] as const) {
  test(`write attribution: obsolete completion preserves ${replacement} binding's independent write ownership`, async () => {
    const a = await session(`overlap-${replacement}-a`), b = await session(`overlap-${replacement}-b`);
    await request("ensurePi", a);
    const old = processes.at(-1)!;
    const oldEntered = Promise.withResolvers<void>(), oldRelease = Promise.withResolvers<void>();
    const newEntered = Promise.withResolvers<void>(), newRelease = Promise.withResolvers<void>();
    old.callExtension = async () => { oldEntered.resolve(); await oldRelease.promise; return { old: true }; };
    try {
      const previous = request("callExtension", { ...a, extension: "fixture", method: "old" });
      await oldEntered.promise;
      old.frame({ type: "nativepi_tui_session", sessionFile: b.sessionFile });
      await request("ensurePi", b);
      const target = replacement === "new-file" ? b : a;
      if (replacement === "aba")
        old.frame({ type: "nativepi_tui_session", sessionFile: a.sessionFile });
      await request("ensurePi", target);
      const current = replacement === "successor" ? processes.at(-1)! : old;
      current.callExtension = async () => {
        await appendOutside(target.sessionFile, "own-new-write");
        newEntered.resolve();
        await newRelease.promise;
        return { current: true };
      };
      const next = request("callExtension", { ...target, extension: "fixture", method: "new" });
      await newEntered.promise;
      oldRelease.resolve();
      expect(await previous).toEqual({ result: { old: true } });
      await Bun.sleep(220);
      expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
      expect(await request("reloadSession", target)).toMatchObject({ ok: false });
      expect(await request("setModel", { ...target, provider: "test", modelId: "valid" })).toEqual({ ok: true });
      newRelease.resolve();
      expect(await next).toEqual({ result: { current: true } });
      expect(await request("renameChat", { ...target, name: "valid" })).toEqual({ ok: true });
      expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
      await appendOutside(target.sessionFile);
      await rejectStaleMutations(target, current);
    }
    finally { oldRelease.resolve(); newRelease.resolve(); }
  });
}
test("write attribution: failed replacement baseline stays closed instead of being observed by the next mutation", async () => {
  const a = await session("failed-baseline-a"), b = await session("failed-baseline-b");
  await request("ensurePi", a);
  const pi = processes.at(-1)!;
  const gate = gateStat(b.sessionFile);
  const errors = spyOn(console, "error").mockImplementation(() => { });
  try {
    pi.frame({ type: "nativepi_tui_session", sessionFile: b.sessionFile });
    await gate.entered.promise;
    const before = pi.commands.length;
    gate.release.reject(new Error("fixture baseline unavailable"));
    expect(await request("setModel", { ...b, provider: "test", modelId: "stale" })).toMatchObject({ ok: false });
    await appendOutside(b.sessionFile);
    expect(await request("renameChat", { ...b, name: "stale" })).toMatchObject({ ok: false });
    expect(pi.commands).toHaveLength(before);
    expect(await request("reloadSession", b)).toEqual({ ok: true });
    expect(await request("renameChat", { ...b, name: "fresh" })).toEqual({ ok: true });
    expect(processes.at(-1)!.loaded).toContain("outside");
  }
  finally { gate.release.resolve(); errors.mockRestore(); }
});

test("write attribution: cold acquisition stays busy before a binding exists", async () => {
  const target = await session("starting-mutation");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const original = FakePi.prototype.request;
  const hook = spyOn(FakePi.prototype, "request").mockImplementation(async function (this: FakePi, command) {
    if (command.type === "get_state" && this.boundSessionFile === target.sessionFile) {
      entered.resolve();
      await release.promise;
    }
    return original.call(this, command);
  });
  try {
    const setting = request("setModel", { ...target, provider: "test", modelId: "valid" });
    await entered.promise;
    expect(quitBlocked()).toBe(true);
    expect(await request("reloadSession", target)).toMatchObject({ ok: false });
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    release.resolve();
    expect(await setting).toEqual({ ok: true });
    expect(await request("renameChat", { ...target, name: "valid" })).toEqual({ ok: true });
  }
  finally { release.resolve(); hook.mockRestore(); }
});
test("write attribution: a running owner's settled event acknowledges its own writes", async () => {
  const target = await session("running-writes");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  pi.emit("agent_start");
  await appendOutside(target.sessionFile, "own-run-write");
  expect(await request("setModel", { ...target, provider: "test", modelId: "valid" })).toEqual({ ok: true });
  expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
  const gate = gateStat(target.sessionFile);
  try {
    pi.emit("agent_settled");
    await gate.entered.promise;
    gate.release.resolve();
    // The stat has completed; allow its acknowledgment continuation to publish.
    for (let i = 0; i < 5; i++)
      await Promise.resolve();
    expect(await request("renameChat", { ...target, name: "valid" })).toEqual({ ok: true });
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
  }
  finally { gate.release.resolve(); }
});
test("write attribution: replacement while completion stat is pending cannot acknowledge a newer A binding", async () => {
  const a = await session("pending-ack-a"), b = await session("pending-ack-b");
  await request("ensurePi", a);
  const pi = processes.at(-1)!;
  const original = pi.request.bind(pi);
  const finalizing = Promise.withResolvers<void>();
  let gate: ReturnType<typeof gateStat> | undefined;
  pi.request = async command => {
    const result = await original(command);
    if (command.type === "set_model") {
      gate = gateStat(a.sessionFile);
      finalizing.resolve();
    }
    return result;
  };
  try {
    const setting = request("setModel", { ...a, provider: "test", modelId: "valid" });
    await finalizing.promise;
    await gate!.entered.promise;
    pi.frame({ type: "nativepi_tui_session", sessionFile: b.sessionFile });
    await request("ensurePi", b);
    pi.frame({ type: "nativepi_tui_session", sessionFile: a.sessionFile });
    await request("ensurePi", a);
    await appendOutside(a.sessionFile);
    gate!.release.resolve();
    expect(await setting).toEqual({ ok: true });
    await rejectStaleMutations(a, pi);
  }
  finally { gate?.release.resolve(); }
});
test("write attribution: a same-binding completion keeps ownership until acknowledgment finishes", async () => {
  const target = await session("pending-own-ack");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const original = pi.request.bind(pi);
  const finalizing = Promise.withResolvers<void>();
  let gate: ReturnType<typeof gateStat> | undefined;
  pi.request = async command => {
    const result = await original(command);
    if (command.type === "set_model") {
      await appendOutside(target.sessionFile, "own-final-write");
      gate = gateStat(target.sessionFile);
      finalizing.resolve();
    }
    return result;
  };
  try {
    const setting = request("setModel", { ...target, provider: "test", modelId: "valid" });
    await finalizing.promise;
    await gate!.entered.promise;
    await Bun.sleep(220);
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    gate!.release.resolve();
    expect(await setting).toEqual({ ok: true });
    expect(await request("renameChat", { ...target, name: "valid" })).toEqual({ ok: true });
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
  }
  finally { gate?.release.resolve(); }
});

test("revision observation: older same-binding completion stat cannot roll the baseline back", async () => {
  const target = await session("review-ack-order");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const finish = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const finalizing = Promise.withResolvers<void>();
  let slot = 0;
  let gate: ReturnType<typeof gateStat> | undefined;
  pi.callExtension = async () => {
    const n = slot++;
    if (n === 0) await appendOutside(target.sessionFile, "owned-first");
    entered[n]!.resolve();
    await finish[n]!.promise;
    if (n === 0) { gate = gateStat(target.sessionFile); finalizing.resolve(); }
    else await appendOutside(target.sessionFile, "owned-second");
    return { n };
  };
  const first = request("callExtension", { ...target, extension: "fixture", method: "first" });
  try {
    await entered[0]!.promise;
    const second = request("callExtension", { ...target, extension: "fixture", method: "second" });
    await entered[1]!.promise;
    finish[0]!.resolve();
    await finalizing.promise;
    await gate!.entered.promise;
    finish[1]!.resolve();
    expect(await second).toEqual({ result: { n: 1 } });
    gate!.release.resolve();
    expect(await first).toEqual({ result: { n: 0 } });
    const result = await request("renameChat", { ...target, name: "legitimate" });
    expect(result).toEqual({ ok: true });
  } finally { for (const g of finish) g.resolve(); gate?.release.resolve(); }
});

test("revision observation: preflight spanning another same-binding acknowledgment remains coherent", async () => {
  const target = await session("review-preflight-order");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  pi.callExtension = async () => {
    await appendOutside(target.sessionFile, "owned-first");
    entered.resolve();
    await release.promise;
    return { written: true };
  };
  const first = request("callExtension", { ...target, extension: "fixture", method: "write" });
  await entered.promise;
  const gate = gateStat(target.sessionFile);
  const second = request("setModel", { ...target, provider: "test", modelId: "valid" });
  try {
    await gate.entered.promise;
    release.resolve();
    expect(await first).toEqual({ result: { written: true } });
    gate.release.resolve();
    const result = await second;
    expect(result).toEqual({ ok: true });
  } finally { release.resolve(); gate.release.resolve(); }
});

test("revision observation: settled acknowledgment retains ownership through watcher observation", async () => {
  const target = await session("review-settled-stat");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  pi.emit("agent_start");
  await appendOutside(target.sessionFile, "owned-run-write");
  const gate = gateStat(target.sessionFile);
  const changes: unknown[] = [];
  const off = subscribeHostEvents((name, value) => {
    if (name === "sessionChangedExternally" && (value as {sessionFile: string}).sessionFile === target.sessionFile) changes.push(value);
  });
  try {
    pi.emit("agent_settled");
    await gate.entered.promise;
    await Bun.sleep(220);
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    expect(await request("reloadSession", target)).toMatchObject({ ok: false });
    expect(await request("deleteChat", target)).toMatchObject({ ok: false });
    gate.release.resolve();
    // Await the production acknowledgment continuation, without another file write.
    await Bun.sleep(5);
    const result = await request("setModel", { ...target, provider: "test", modelId: "valid" });
    expect(result).toEqual({ ok: true });
    expect(changes).toHaveLength(0);
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    await externallyChanged(target.sessionFile, () => appendOutside(target.sessionFile));
    await rejectStaleMutations(target, pi);
  } finally { gate.release.resolve(); off(); }
});


test("revision observation: preflight read captured before a later owned write is retried", async () => {
  const target = await session("preflight-old-read");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  pi.callExtension = async () => {
    entered.resolve();
    await finish.promise;
    await appendOutside(target.sessionFile, "owned-after-preflight-read");
    return {};
  };
  const call = request("callExtension", { ...target, extension: "fixture", method: "write" });
  await entered.promise;
  const gate = gateStat(target.sessionFile);
  const setting = request("setModel", { ...target, provider: "test", modelId: "valid" });
  try {
    await gate.entered.promise;
    finish.resolve();
    expect(await call).toEqual({ result: {} });
    gate.release.resolve();
    expect(await setting).toEqual({ ok: true });
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
  } finally { finish.resolve(); gate.release.resolve(); }
});

test("revision observation: a newer failed stat never falls back to an older captured revision", async () => {
  const target = await session("ack-newest-fails");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const finish = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const finalizing = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const gates: Array<ReturnType<typeof gateStat>> = [];
  let slot = 0;
  pi.callExtension = async () => {
    const n = slot++;
    entered[n]!.resolve();
    await finish[n]!.promise;
    await appendOutside(target.sessionFile, `owned-${n}`);
    gates[n] = gateStat(target.sessionFile);
    finalizing[n]!.resolve();
    return { n };
  };
  const first = request("callExtension", { ...target, extension: "fixture", method: "first" });
  try {
    await entered[0]!.promise;
    const second = request("callExtension", { ...target, extension: "fixture", method: "second" });
    const outcome = second.then(result => ({ result }), error => ({ error }));
    await entered[1]!.promise;
    finish[0]!.resolve();
    await finalizing[0]!.promise;
    await gates[0]!.entered.promise; // R1 was captured before the second write.
    finish[1]!.resolve();
    await finalizing[1]!.promise;
    await gates[1]!.entered.promise;
    gates[1]!.release.reject(new Error("newest stat unavailable"));
    expect(await outcome).toMatchObject({ error: expect.objectContaining({ message: "newest stat unavailable" }) });
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    gates[0]!.release.resolve();
    expect(await first).toEqual({ result: { n: 0 } });
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    // With no successful observation of the last write, mutations fail closed.
    await rejectStaleMutations(target, pi);
    expect(await request("reloadSession", target)).toEqual({ ok: true });
  } finally { for (const g of finish) g.resolve(); for (const g of gates) g.release.resolve(); }
});

test("revision observation: settled stat error releases its lease and preserves another current writer", async () => {
  const target = await session("settled-error-overlap");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  pi.emit("agent_start");
  await appendOutside(target.sessionFile, "owned-run");
  const gate = gateStat(target.sessionFile);
  const logged = Promise.withResolvers<void>();
  const errors = spyOn(console, "error").mockImplementation((message) => {
    if (message === "Could not observe settled session") logged.resolve();
  });
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  pi.callExtension = async () => { await appendOutside(target.sessionFile, "owned-overlap"); entered.resolve(); await finish.promise; return {}; };
  try {
    pi.emit("agent_settled");
    await gate.entered.promise;
    const call = request("callExtension", { ...target, extension: "fixture", method: "overlap" });
    await entered.promise;
    gate.release.reject(new Error("settled stat unavailable"));
    await logged.promise;
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    expect(await request("reloadSession", target)).toMatchObject({ ok: false });
    expect(await request("deleteChat", target)).toMatchObject({ ok: false });
    finish.resolve();
    expect(await call).toEqual({ result: {} });
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    expect(await request("renameChat", { ...target, name: "valid" })).toEqual({ ok: true });
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
    expect(await request("reloadSession", target)).toEqual({ ok: true });
  } finally { finish.resolve(); gate.release.resolve(); errors.mockRestore(); }
});

for (const replacement of ["successor", "aba"] as const) {
  test(`revision observation: obsolete settled acknowledgment cannot transfer protection to ${replacement}`, async () => {
    const a = await session(`settled-${replacement}-a`), b = await session(`settled-${replacement}-b`);
    await request("ensurePi", a);
    const old = processes.at(-1)!;
    old.emit("agent_start");
    await appendOutside(a.sessionFile, "owned-old-run");
    const gate = gateStat(a.sessionFile);
    const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
    try {
      old.emit("agent_settled");
      await gate.entered.promise;
      old.frame({ type: "nativepi_tui_session", sessionFile: b.sessionFile });
      await request("ensurePi", b);
      if (replacement === "aba") old.frame({ type: "nativepi_tui_session", sessionFile: a.sessionFile });
      await request("ensurePi", a);
      const current = replacement === "aba" ? old : processes.at(-1)!;
      // An obsolete settled lease must not keep this idle binding busy.
      expect((await request("readSessionSnapshot", a)).consistency).toBe("stable");
      current.callExtension = async () => { await appendOutside(a.sessionFile, "owned-new-binding"); entered.resolve(); await finish.promise; return {}; };
      const call = request("callExtension", { ...a, extension: "fixture", method: "write" });
      await entered.promise;
      gate.release.resolve();
      await Bun.sleep(5);
      expect((await request("readSessionSnapshot", a)).consistency).toBe("retry");
      expect(await request("reloadSession", a)).toMatchObject({ ok: false });
      expect(await request("deleteChat", a)).toMatchObject({ ok: false });
      finish.resolve();
      expect(await call).toEqual({ result: {} });
      expect((await request("readSessionSnapshot", a)).consistency).toBe("stable");
      await appendOutside(a.sessionFile);
      await rejectStaleMutations(a, current);
    } finally { gate.release.resolve(); finish.resolve(); }
  });
}

test("revision observation: settled acknowledgment cannot recover a failed replacement baseline", async () => {
  const a = await session("settled-baseline-a"), b = await session("settled-baseline-b");
  await request("ensurePi", a);
  const pi = processes.at(-1)!;
  const gate = gateStat(b.sessionFile);
  const logged = Promise.withResolvers<void>();
  const errors = spyOn(console, "error").mockImplementation((message) => {
    if (message === "Could not observe settled session") logged.resolve();
  });
  try {
    pi.frame({ type: "nativepi_tui_session", sessionFile: b.sessionFile });
    await gate.entered.promise;
    pi.emit("agent_settled");
    gate.release.reject(new Error("replacement baseline unavailable"));
    await logged.promise;
    expect(await request("renameChat", { ...b, name: "stale" })).toMatchObject({ ok: false });
    expect((await request("readSessionSnapshot", b)).consistency).toBe("stable");
    expect(await request("reloadSession", b)).toEqual({ ok: true });
    expect(await request("renameChat", { ...b, name: "fresh" })).toEqual({ ok: true });
  } finally { gate.release.resolve(); errors.mockRestore(); }
});

test("revision observation: acknowledgment never clears an already observed external conflict", async () => {
  const target = await session("settled-sticky-conflict");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  await externallyChanged(target.sessionFile, () => appendOutside(target.sessionFile));
  const gate = gateStat(target.sessionFile);
  try {
    pi.emit("agent_settled");
    await gate.entered.promise;
    gate.release.resolve();
    await Bun.sleep(5);
    await rejectStaleMutations(target, pi);
    expect(await request("reloadSession", target)).toEqual({ ok: true });
  } finally { gate.release.resolve(); }
});

test("revision observation: successive settled reads publish only the newest run's observation", async () => {
  const target = await session("settled-two-runs");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  pi.emit("agent_start");
  await appendOutside(target.sessionFile, "owned-first-run");
  const first = gateStat(target.sessionFile);
  let second: ReturnType<typeof gateStat> | undefined;
  try {
    pi.emit("agent_settled");
    await first.entered.promise;
    pi.emit("agent_start");
    await appendOutside(target.sessionFile, "owned-second-run");
    second = gateStat(target.sessionFile);
    pi.emit("agent_settled");
    await second.entered.promise;
    second.release.resolve();
    await Bun.sleep(5);
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    first.release.resolve();
    await Bun.sleep(5);
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    expect(await request("renameChat", { ...target, name: "valid" })).toEqual({ ok: true });
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
  } finally { first.release.resolve(); second?.release.resolve(); }
});

test("revision observation: sole settled stat failure releases protection without acknowledging disk", async () => {
  const target = await session("settled-sole-failure");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  pi.emit("agent_start");
  await appendOutside(target.sessionFile, "owned-run");
  const gate = gateStat(target.sessionFile);
  const logged = Promise.withResolvers<void>();
  const errors = spyOn(console, "error").mockImplementation((message) => {
    if (message === "Could not observe settled session") logged.resolve();
  });
  try {
    pi.emit("agent_settled");
    await gate.entered.promise;
    expect((await request("readSessionSnapshot", target)).consistency).toBe("retry");
    gate.release.reject(new Error("settled stat unavailable"));
    await logged.promise;
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    await rejectStaleMutations(target, pi);
    expect(await request("reloadSession", target)).toEqual({ ok: true });
  } finally { gate.release.resolve(); errors.mockRestore(); }
});

test("revision observation: repeated baseline advancement bounds preflight without a sticky conflict", async () => {
  const target = await session("preflight-churn");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const before = pi.commands.length;
  const reads: Array<ReturnType<typeof gateStat>> = [gateStat(target.sessionFile)];
  const acknowledgments: Array<ReturnType<typeof gateStat>> = [];
  const setting = request("setModel", { ...target, provider: "test", modelId: "retry" });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await reads[attempt]!.entered.promise;
      const ack = gateStat(target.sessionFile);
      acknowledgments.push(ack);
      pi.emit("agent_start");
      pi.emit("agent_settled");
      await ack.entered.promise;
      ack.release.resolve();
      await Bun.sleep(5);
      if (attempt < 2) reads.push(gateStat(target.sessionFile));
      reads[attempt]!.release.resolve();
    }
    expect(await setting).toEqual({ ok: false, error: "This chat is changing. Try again." });
    expect(pi.commands).toHaveLength(before);
    expect((await request("readSessionSnapshot", target)).consistency).toBe("stable");
    expect(await request("renameChat", { ...target, name: "valid-after-churn" })).toEqual({ ok: true });
    await appendOutside(target.sessionFile);
    await rejectStaleMutations(target, pi);
  } finally { for (const gate of [...reads, ...acknowledgments]) gate.release.resolve(); }
});

test("revision observation: retried preflight still rejects an external write after ownership ends", async () => {
  const target = await session("preflight-external-after-ack");
  await request("ensurePi", target);
  const pi = processes.at(-1)!;
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  pi.callExtension = async () => {
    await appendOutside(target.sessionFile, "owned-first");
    entered.resolve();
    await finish.promise;
    return {};
  };
  const call = request("callExtension", { ...target, extension: "fixture", method: "write" });
  await entered.promise;
  const gate = gateStat(target.sessionFile);
  const before = pi.commands.length;
  const setting = request("setModel", { ...target, provider: "test", modelId: "stale" });
  try {
    await gate.entered.promise;
    finish.resolve();
    expect(await call).toEqual({ result: {} });
    await appendOutside(target.sessionFile, "external-after-release");
    gate.release.resolve();
    expect(await setting).toMatchObject({ ok: false, error: expect.stringContaining("Reload") });
    expect(pi.commands).toHaveLength(before);
    await rejectStaleMutations(target, pi);
  } finally { finish.resolve(); gate.release.resolve(); }
});

test("title preferences reach existing hosts and newly started hosts", async () => {
  const original = await request("loadState", {});
  const client = new HostClient();
  try {
    const settings = { model: "openai/gpt-6-luna", reasoning: "high", serviceTier: "default" } as const;
    const first = await session("title-preferences-first");
    expect(await request("ensurePi", first, client)).toEqual({ ok: true });
    const firstPi = processes.at(-1)!;
    expect(firstPi.commands).toContainEqual({ type: "nativepi_tui_chat_title_settings", settings: original.preferences.chatTitle });
    await request("saveState", { state: { ...original, preferences: { ...original.preferences, chatTitle: settings } } });
    expect(firstPi.commands).toContainEqual({ type: "nativepi_tui_chat_title_settings", settings });
    const second = await session("title-preferences-second");
    expect(await request("ensurePi", second, client)).toEqual({ ok: true });
    expect(processes.at(-1)!.commands).toContainEqual({ type: "nativepi_tui_chat_title_settings", settings });
  } finally {
    client.dispose();
    await request("saveState", { state: original });
  }
});
