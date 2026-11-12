// Run in a Node child: Bun's WebSocket implementation does not exercise ws's Node Receiver.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:net";
import WebSocket from "ws";
import { localServerConnection, localServerStatus, startLocalServer, stopLocalServer } from "./localServer.ts";

const root = await mkdtemp(join(tmpdir(), "nativepi-parser-"));
let created = 0, disposed = 0, invoked = 0;
const deadline = setTimeout(() => { throw new Error("Parser fixture timed out"); }, 10000);
const clients = () => ({ dispose: () => { disposed++; } });
async function open(authenticated: boolean) {
  const socket = new WebSocket(`ws://127.0.0.1:${localServerConnection()!.port}/rpc`);
  socket.on("error", () => { });
  await once(socket, "open");
  if (authenticated) {
    const ready = once(socket, "message");
    socket.send(JSON.stringify({ type: "auth", token: "fixture" }));
    assert.deepEqual(JSON.parse(String((await ready)[0])), { type: "ready" });
  }
  return socket;
}
function closed(socket: WebSocket) {
  return new Promise<void>(resolve => socket.once("close", () => resolve()));
}
async function healthy() {
  const socket = await open(true);
  const response = once(socket, "message");
  socket.send(JSON.stringify({ type: "request", id: "versions", name: "versions", params: {} }));
  assert.deepEqual(JSON.parse(String((await response)[0])), { type: "response", id: "versions", result: { pi: "fixture", app: "fixture" } });
  const closing = closed(socket);
  socket.close();
  await closing;
}
try {
  await startLocalServer({
    rendererDir: root, token: "fixture", subscribe: () => () => { },
    createClient: (() => { created++; return clients(); }) as never,
    invoke: (async (name: string) => { assert.equal(name, "versions"); invoked++; return { pi: "fixture", app: "fixture" }; }) as never,
  }, false);
  const tooLarge = Buffer.alloc(14);
  tooLarge[0] = 0x81;
  tooLarge[1] = 0xff;
  tooLarge.writeBigUInt64BE(BigInt(70 * 1024 * 1024 + 1), 2);
  tooLarge.set([1, 2, 3, 4], 10);
  const frames = {
    opcode: Buffer.from([0x83, 0x80, 1, 2, 3, 4]),
    utf8: Buffer.from([0x81, 0x81, 1, 2, 3, 4, 0xfe]), // masked FF is invalid UTF-8
    payload: tooLarge, // rejected from its header, without allocating a 70 MiB body
  };
  for (const authenticated of [false, true]) {
    for (const [kind, bytes] of Object.entries(frames)) {
      const socket = await open(authenticated);
      const closing = closed(socket);
      (socket as unknown as { _socket: import("node:net").Socket })._socket.write(bytes);
      await closing;
      assert.equal(localServerStatus().clients.length, 0);
      await healthy();
      console.log(`${authenticated ? "authenticated" : "unauthenticated"} ${kind}: survived and served versions`);
    }
  }
  // Also exercise a malformed upgrade and an error before connection setup.
  const raw = connect(localServerConnection()!.port, "127.0.0.1");
  raw.on("error", () => { });
  await once(raw, "connect");
  const finished = new Promise<void>(resolve => raw.once("close", () => resolve()));
  raw.resume();
  raw.end("GET /rpc HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: bad\r\n\r\n");
  await finished;
  await healthy();
  await stopLocalServer();
  assert.equal(invoked, 7);
  assert.equal(created, 13);
  assert.equal(disposed, created, "each connection releases its host client exactly once");
  console.log("PARSER_FIXTURE_OK");
}
finally {
  clearTimeout(deadline);
  await stopLocalServer();
  await rm(root, { recursive: true, force: true });
}
