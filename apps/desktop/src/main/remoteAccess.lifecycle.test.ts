import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
const stats: Array<ReturnType<typeof Promise.withResolvers<any>>> = [];
const children: Array<Child> = [];
class Child extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  kill() { queueMicrotask(() => { this.emit("exit", 0); this.emit("close", 0); }); return true; }
}
mock.module("node:fs/promises", () => ({ ...fs, stat: () => { const next = Promise.withResolvers<any>(); stats.push(next); return next.promise; } }));
mock.module("node:child_process", () => ({ ...childProcess, spawn: () => { const child = new Child(); children.push(child); return child; } }));
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
const { startRemoteAccess, stopRemoteAccess, remoteAccessStatus } = await import("./remoteAccess.ts");
async function tick() {
  for (let i = 0; i < 8; i++)
    await Promise.resolve();
}
test("start is single-flight and stopping before binary lookup completes cannot resurrect a tunnel", async () => {
  const first = startRemoteAccess(1, "token", "/unused");
  const second = startRemoteAccess(1, "token", "/unused");
  expect(first).toBe(second);
  await tick();
  expect(stats).toHaveLength(1);
  const stop = stopRemoteAccess();
  stats[0]!.resolve({ isFile: () => true, size: 1 });
  await stop;
  await first;
  expect(children).toHaveLength(0);
  expect(remoteAccessStatus().state).toBe("idle");
});
test("stop while waiting for banner cancels startup and a subsequent start can succeed", async () => {
  const start = startRemoteAccess(1, "token", "/unused");
  await tick();
  stats.at(-1)!.resolve({ isFile: () => true, size: 1 });
  await tick();
  expect(children).toHaveLength(1);
  await stopRemoteAccess();
  await start;
  expect(remoteAccessStatus().state).toBe("idle");
  const next = startRemoteAccess(1, "next", "/unused");
  await tick();
  stats.at(-1)!.resolve({ isFile: () => true, size: 1 });
  await tick();
  children.at(-1)!.stderr.write("https://fixture.trycloudflare.com\n");
  expect((await next).state).toBe("running");
  expect(remoteAccessStatus().link).toContain("token=next");
  await stopRemoteAccess();
  globalThis.fetch = originalFetch;
});
