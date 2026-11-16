import { ClientLeases } from "../clientLeases.ts";
import { readFile } from "node:fs/promises";
import { WebSocket } from "ws";
import { SERVICE_PROTOCOL, serviceDescriptorSchema, serviceReplySchema } from "../../shared/background-service.ts";
import { validHostEvent } from "../../shared/host-events.ts";
import type { HostEventName, HostEvents } from "../../shared/rpc-schema.ts";

/** No request is retried: losing an acknowledgement is an unknown outcome. */
export class ServiceClient extends ClientLeases {
  private socket?: WebSocket;
  private opening?: WebSocket;
  private connecting?: Promise<void>;
  private pending = new Map<string, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
  private sequence = 0;
  private closed = false;
  private disconnected = false;
  constructor(private descriptor: string, private event: <K extends HostEventName>(name: K, payload: HostEvents[K]) => void, private connection: (connected: boolean, error?: string) => void) { super(); }
  connect(): Promise<void> {
    if (this.disconnected || this.closed) return Promise.reject(new Error("Service disconnected. Reconnect to reconcile current state before sending more requests."));
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    return this.connecting ??= this.open().catch(error => { if (!this.closed) this.connection(false, error instanceof Error ? error.message : "Host connection failed"); throw error; }).finally(() => { this.connecting = undefined; });
  }
  private async open(controlOnly = false) {
    const descriptor = serviceDescriptorSchema.parse(JSON.parse(await readFile(this.descriptor, "utf8")));
    if (!controlOnly && descriptor.protocol !== SERVICE_PROTOCOL) throw new Error(`NativePi host ${descriptor.version} is incompatible. Stop the service before upgrading it; active work has been left running.`);
    if (this.closed) throw new Error("Client disconnected before authentication");
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${descriptor.port}/host`);
      this.opening = socket;
      let ready = false;
      let failed = false;
      const fail = (error: Error) => {
        if (failed) return;
        failed = true;
        clearTimeout(timeout);
        if (this.opening === socket) this.opening = undefined;
        if (ready) this.disconnected = true;
        if (this.socket === socket) this.socket = undefined;
        reject(error);
        for (const pending of this.pending.values()) pending.reject(new Error("Service disconnected. The outcome of sent requests is unknown; inspect the chat before retrying."));
        this.pending.clear();
        if (!this.closed) this.connection(false, error.message);
      };
      const timeout = setTimeout(() => { fail(new Error("Host authentication timed out")); socket.terminate(); }, 5000);
      socket.on("error", fail);
      socket.on("close", (_code, reason) => fail(new Error(String(reason) || "Background service disconnected. Open Settings to start it again.")));
      socket.on("open", () => socket.send(JSON.stringify({ type: "auth", token: descriptor.token, protocol: SERVICE_PROTOCOL })));
      socket.on("message", data => {
        let raw: unknown;
        try { raw = JSON.parse(String(data)); } catch { socket.close(1002, "Invalid host response"); return; }
        const parsed = serviceReplySchema.safeParse(raw);
        if (!parsed.success) { socket.close(1002, "Invalid host response"); return; }
        const message = parsed.data;
        if (failed) return;
        if (!ready && message.type === "ready") {
          if (this.closed) { fail(new Error("Client disconnected during authentication")); socket.terminate(); return; }
          if (!controlOnly && message.compatible === false) { fail(new Error("Host protocol incompatible; stop the service explicitly")); socket.close(); return; }
          ready = true; clearTimeout(timeout); this.opening = undefined; this.socket = socket; this.connection(true); resolve(); return;
        }
        if (!ready) return;
        if (message.type === "event" && typeof message.name === "string" && validHostEvent(message.name, message.payload)) this.event(message.name as HostEventName, message.payload as HostEvents[HostEventName]);
        if (message.type === "response" && typeof message.id === "string") {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (typeof message.error === "string") pending?.reject(new Error(message.error));
          else pending?.resolve(message.result);
        }
      });
    });
  }
  async request(name: string, params: unknown): Promise<unknown> { await this.connect(); return this.send({ type: "request", name, params }); }
  async probe(): Promise<void> { await this.open(true); }
  async stop(): Promise<void> { if (!this.socket) await this.open(true); await this.send({ type: "stop" }); }
  private send(message: object): Promise<unknown> {
    const socket = this.socket;
    if (this.closed || !socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Background service unavailable"));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ ...message, id }), error => { if (error) { this.pending.delete(id); reject(error); } });
    });
  }
  override dispose() { super.dispose(); this.closed = true; this.opening?.terminate(); this.socket?.terminate(); }
}
