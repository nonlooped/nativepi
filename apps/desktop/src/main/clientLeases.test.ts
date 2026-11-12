import { expect, test } from "bun:test";
import { ClientLeases } from "./clientLeases.ts";
test("late allocations after disconnect are released immediately and dispose is idempotent", () => {
  const client = new ClientLeases();
  let released = 0;
  expect(client.acquire("existing", () => released++)).toBe(true);
  client.dispose();
  client.dispose();
  expect(released).toBe(1);
  expect(client.acquire("late", () => released++)).toBe(false);
  expect(released).toBe(2);
});
test("renderer subframe/hash navigation retains leases; document replacement releases and removes hooks", async () => {
  const { leaseRendererDocument } = await import("./clientLeases.ts");
  const { EventEmitter } = await import("node:events");
  const events = new EventEmitter();
  const client = new ClientLeases();
  let released = 0;
  leaseRendererDocument(client, events, () => released++);
  events.emit("did-start-navigation", { isMainFrame: false, isSameDocument: false });
  events.emit("did-start-navigation", { isMainFrame: true, isSameDocument: true });
  expect(client.disposed).toBe(false);
  events.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
  expect(client.disposed).toBe(true);
  expect(released).toBe(1);
  expect(events.eventNames()).toEqual([]);
  events.emit("destroyed");
  expect(released).toBe(1);
});
