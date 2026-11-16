import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
// Keep native-module/transport mocks out of the other tests' module registry.
test("switching sessions keeps accepted runs alive until Pi settles", async () => {
  const child = Bun.spawn([process.execPath, "--eval", `
import { mock } from "bun:test";
import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs/promises";
const root = await fs.mkdtemp(join(tmpdir(), "nativepi-ipc-"));
const actualStat = fs.stat;
const statGates = new Map();
function gateStat(file) {
 const gate = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
 statGates.set(file, gate);
 return gate;
}
mock.module("node:fs/promises", () => ({ ...fs, stat: async (...args) => {
 const gate = statGates.get(String(args[0]));
 if (gate) statGates.delete(String(args[0]));
 const result = await actualStat(...args);
 if (gate) { gate.entered.resolve(); await gate.release.promise; }
 return result;
} }));

mock.module("electron", () => ({
app: { getPath: () => root }, BrowserWindow: class {},
dialog: {}, shell: {}, powerSaveBlocker: { start: () => 1, isStarted: () => true, stop: () => {} },
nativeTheme: new EventEmitter(),
systemPreferences: { askForMediaAccess: async () => true },
}));
mock.module("electron-updater", () => ({ default: { autoUpdater: {} } }));
mock.module("node-pty", () => ({ spawn: () => { throw new Error("Unexpected terminal"); } }));

const processes = [];
mock.module("node:child_process", () => ({ ...childProcess, fork: (_executable, args) => {
const proc = new EventEmitter();
proc.stdout = new PassThrough();
proc.stderr = new PassThrough();
proc.killed = false;
const sessionIndex = args.indexOf("--session");
proc.sessionFile = sessionIndex < 0 ? "draft-" + processes.length : args[sessionIndex + 1];
proc.switches = 0;
proc.event = (type) => proc.stdout.write(JSON.stringify({ type }) + "\\n");
proc.kill = () => { proc.killed = true; proc.emit("exit", 0); proc.emit("close",0); };
proc.stdin = new Writable({ write(chunk, _encoding, done) {
 const command = JSON.parse(chunk.toString());
 let data = {};
 if (command.type === "switch_session") {
 proc.switches += 1;
 proc.sessionFile = command.sessionPath;
 data = { cancelled: false };
 }
 if (command.type === "nativepi_tui_prompt_suggestions") proc.promptSuggestions = command.enabled;
 if (command.type === "get_state") data = { sessionFile: proc.sessionFile };
 if (command.type === "set_thinking_level") proc.thinkingLevel = command.level;
 if (command.type === "set_model") {
 proc.model = command.modelId;
 proc.provider = command.provider;
 }
 proc.stdout.write(JSON.stringify({ type: "response", id: command.id, success: true, data }) + "\\n");
 if (command.type === "prompt" && command.message !== "/handled") proc.event("agent_start");
 done();
}});
proc.stdin.once("finish",()=>{proc.killed=true;proc.emit("close",0);});
processes.push(proc);
return proc;
}}));

let now = Date.now();
Date.now = () => now;
const { invokeHostRequest: request, quitBlocked, shutdownHost } = await import(${JSON.stringify(new URL("./ipc.ts", import.meta.url).href)});
const a = { projectDir: root, sessionFile: join(root, "chat-a.jsonl") };
const b = { projectDir: root, sessionFile: join(root, "chat-b.jsonl") };
const c = { projectDir: root, sessionFile: join(root, "chat-c.jsonl") };
for (const target of [a, b, c])
 await fs.writeFile(target.sessionFile, JSON.stringify({ type: "session", id: target.sessionFile, cwd: root }) + "\\n");
assert.equal((await request("setModel", { ...a, provider: "provider-a", modelId: "model-a" })).ok, true);
assert.equal((await request("submit", { ...a, message: "work in A" })).ok, true);
const first = processes.find((proc) => proc.sessionFile === a.sessionFile);
assert.equal(first.switches, 0, "resumed sessions must start directly in the target session");
now += 10_000;
assert.equal((await request("ensurePi", b)).ok, true);
assert.equal(first.killed, false, "prompt acceptance must not make A idle");

assert.equal((await request("setModel", { ...b, provider: "provider-b", modelId: "model-b" })).ok, true);
assert.equal((await request("submit", { ...b, message: "work in B" })).ok, true);
const second = processes.find((proc) => proc.sessionFile === b.sessionFile);
assert.notEqual(first.model, second.model);
assert.equal(first.promptSuggestions, false);
const { nativePiStateSchema } = await import(${JSON.stringify(new URL("../shared/rpc-schema.ts", import.meta.url).href)});
await request("saveState", { state: nativePiStateSchema.parse({ preferences: { promptSuggestions: true } }) });
assert.equal(first.promptSuggestions, true);
assert.equal(second.promptSuggestions, true);
await request("saveState", { state: nativePiStateSchema.parse({ preferences: { promptSuggestions: false } }) });
assert.equal(first.promptSuggestions, false);
assert.equal(second.promptSuggestions, false);

now += 10_000;
await request("ensurePi", a);
assert.equal(second.killed, false, "switching back must keep B alive too");

first.event("agent_end");
first.event("auto_retry_start");
for (const [name, params] of [
["setModel", { ...a, provider: "provider-a", modelId: "another-model" }],
["setThinkingLevel", { ...a, level: "high" }],
["renameChat", { ...a, name: "Renamed" }],
]) {
assert.equal((await request(name, params)).ok, true);
now += 10_000;
await request("ensurePi", b);
assert.equal(first.killed, false, name + " must not release an active retry");
}
assert.equal(quitBlocked(), true);

const firstSettled = gateStat(a.sessionFile);
first.event("agent_settled");
await firstSettled.entered.promise;
now += 10_000;
await request("ensurePi", b);
assert.equal(first.killed, false, "settled acknowledgment must retain process protection");
firstSettled.release.resolve();
assert.equal((await request("readSessionSnapshot", a)).consistency, "stable");
now += 10_000;
await request("ensurePi", b);
// Idle shutdown runs in the background so disposal hooks cannot delay B.
if (!first.killed) await new Promise(resolve => first.once("close", resolve));
assert.equal(first.killed, true, "a settled process can still be reclaimed");
assert.equal(second.killed, false);

assert.equal((await request("submit", { ...c, message: "/handled", model: { provider: "kiro", id: "claude-sonnet" }, thinkingLevel: "high" })).ok, true);
const handled = processes.find((proc) => proc.sessionFile === c.sessionFile);
assert.equal(handled.provider, "kiro", "submit must apply the selected provider before prompting");
assert.equal(handled.model, "claude-sonnet");
assert.equal(handled.thinkingLevel, "high", "submit must apply the selected thinking level before prompting");
now += 10_000;
await request("ensurePi", b);
if (!handled.killed) await new Promise(resolve => handled.once("close", resolve));
assert.equal(handled.killed, true, "handled commands must not stay busy forever");
const secondSettled = gateStat(b.sessionFile);
second.event("agent_settled");
await secondSettled.entered.promise;
assert.equal(quitBlocked(), true, "settled acknowledgment is still active work");
secondSettled.release.resolve();
assert.equal((await request("readSessionSnapshot", b)).consistency, "stable");
assert.equal(quitBlocked(), false);
await shutdownHost();
await fs.rm(root, { recursive: true, force: true });
`], { cwd: fileURLToPath(new URL("../..", import.meta.url)), stdout: "pipe", stderr: "pipe" });
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
}, 15000);


