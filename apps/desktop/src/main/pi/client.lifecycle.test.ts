import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as childProcess from "node:child_process";
class Child extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  connected = true;
  sent: Record<string, unknown>[] = [];
  send(value: Record<string, unknown>, callback?: (error?: Error) => void) { this.sent.push(value); callback?.(); return true; }
  constructor() { super(); this.stdin.once("finish", () => queueMicrotask(() => this.emit("close", 0))); }
  kill = mock(() => { this.killed = true; queueMicrotask(() => this.emit("close", 0)); return true; });
  event(value: unknown) { this.stdout.write(JSON.stringify(value) + "\n"); }
}
const children: Child[] = [];
const fork = mock(() => { const child = new Child(); children.push(child); return child; });
mock.module("node:child_process", () => ({ ...childProcess, fork }));
const { PiProcess } = await import("./client.ts");
function processFixture() {
  const events: unknown[] = [];
  const exits: unknown[] = [];
  const pi = new PiProcess("/temporary", event => events.push(event), (...args) => exits.push(args));
  return { pi, child: children.at(-1)!, events, exits };
}
test("Pi uses Electron's background fork with piped protocol streams and no inherited runtime flags", async () => {
  const { pi } = processFixture();
  expect(fork).toHaveBeenLastCalledWith(expect.stringContaining("pi-host.js"), [], {
    cwd: "/temporary",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    execArgv: [],
    silent: true,
    windowsHide: true,
  });
  await pi.stop();
});
test("close drains final stdout then rejects every later request", async () => {
  const { pi, child, events, exits } = processFixture();
  child.emit("exit", 0);
  child.event({ type: "agent_settled", aborted: false });
  child.emit("close", 0);
  expect(events).toEqual([{ type: "agent_settled", aborted: false }]);
  expect(exits).toHaveLength(1);
  await expect(pi.request({ type: "get_state" })).rejects.toThrow("Pi exited");
  await expect(pi.getProviders()).rejects.toThrow("Pi exited");
  child.event({ type: "agent_start" });
  expect(events).toHaveLength(1);
  await pi.stop();
});
test("synchronous serialization and frame-builder failures settle without waiting for exit", async () => {
  const { pi, child } = processFixture();
  const cycle: Record<string, unknown> = { type: "test" };
  cycle.self = cycle;
  await expect(pi.request(cycle as never)).rejects.toThrow();
  await expect(pi.frameRequest(() => { throw new Error("builder failed"); })).rejects.toThrow("builder failed");
  expect(pi.isAvailable).toBe(true);
  await pi.stop();
  expect(child.kill).not.toHaveBeenCalled();
});
test("stdin failure terminates the child and stop is single-flight", async () => {
  const { pi, child, exits } = processFixture();
  const request = pi.request({ type: "get_state" });
  void request.catch(() => { });
  child.stdin.emit("error", new Error("pipe failed"));
  await expect(request).rejects.toThrow("pipe failed");
  const first = pi.stop();
  expect(pi.stop()).toBe(first);
  await first;
  expect(child.kill).toHaveBeenCalledTimes(1);
  expect(exits).toHaveLength(1);
});
test("invalid extension input sends nothing and leaves the next valid call usable", async () => {
  const { pi, child } = processFixture();
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const params of [cycle, 1n])
    await expect(pi.callExtension("extension", "method", params as never)).rejects.toThrow("JSON value");
  expect(child.stdin.read()).toBeNull();
  const valid = pi.callExtension("extension", "method", {});
  const frame = JSON.parse(child.stdin.read().toString());
  child.event({ type: "nativepi_tui_reply", requestId: frame.requestId, data: null });
  expect(await valid).toBeNull();
  await pi.stop();
});

test("private orchestration correlates requests, cancels pending waits and ignores late replies", async () => {
  const { pi, child } = processFixture();
  const ref = { id: "session", cwd: "/temporary", file: "/session" };
  const catalog = pi.orchestration(ref, "catalog");
  const request = child.sent.at(-1)!;
  child.emit("message", { type: "nativepi_orchestration_reply", requestId: "other", result: "wrong" });
  child.emit("message", { type: "nativepi_orchestration_reply", requestId: request.requestId, result: { models: [] } });
  expect(await catalog).toEqual({ models: [] });
  expect(pi.hasOrchestrationWork).toBe(false);
  const controller = new AbortController();
  const pending = pi.orchestration(ref, "catalog", undefined, controller.signal).then(() => "unexpected", error => error.message);
  const cancelledId = child.sent.at(-1)!.requestId;
  controller.abort();
  expect(await pending).toContain("cancelled");
  child.emit("message", { type: "nativepi_orchestration_reply", requestId: cancelledId, result: "late" });
  expect(pi.hasOrchestrationWork).toBe(false);
  await pi.stop();
});
test("child tool waits cancel through fork IPC and disconnect settles host requests", async () => {
  const { pi, child } = processFixture();
  let calls = 0;
  pi.onOrchestration = async (_action, _params, _operationId, signal) => {
    calls++;
    await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    return { cancelled: signal.aborted };
  };
  const request = { type: "nativepi_orchestration_request", requestId: "wait", operationId: "tool", action: "delegate_wait", params: {} };
  child.emit("message", request); child.emit("message", request);
  expect(calls).toBe(1); expect(pi.hasOrchestrationWork).toBe(true);
  child.emit("message", { type: "nativepi_orchestration_cancel", requestId: "wait" });
  await Promise.resolve(); await Promise.resolve();
  expect(child.sent).toContainEqual({ type: "nativepi_orchestration_reply", requestId: "wait", result: { cancelled: true } });
  const pending = pi.orchestration({ id: "session", cwd: "/temporary", file: "/session" }, "catalog").then(() => "unexpected", error => error.message);
  child.emit("disconnect");
  expect(await pending).toContain("disconnected");
  await pi.stop();
});
