import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as childProcess from "node:child_process";
import * as computer from "../computerUse.ts";
let calls = 0;
let pending: ((signal: AbortSignal) => Promise<void>) | undefined;
const controller = new computer.ComputerController(async (_args, _home, signal) => {
  calls++;
  await pending?.(signal);
  return { ok: true, command: "snapshot", data: { complete: true } };
});
mock.module("../computerUse.ts", () => ({ ...computer, computerController: controller }));
class Child extends EventEmitter {
  connected = true;
  stdout = new PassThrough(); stderr = new PassThrough(); stdin = new PassThrough();
  replies: Record<string, any>[] = [];
  send(value: Record<string, any>, callback?: () => void) { this.replies.push(value); callback?.(); return true; }
  constructor() { super(); this.stdin.once("finish", () => queueMicrotask(() => this.emit("close", 0))); }
  kill() { this.emit("close", 0); return true; }
  event(type: string) { this.stdout.write(JSON.stringify({ type }) + "\n"); }
}
let child: Child;
mock.module("node:child_process", () => ({ ...childProcess, fork: () => (child = new Child()) }));
const { PiProcess } = await import("./client.ts");
function fixture(args: string[] = []) {
  const pi = new PiProcess("/project", () => {}, () => {}, () => {}, args);
  return { pi, child: child! };
}
async function request(target: Child, requestId: string) {
  const reply = new Promise<any>(resolve => {
    const send = target.send.bind(target);
    target.send = (value, callback) => { send(value, callback); if (value.requestId === requestId) resolve(value.result); return true; };
  });
  target.emit("message", { type: "nativepi_computer", requestId, operation: { kind: "command", command: "snapshot", args: ["--app", "Electron"] } });
  return reply;
}

test("host refuses computer actions from Chat and from idle or stopped Work processes", async () => {
  const chat = fixture(["--nativepi-chat"]);
  chat.child.event("agent_start");
  expect((await request(chat.child, "chat")).envelope.error.code).toBe("COMPUTER_DISABLED");
  const work = fixture();
  expect((await request(work.child, "idle")).envelope.error.code).toBe("COMPUTER_DISABLED");
  work.child.event("agent_start");
  expect((await request(work.child, "active")).envelope.ok).toBe(true);
  const previous = calls;
  work.pi.send({ type: "abort" });
  expect((await request(work.child, "late")).envelope.error.code).toBe("COMPUTER_DISABLED");
  expect(calls).toBe(previous);
  await chat.pi.stop(); await work.pi.stop();
});

test("multiple active Work chats can use the computer between each other’s actions", async () => {
  const a = fixture(), b = fixture();
  a.child.event("agent_start"); b.child.event("agent_start");
  expect((await request(a.child, "a")).envelope.ok).toBe(true);
  expect((await request(b.child, "concurrent")).envelope.ok).toBe(true);
  a.child.event("agent_settled");
  expect((await request(b.child, "b")).envelope.ok).toBe(true);
  await a.pi.stop(); await b.pi.stop();
});

test("explicit cancellation aborts only its matching command and process Stop cancels native work", async () => {
  const work = fixture(); work.child.event("agent_start");
  let started!: () => void;
  let observed!: AbortSignal;
  const start = new Promise<void>(resolve => { started = resolve; });
  pending = signal => new Promise((_resolve, reject) => {
    observed = signal; started(); signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  });
  const result = request(work.child, "pending");
  await start;
  work.child.emit("message", { type: "nativepi_computer_cancel", requestId: "wrong-id" });
  expect(observed.aborted).toBe(false);
  work.child.emit("message", { type: "nativepi_computer_cancel", requestId: "pending" });
  expect((await result).envelope.error.code).toBe("CANCELLED");
  const nextStarted = new Promise<void>(resolve => { started = resolve; });
  const next = request(work.child, "stop");
  await nextStarted;
  await work.pi.stop();
  expect(observed.aborted).toBe(true);
  expect((await next).envelope.error.code).toBe("CANCELLED");
  pending = undefined;
});
