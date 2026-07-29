import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    let pushEvent: ((name: "piError", payload: { projectDir: string; message: string }) => void) | undefined;
    const status = await startLocalServer({
      rendererDir,
      invoke: (async (name: string) => {
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

    const link = new URL(status.link!);
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
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

function closed(socket: WebSocket): Promise<{ code: number }> {
  return new Promise((resolve) => socket.once("close", (code) => resolve({ code })));
}

function message(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => socket.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

