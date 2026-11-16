import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as childProcess from "node:child_process";
let pending: ((signal: AbortSignal) => Promise<void>) | undefined;
class Browser {
  setOwner() {}
  show() {}
  async run(_op: unknown, signal?: AbortSignal) {
    await pending?.(signal!);
    return { tabs: [] };
  }
  cancel() {}
  dispose() {}
}
mock.module("../browser/index.ts", () => ({ SharedBrowser: Browser }));
class Child extends EventEmitter {
  connected = true;
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  replies: Record<string, any>[] = [];
  send(value: Record<string, any>, callback?: () => void) {
    this.replies.push(value);
    callback?.();
    return true;
  }
  constructor() {
    super();
    this.stdin.once("finish", () =>
      queueMicrotask(() => this.emit("close", 0)),
    );
  }
  kill() {
    this.emit("close", 0);
    return true;
  }
  event(type: string) {
    this.stdout.write(JSON.stringify({ type }) + "\n");
  }
}
let child: Child;
mock.module("node:child_process", () => ({
  ...childProcess,
  fork: () => (child = new Child()),
}));
const { PiProcess } = await import("./client.ts");
function fixture(args: string[] = []) {
  const pi = new PiProcess(
    "/project",
    () => {},
    () => {},
    () => {},
    args,
  );
  return { pi, child: child! };
}
async function request(target: Child) {
  const requestId = crypto.randomUUID();
  const reply = new Promise<any>((resolve) => {
    const send = target.send.bind(target);
    target.send = (value, callback) => {
      send(value, callback);
      if (value.requestId === requestId) resolve(value.result);
      return true;
    };
  });
  target.emit("message", {
    type: "nativepi_browser",
    requestId,
    operation: { action: "list" },
  });
  return reply;
}
test("browser rejects Chat, idle and stopped Work requests and records active results", async () => {
  const chat = fixture(["--nativepi-chat"]),
    work = fixture();
  chat.child.event("agent_start");
  expect((await request(chat.child)).ok).toBe(false);
  expect((await request(work.child)).ok).toBe(false);
  work.child.event("agent_start");
  expect(await request(work.child)).toEqual({ ok: true, data: { tabs: [] } });
  work.pi.send({ type: "abort" });
  expect((await request(work.child)).ok).toBe(false);
  work.child.event("agent_settled");
  expect((await request(work.child)).ok).toBe(false);
  await chat.pi.stop();
  await work.pi.stop();
});
test("Stop aborts browser work only for its owning Pi process", async () => {
  const a = fixture(),
    b = fixture();
  a.child.event("agent_start");
  b.child.event("agent_start");
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  pending = (signal) =>
    new Promise((_r, reject) => {
      started();
      signal.addEventListener("abort", () => reject(new Error("cancelled")), {
        once: true,
      });
    });
  const active = request(a.child);
  await ready;
  pending = undefined;
  a.pi.send({ type: "abort" });
  expect((await active).ok).toBe(false);
  expect((await request(b.child)).ok).toBe(true);
  await a.pi.stop();
  await b.pi.stop();
});
