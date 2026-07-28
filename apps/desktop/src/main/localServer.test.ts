import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { localServerStatus, startLocalServer, stopLocalServer } from "./localServer.ts";

afterEach(() => stopLocalServer());

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
        "tailscale-user-name": "Alice",
        "user-agent": "Mozilla/5.0 (iPhone) AppleWebKit Safari/605.1.15",
      },
    });
    await opened(socket);
    socket.send(JSON.stringify({ type: "auth", token }));
    expect(await message(socket)).toEqual({ type: "ready" });
    expect(localServerStatus().clients).toEqual([
      expect.objectContaining({
        address: "Tailscale network",
        device: "Safari on iPhone",
        location: "remote",
        user: "Alice",
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
    await Bun.sleep(0);
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
        local: { running: true, clients: [] },
        remote: { state: "error", error: "Access can only be managed from the desktop app." },
      },
    });
    expect(invoked).toBeFalse();
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

