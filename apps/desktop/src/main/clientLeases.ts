/** A client's subscriptions outlive requests, but never the connection. */
export class ClientLeases {
  disposed = false;
  private resources = new Map<string, () => void>();
  has(key: string): boolean { return this.resources.has(key); }
  /** Adopt an allocated resource; duplicate or disconnected allocations are released. */
  acquire(key: string, release: () => void): boolean {
    if (this.disposed) {
      release();
      return false;
    }
    if (this.resources.has(key)) {
      release();
      return false;
    }
    this.resources.set(key, release);
    return true;
  }
  release(key: string): void {
    const release = this.resources.get(key);
    this.resources.delete(key);
    release?.();
  }
  dispose(): void {
    if (this.disposed)
      return;
    this.disposed = true;
    for (const key of [...this.resources.keys()])
      this.release(key);
  }
}
/** Electron navigation events include subframes and same-document history changes. */
export function leaseRendererDocument(client: ClientLeases, events: Pick<import("node:events").EventEmitter, "on" | "once" | "off">, onRelease: () => void): void {
  const release = () => {
    events.off("destroyed", release);
    events.off("render-process-gone", release);
    events.off("did-start-navigation", navigate);
    client.dispose();
    onRelease();
  };
  const navigate = (details: {
    isMainFrame?: boolean;
    isSameDocument?: boolean;
  }) => {
    if (details.isMainFrame && !details.isSameDocument)
      release();
  };
  events.once("destroyed", release);
  events.once("render-process-gone", release);
  events.on("did-start-navigation", navigate);
}
