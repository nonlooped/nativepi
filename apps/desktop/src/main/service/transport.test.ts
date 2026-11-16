import { afterAll, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { ClientLeases } from "../clientLeases.ts";
import type { HostClient } from "../ipc.ts";
import { serveHost } from "./server.ts";
import { ServiceClient } from "./client.ts";
import { SERVICE_PROTOCOL } from "../../shared/background-service.ts";
const root = await mkdtemp(join(tmpdir(), "nativepi-service-test-"));
const cleanups: Array<() => Promise<void> | void> = [];
afterAll(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const clients: ClientLeases[] = [];
  let submissions = 0;
  let running = false;
  let finish: (() => void) | undefined;
  const server = await serveHost({
    createClient: () => { const client = new ClientLeases(); clients.push(client); return client as HostClient; },
    invoke: async (name, _params, _client) => {
      if (name === "submit") { submissions++; running = true; await new Promise<void>(resolve => { finish = resolve; }); return { ok: true } as never; }
      if (name === "getState") return { state: { isStreaming: running } } as never;
      if (name === "abort") { running = false; finish?.(); return { ok: true } as never; }
      throw new Error("Denied fixture operation");
    }, subscribe: () => () => {}, stop: async () => { running = false; finish?.(); },
  });
  cleanups.push(server.close);
  const file = join(root, `${server.port}.json`);
  await writeFile(file, JSON.stringify({ ...server, protocol: SERVICE_PROTOCOL, version: "test", pid: process.pid }));
  const connect = () => { const client = new ServiceClient(file, () => {}, () => {}); cleanups.push(() => client.dispose()); return client; };
  return { server, file, connect, clients, get submissions() { return submissions; } };
}
const target = { projectDir: "/project", sessionFile: "/project/session.jsonl" };
async function eventually(predicate: () => boolean) { for (let i = 0; i < 100; i++) { if (predicate()) return; await Bun.sleep(5); } throw new Error("State did not settle"); }
test("disconnect does not end or replay a turn; a fresh client reads it and can cancel it", async () => {
  const f = await fixture();
  const original = f.connect();
  const submitted = original.request("submit", { ...target, message: "work" }).catch(error => error);
  await eventually(() => f.submissions === 1);
  original.dispose();
  expect(await submitted).toBeInstanceOf(Error);
  await eventually(() => f.clients[0]!.disposed);
  const resumed = f.connect();
  expect(await resumed.request("getState", target)).toEqual({ state: { isStreaming: true } });
  expect(f.submissions).toBe(1);
  expect(await resumed.request("abort", target)).toEqual({ ok: true });
  expect(await resumed.request("getState", target)).toEqual({ state: { isStreaming: false } });
});
test("host crash rejects outstanding requests and requires reconciliation rather than replay", async () => {
  const f = await fixture(); const client = f.connect();
  const submitted = client.request("submit", { ...target, message: "work" }).catch(error => error);
  await eventually(() => f.submissions === 1);
  await f.server.close();
  expect(await submitted).toBeInstanceOf(Error);
  await expect(client.request("submit", { ...target, message: "again" })).rejects.toThrow("Reconcile".toLowerCase());
  expect(f.submissions).toBe(1);
});
test("compatible app versions attach; incompatible protocols refuse work but allow explicit stop", async () => {
  const f = await fixture();
  const descriptor = { port: f.server.port, token: f.server.token, pid: process.pid, version: "99.0.0", protocol: SERVICE_PROTOCOL };
  await writeFile(f.file, JSON.stringify(descriptor));
  expect(await f.connect().request("getState", target)).toEqual({ state: { isStreaming: false } });
  await writeFile(f.file, JSON.stringify({ ...descriptor, protocol: SERVICE_PROTOCOL + 1 }));
  await expect(f.connect().request("getState", target)).rejects.toThrow("incompatible");
  await f.connect().stop();
});
test("bad credentials, malformed input, unknown operations and invalid params fail closed", async () => {
  const f = await fixture();
  const closed = (message: unknown) => new Promise<number>(resolve => {
    const socket = new WebSocket(`ws://127.0.0.1:${f.server.port}/host`);
    socket.on("open", () => socket.send(JSON.stringify(message)));
    socket.on("close", code => resolve(code));
  });
  expect(await closed({ type: "auth", token: "wrong", protocol: SERVICE_PROTOCOL })).toBe(1008);
  expect(await closed({ type: "request", id: "1", name: "submit", params: target })).toBe(1008);
  expect(await closed({ garbage: true })).toBe(1008);
  const client = f.connect();
  await expect(client.request("missing", {})).rejects.toThrow();
  await expect(client.request("submit", { ...target, message: 42 })).rejects.toThrow();
  expect(f.submissions).toBe(0);
});


test("malformed host replies fail the connection without crashing the desktop client", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>(resolve => server.once("listening", resolve));
  server.on("connection", socket => socket.once("message", () => socket.send("null")));
  const port = (server.address() as { port: number }).port;
  const file = join(root, "malformed-host.json");
  await writeFile(file, JSON.stringify({ protocol: SERVICE_PROTOCOL, version: "fixture", pid: process.pid, port, token: "a".repeat(43) }));
  const client = new ServiceClient(file, () => { throw new Error("Unvalidated event delivered"); }, () => {});
  try { await expect(client.request("loadState", {})).rejects.toThrow("Invalid host response"); }
  finally { client.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); }
});


test("disconnect during authentication cannot send a late agent operation", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>(resolve => server.once("listening", resolve));
  let authenticated!: () => void;
  const auth = new Promise<void>(resolve => { authenticated = resolve; });
  let requests = 0;
  server.on("connection", socket => socket.on("message", raw => {
    const message = JSON.parse(String(raw));
    if (message.type === "auth") { authenticated(); setTimeout(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ready", compatible: true })); }, 10); }
    else requests++;
  }));
  const file = join(root, "late-auth-host.json");
  await writeFile(file, JSON.stringify({ protocol: SERVICE_PROTOCOL, version: "fixture", pid: process.pid, port: (server.address() as { port: number }).port, token: "a".repeat(43) }));
  const client = new ServiceClient(file, () => {}, () => {});
  const sent = client.request("submit", { ...target, message: "must not run" }).catch(error => error);
  await auth; client.dispose();
  expect(await sent).toBeInstanceOf(Error);
  expect(requests).toBe(0);
  await new Promise<void>(resolve => server.close(() => resolve()));
});
