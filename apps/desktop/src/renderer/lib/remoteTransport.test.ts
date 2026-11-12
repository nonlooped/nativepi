import { expect, test } from "bun:test";
import { createRemoteApi } from "./remoteTransport.ts";
class Socket extends EventTarget {
  readyState = 0;
  sent: unknown[] = [];
  failSend = false;
  send(value: string) {
    if (this.failSend)
      throw new Error("send failed");
    this.sent.push(JSON.parse(value));
  }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  message(value: unknown) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}
function fixture(handshakeMs = 1000) {
  const socket = new Socket();
  let reloads = 0;
  const failures: unknown[] = [];
  const api = createRemoteApi({ url: "ws://fixture", token: "token", createSocket: () => socket as unknown as WebSocket, reload: () => reloads++, reportError: error => failures.push(error), handshakeMs });
  return { api, socket, failures, reloads: () => reloads };
}
test("OPEN is not authenticated: concurrent work waits for ready", async () => {
  const { api, socket } = fixture();
  try {
    const a = api.invoke("versions", {});
    socket.open();
    const b = api.invoke("versions", {});
    await Promise.resolve();
    expect(socket.sent).toEqual([{ type: "auth", token: "token" }]);
    socket.message({ type: "ready" });
    await Promise.resolve();
    expect(socket.sent).toHaveLength(3);
    socket.message({ type: "response", id: "1", result: { pi: "one", app: "one" } });
    socket.message({ type: "response", id: "2", result: { pi: "two", app: "two" } });
    expect(await a).toEqual({ pi: "one", app: "one" });
    expect(await b).toEqual({ pi: "two", app: "two" });
  }
  finally {
    api.dispose();
  }
});
test("handshake timeout rejects pending work", async () => {
  const { api, socket } = fixture(10);
  try {
    const pending = api.invoke("versions", {});
    socket.open();
    await expect(pending).rejects.toThrow("authentication timed out");
  }
  finally {
    api.dispose();
  }
});
test("send failure cleans up; disconnect rejects mutations without replay", async () => {
  const { api, socket } = fixture();
  try {
    const warm = api.invoke("versions", {});
    socket.open();
    socket.message({ type: "ready" });
    await Promise.resolve();
    socket.message({ type: "response", id: "1", result: {} });
    await warm;
    socket.failSend = true;
    await expect(api.invoke("versions", {})).rejects.toThrow("send failed");
    socket.failSend = false;
    const mutation = api.invoke("setTrust", { projectDir: "/fixture", trusted: true });
    await Promise.resolve();
    socket.close();
    await expect(mutation).rejects.toThrow("disconnected");
    expect(socket.sent.filter((value: any) => value.name === "setTrust")).toHaveLength(1);
  }
  finally {
    api.dispose();
  }
});
test("one event listener cannot prevent other listeners", () => {
  const { api, socket, failures } = fixture();
  let delivered = 0;
  try {
    api.events.on("piError", () => { throw new Error("listener failed"); });
    api.events.on("piError", () => delivered++);
    socket.open();
    socket.message({ type: "ready" });
    socket.message({ type: "event", name: "piError", payload: { projectDir: "/fixture", message: "error" } });
    expect(delivered).toBe(1);
    expect(failures).toHaveLength(1);
  }
  finally {
    api.dispose();
  }
});
