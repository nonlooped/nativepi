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

    mock.module("electron", () => ({
      app: { getPath: () => tmpdir() }, BrowserWindow: class {},
      dialog: {}, shell: {}, powerSaveBlocker: {},
    }));
    mock.module("electron-updater", () => ({ autoUpdater: {} }));
    mock.module("node-pty", () => ({ spawn: () => { throw new Error("Unexpected terminal"); } }));

    const processes = [];
    mock.module("node:child_process", () => ({ ...childProcess, spawn: (_executable, args) => {
      const proc = new EventEmitter();
      proc.stdout = new PassThrough();
      proc.stderr = new PassThrough();
      proc.killed = false;
      const sessionIndex = args.indexOf("--session");
      proc.sessionFile = sessionIndex < 0 ? "draft-" + processes.length : args[sessionIndex + 1];
      proc.switches = 0;
      proc.event = (type) => proc.stdout.write(JSON.stringify({ type }) + "\\n");
      proc.kill = () => { proc.killed = true; proc.emit("exit", 0); };
      proc.stdin = new Writable({ write(chunk, _encoding, done) {
        const command = JSON.parse(chunk.toString());
        let data = {};
        if (command.type === "switch_session") {
          proc.switches += 1;
          proc.sessionFile = command.sessionPath;
          data = { cancelled: false };
        }
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
      processes.push(proc);
      return proc;
    }}));

    let now = Date.now();
    Date.now = () => now;
    const { invokeHostRequest: request, quitBlocked } = await import(${JSON.stringify(new URL("./ipc.ts", import.meta.url).href)});
    const a = { projectDir: "test-project", sessionFile: "chat-a.jsonl" };
    const b = { projectDir: "test-project", sessionFile: "chat-b.jsonl" };
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

    first.event("agent_settled");
    now += 10_000;
    await request("ensurePi", b);
    assert.equal(first.killed, true, "a settled process can still be reclaimed");
    assert.equal(second.killed, false);

    const c = { projectDir: a.projectDir, sessionFile: "chat-c.jsonl" };
    assert.equal((await request("submit", { ...c, message: "/handled", model: { provider: "kiro", id: "claude-sonnet" }, thinkingLevel: "high" })).ok, true);
    const handled = processes.find((proc) => proc.sessionFile === c.sessionFile);
    assert.equal(handled.provider, "kiro", "submit must apply the selected provider before prompting");
    assert.equal(handled.model, "claude-sonnet");
    assert.equal(handled.thinkingLevel, "high", "submit must apply the selected thinking level before prompting");
    now += 10_000;
    await request("ensurePi", b);
    assert.equal(handled.killed, true, "handled commands must not stay busy forever");
    second.event("agent_settled");
    assert.equal(quitBlocked(), false);
  `], { cwd: fileURLToPath(new URL("../..", import.meta.url)), stdout: "pipe", stderr: "pipe" });
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
}, 15_000);
