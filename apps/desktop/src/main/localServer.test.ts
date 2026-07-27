import { afterEach, describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket, { WebSocketServer } from "ws";
import { startLocalServer, stopLocalServer } from "./localServer.ts";

afterEach(() => stopLocalServer());

describe("local server", () => {
  test("requires the link token and forwards authenticated requests and events", async () => {
    const rendererDir = await mkdtemp(join(tmpdir(), "nativepi-server-"));
    await writeFile(join(rendererDir, "index.html"), "<h1>NativePi remote</h1>");
    let pushEvent: ((name: "piError", payload: { projectDir: string; message: string }) => void) | undefined;
    const status = await startLocalServer({
      rendererDir,
      invoke: (async (name) => {
        if (name !== "versions") throw new Error(`Unexpected request: ${name}`);
        return { pi: "test-pi", app: "test-app" };
      }) as never,
      subscribe: (listener) => {
        pushEvent = listener as typeof pushEvent;
        return () => {
          pushEvent = undefined;
        };
      },
    });

    const link = new URL(status.links[0]!);
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
    const origin = `http://127.0.0.1:${link.port}`;
    expect(await (await fetch(origin)).text()).toContain("NativePi remote");

    const rejected = new WebSocket(`ws://127.0.0.1:${link.port}/rpc`);
    await opened(rejected);
    rejected.send(JSON.stringify({ type: "auth", token: "wrong" }));
    expect((await closed(rejected)).code).toBe(1008);

    const socket = new WebSocket(`ws://127.0.0.1:${link.port}/rpc`);
    await opened(socket);
    socket.send(JSON.stringify({ type: "auth", token }));
    expect(await message(socket)).toEqual({ type: "ready" });

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
      subscribe: () => () => {},
    });
    const link = new URL(status.links[0]!);
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
    const socket = new WebSocket(`ws://127.0.0.1:${link.port}/rpc`);
    await opened(socket);
    socket.send(JSON.stringify({ type: "auth", token }));
    await message(socket);
    socket.send(JSON.stringify({ type: "request", id: "2", name: "pickProject", params: {} }));
    expect(await message(socket)).toEqual({ type: "response", id: "2", result: { path: null } });
    expect(invoked).toBeFalse();
  });

  test("proxies Vite HTTP and HMR WebSockets in development", async () => {
    const viteHttp = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(
        `<meta http-equiv="Content-Security-Policy" content="script-src 'self'">` +
        `<script type="module">window.__vite = true</script>`,
      );
    });
    const viteWebSockets = new WebSocketServer({ server: viteHttp });
    viteWebSockets.on("connection", (socket) => {
      socket.on("message", (data) => socket.send(`hmr:${data.toString()}`));
    });
    await new Promise<void>((resolve) => viteHttp.listen(0, "127.0.0.1", resolve));
    const viteAddress = viteHttp.address();
    if (!viteAddress || typeof viteAddress === "string") throw new Error("Vite test server did not start.");

    try {
      const status = await startLocalServer({
        rendererDir: "unused-in-development",
        rendererUrl: `http://127.0.0.1:${viteAddress.port}`,
        invoke: (async () => ({})) as never,
        subscribe: () => () => {},
      });
      const link = new URL(status.links[0]!);
      const html = await (await fetch(`http://127.0.0.1:${link.port}`)).text();
      expect(html).toMatch(/script-src 'self' 'nonce-[^']+'/);
      expect(html).toMatch(/<script nonce="[^"]+" type="module">/);

      const socket = new WebSocket(`ws://127.0.0.1:${link.port}/?token=hmr`, "vite-hmr");
      await within(opened(socket), "HMR proxy did not open");
      socket.send("update");
      expect(await within(messageText(socket), "HMR proxy did not forward a message")).toBe("hmr:update");
      socket.terminate();
    } finally {
      for (const client of viteWebSockets.clients) client.terminate();
      viteWebSockets.close();
      viteHttp.closeAllConnections();
      await new Promise<void>((resolve) => viteHttp.close(() => resolve()));
    }
  });
});

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once("open", resolve));
}

function closed(socket: WebSocket): Promise<{ code: number }> {
  return new Promise((resolve) => socket.once("close", (code) => resolve({ code })));
}

function message(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => socket.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

function messageText(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => socket.once("message", (data) => resolve(data.toString())));
}

function within<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(message)), 1000)),
  ]);
}