test("managed workspace IPC preparation and preflight do not count their own request as an active agent", async () => {
  const child = Bun.spawn([process.execPath, "--eval", `
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await mkdtemp(join(tmpdir(), "nativepi-workspace-ipc-"));
const repo = join(root, "project"); await mkdir(repo);
const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
git("init", "-b", "main"); git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "init");
mock.module("electron", () => ({ app: { getPath: () => root }, BrowserWindow: class {}, dialog: {}, shell: {}, powerSaveBlocker: { start: () => 1, isStarted: () => true, stop: () => {} }, nativeTheme: new EventEmitter(), systemPreferences: {} }));
mock.module("electron-updater", () => ({ default: { autoUpdater: {} } }));
mock.module("node-pty", () => ({ spawn: () => { throw new Error("Unexpected terminal"); } }));
// Allocation is real; dispatch intentionally has no model in this isolated fixture.
console.info = () => {};
mock.module(${JSON.stringify(new URL("./pi/client.ts", import.meta.url).href)}, () => ({ PiProcess: class { constructor() { throw new Error("Fixture model unavailable"); } } }));
const { invokeHostRequest: request, shutdownHost, quitBlocked } = await import(${JSON.stringify(new URL("./ipc.ts", import.meta.url).href)});
try {
 const { path: cwd } = await request("taskWorkspaceCreate", { projectDir: repo, branch: "task", base: "HEAD" });
 await request("taskWorkspaceRecipe", { projectDir: repo, recipe: { setup: "echo prepared", run: "", check: "" } });
 await assert.rejects(request("taskWorkspaceAction", { projectDir: cwd, action: "setup" }), /Confirm/);
 await request("taskWorkspaceAction", { projectDir: cwd, action: "setup", confirmed: true });
 let record;
 for (let i = 0; i < 100; i++) {
  record = (await request("taskWorkspaceList", { projectDir: repo })).worktrees.find(w => w.path === cwd).managed;
  if (record.status !== "running") break;
  await new Promise(resolve => setTimeout(resolve, 20));
 }
 assert.equal(record.status, "ready"); assert.equal(record.output.trim(), "prepared");
 const { blockers } = await request("taskWorkspaceAction", { projectDir: cwd, action: "inspect" });
 assert.equal(blockers.some(b => b.includes("agents")), false);
 assert.equal(blockers.some(b => b.includes("Commits")), true);
 await request("taskWorkspaceRecipe", { projectDir: repo, recipe: { setup: "", run: '\"'+process.execPath+'\" -e \"setTimeout(() => {},30000)\"', check: "" } });
 await request("taskWorkspaceAction", { projectDir: cwd, action: "run", confirmed: true });
 assert.equal(quitBlocked(), true, "an owned workspace action must block host shutdown");
 await request("taskWorkspaceAction", { projectDir: cwd, action: "stop" });
 assert.equal(quitBlocked(), false);
 const parent = join(root, "parent"); git("worktree", "add", "-b", "parent", parent);
 const saved = await request("automationSave", { name: "nested", prompt: "No remote work", enabled: false, project: parent, workspace: "worktree", configuration: { provider: "fixture", model: "fixture", reasoning: "off", tools: ["read"] }, trigger: { kind: "once", at: new Date(Date.now()+3600000).toISOString() } });
 await request("automationRun", { id: saved.automations[0].id });
 const inventory = await request("taskWorkspaceList", { projectDir: repo });
 const automation = inventory.worktrees.find(w => w.managed?.owner === "automation");
 assert.ok(automation, "automation allocation should be registered even if fixture model cannot dispatch");
 const { realpath } = await import("node:fs/promises");
 assert.equal(automation.managed.repository, await realpath(repo), "nested worktrees must retain the primary repository");
} finally { await shutdownHost(); await rm(root, { recursive: true, force: true }); }
`], { cwd: fileURLToPath(new URL("../..", import.meta.url)), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect({ code, output: stdout + stderr }).toEqual({ code: 0, output: "" });
});
