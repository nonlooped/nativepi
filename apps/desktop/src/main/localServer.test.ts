import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { acceptsGzip, localServerStatus, startLocalServer, stopLocalServer } from "./localServer.ts";
afterEach(() => stopLocalServer());
describe("gzip negotiation", () => {
  test("treats q=0 as the refusal it is, not as a mention of gzip", () => {
    expect(acceptsGzip("gzip, deflate, br")).toBe(true);
    expect(acceptsGzip("gzip;q=0.5")).toBe(true);
    // A client that cannot decode gzip says so this way, and compressing anyway
    // would leave it unable to read any script the app needs.
    expect(acceptsGzip("gzip;q=0")).toBe(false);
    expect(acceptsGzip("deflate, gzip;q=0.0")).toBe(false);
    expect(acceptsGzip("identity")).toBe(false);
    expect(acceptsGzip("")).toBe(false);
  });
});
describe("local server", () => {
  test("requires the link token and forwards authenticated requests and events", async () => {
    const rendererDir = await mkdtemp(join(tmpdir(), "nativepi-server-"));
    await writeFile(join(rendererDir, "index.html"), "<h1>NativePi remote</h1>");
    let pushEvent: ((name: "piError", payload: {
      projectDir: string;
      message: string;
    }) => void) | undefined;
    const status = await startLocalServer({
      rendererDir,
      invoke: (async (name: string) => {
        if (name !== "versions")
          throw new Error(`Unexpected request: ${name}`);
        return { pi: "test-pi", app: "test-app" };
      }) as never,
      subscribe: (listener) => {
        pushEvent = listener as typeof pushEvent;
        return () => {
          pushEvent = undefined;
        };
      },
      token: "development-token",
    });
    const link = new URL(status.link!);
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
    expect(token).toBe("development-token");
    const origin = `http://127.0.0.1:${link.port}`;
    expect(await (await fetch(origin)).text()).toContain("NativePi remote");
    const rejected = new WebSocket(`ws://127.0.0.1:${link.port}/rpc`);
    await opened(rejected);
    rejected.send(JSON.stringify({ type: "auth", token: "wrong" }));
    expect((await closed(rejected)).code).toBe(1008);
    const socket = new WebSocket(`ws://127.0.0.1:${link.port}/rpc`, {
      headers: {
        host: "plants-yields-suspected-mailing.trycloudflare.com",
        "cf-connecting-ip": "203.0.113.7",
        "user-agent": "Mozilla/5.0 (iPhone) AppleWebKit Safari/605.1.15",
      },
    });
    await opened(socket);
    socket.send(JSON.stringify({ type: "auth", token }));
    expect(await message(socket)).toEqual({ type: "ready" });
    expect(localServerStatus().clients).toEqual([
      expect.objectContaining({
        address: "203.0.113.7",
        device: "Safari on iPhone",
        location: "remote",
      }),
    ]);
    socket.send(JSON.stringify({ type: "request", id: "1", name: "versions", params: {} }));
    expect(await message(socket)).toEqual({
      type: "response",
      id: "1",
      result: { pi: "test-pi", app: "test-app" },
    });
    pushEvent?.("piError", { projectDir: "C:\\project", message: "failed" });
    expect(await message(socket)).toEqual({
      type: "event",
      name: "piError",
      payload: { projectDir: "C:\\project", message: "failed" },
    });
    const socketClosed = closed(socket);
    socket.close();
    await socketClosed;
    await waitFor(() => localServerStatus().clients.length === 0);
    expect(localServerStatus().clients).toHaveLength(0);
  });
  test("points development links at Vite while keeping RPC on the access server", async () => {
    const rendererDir = await mkdtemp(join(tmpdir(), "nativepi-server-"));
    await writeFile(join(rendererDir, "index.html"), "ok");
    const status = await startLocalServer({
      rendererDir,
      invoke: (async () => ({})) as never,
      subscribe: () => () => { },
      rendererPort: 5173,
    });
    const link = new URL(status.link!);
    const params = new URLSearchParams(link.hash.slice(1));
    expect(link.port).toBe("5173");
    expect(Number(params.get("rpcPort"))).toBeGreaterThan(0);
    expect(params.get("rpcPort")).not.toBe("5173");
    expect(params.get("token")).toBeTruthy();
  });
  test("does not let a browser invoke desktop-only UI actions", async () => {
    const rendererDir = await mkdtemp(join(tmpdir(), "nativepi-server-"));
    await writeFile(join(rendererDir, "index.html"), "ok");
    let invoked = false;
    const status = await startLocalServer({
      rendererDir,
      invoke: (async () => {
        invoked = true;
        return {};
      }) as never,
      subscribe: () => () => { },
    });
    const link = new URL(status.link!);
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
    const socket = new WebSocket(`ws://127.0.0.1:${link.port}/rpc`);
    await opened(socket);
    socket.send(JSON.stringify({ type: "auth", token }));
    await message(socket);
    socket.send(JSON.stringify({ type: "request", id: "2", name: "pickProject", params: {} }));
    expect(await message(socket)).toEqual({ type: "response", id: "2", result: { path: null } });
    socket.send(JSON.stringify({ type: "request", id: "3", name: "startRemoteAccess", params: {} }));
    expect(await message(socket)).toEqual({
      type: "response",
      id: "3",
      result: {
        local: { running: true, links: [], clients: [] },
        remote: { state: "error", error: "Access can only be managed from the desktop app." },
      },
    });
    socket.send(JSON.stringify({ type: "request", id: "4", name: "installUpdate", params: {} }));
    expect(await message(socket)).toEqual({
      type: "response",
      id: "4",
      result: { ok: false, error: "Updates can only be managed from the desktop app." },
    });
    socket.send(JSON.stringify({ type: "request", id: "5", name: "setUpdateChannel", params: { channel: "nightly" } }));
    expect(await message(socket)).toEqual({
      type: "response",
      id: "5",
      result: { status: "unsupported", channel: "stable" },
    });
    expect(invoked).toBeFalse();
  });
});
async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
    await Bun.sleep(5);
  }
}
function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once("open", resolve));
}
function closed(socket: WebSocket): Promise<{
  code: number;
}> {
  return new Promise((resolve) => socket.once("close", (code) => resolve({ code })));
}
function message(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => socket.once("message", (data) => resolve(JSON.parse(data.toString()))));
}
test("parallel local starts are single-flight and stop cancels a pending listen", async () => {
  const options = { rendererDir: tmpdir(), invoke: (async () => ({})) as never, subscribe: () => () => { } };
  const first = startLocalServer(options);
  expect(startLocalServer(options)).toBe(first);
  await Promise.resolve();
  const stop = stopLocalServer();
  await Promise.all([first, stop]);
  expect(localServerStatus().running).toBe(false);
});
test("lagging sockets are disconnected and forcibly bounded instead of resuming a partial stream", async () => {
  const { disconnectSocket } = await import("./localServer.ts");
  const { EventEmitter } = await import("node:events");
  const socket = Object.assign(new EventEmitter(), { close: (code: number, reason: string) => { codes.push(code); }, terminate: () => { terminations++; done.resolve(); } });
  const codes: number[] = [];
  let terminations = 0;
  const done = Promise.withResolvers<void>();
  disconnectSocket(socket as never, 1013, "resync");
  disconnectSocket(socket as never, 1013, "resync");
  expect(codes).toEqual([1013]);
  await done.promise;
  expect(terminations).toBe(1);
});
test("a stream at its buffer limit disconnects without delivering a later event", async () => {
  const { sendHostEvent } = await import("./localServer.ts");
  const { EventEmitter } = await import("node:events");
  const sent: string[] = [];
  const codes: number[] = [];
  const socket = Object.assign(new EventEmitter(), { readyState: 1, bufferedAmount: 1024 * 1024, send: (value: string) => sent.push(value), terminate: () => { }, close: (code: number) => { codes.push(code); socket.readyState = 2; socket.emit("close"); } });
  sendHostEvent(socket as never, "agent_settled");
  socket.bufferedAmount = 0;
  sendHostEvent(socket as never, "terminal delta");
  expect(codes).toEqual([1013]);
  expect(sent).toEqual([]);
});

test("Node parser failures before and after authentication release clients and leave the server usable", async () => {
  const fixture = new URL("./localServer.parser.fixture.ts", import.meta.url);
  const child = Bun.spawn([process.env.NATIVEPI_TEST_NODE ?? "node", fileURLToPath(fixture)], {
    stdout: "pipe", stderr: "pipe",
  });
  const [output, errors, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect({ code, errors }).toEqual({ code: 0, errors: "" });
  for (const auth of ["unauthenticated", "authenticated"])
    for (const kind of ["opcode", "utf8", "payload"])
      expect(output).toContain(`${auth} ${kind}: survived and served versions`);
  expect(output).toContain("PARSER_FIXTURE_OK");
}, 15000);
