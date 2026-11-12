import { expect, test } from "bun:test";
import { stubInvoke } from "./store/testBridge.ts";
import { createTerminalDock, type DockState } from "./terminalDock.ts";
import type { TerminalSession } from "../../shared/rpc-schema.ts";
const terminal = (id: string) => ({ id, name: id, exited: false, shellId: "sh" }) as TerminalSession;
function deferred<T = any>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  let state!: DockState;
  let minimized = 0;
  const notices: string[] = [];
  const dock = createTerminalDock("/project", next => { state = next; }, () => ++minimized, error => notices.push(error));
  return { dock, state: () => state, minimized: () => minimized, notices };
}
test("initial snapshot overlays newer exit/restart events and does not lose membership", async () => {
  const pending = deferred();
  stubInvoke(async c => c === "terminalEnsure" ? pending.promise : { shells: [] });
  const f = fixture();
  const start = f.dock.start();
  f.dock.restarted({ ...terminal("a"), name: "restarted" });
  f.dock.exited("a", 9);
  pending.resolve({ terminals: [terminal("a"), terminal("b")] });
  await start;
  expect(f.state().terminals.map(t => t.id)).toEqual(["a", "b"]);
  expect(f.state().terminals[0]).toMatchObject({ name: "restarted", exited: true, exitCode: 9 });
});
test("a deferred close excludes create and a failed close settles without losing the existing shell", async () => {
  const close = deferred();
  const calls: string[] = [];
  stubInvoke(async c => { calls.push(c); return c === "terminalEnsure" ? { terminals: [terminal("a")] } : c === "terminalClose" ? close.promise : { shells: [] }; });
  const f = fixture(); await f.dock.start();
  const closing = f.dock.close("a");
  await f.dock.create();
  close.resolve({ ok: false }); await closing;
  expect(calls).not.toContain("terminalCreate");
  expect(f.state().terminals.map(t => t.id)).toEqual(["a"]);
  expect(f.state().closing).toBe(false);
  expect(f.notices).toHaveLength(1);
});
test("partial close-all removes only successful closes and remains usable", async () => {
  stubInvoke(async (c, p: any) => c === "terminalEnsure" ? { terminals: [terminal("a"), terminal("b")] }
    : c === "terminalClose" ? p.terminalId === "a" ? { ok: true } : Promise.reject(new Error("offline")) : { shells: [] });
  const f = fixture(); await f.dock.start(); await f.dock.close();
  expect(f.state().terminals.map(t => t.id)).toEqual(["b"]);
  expect(f.state().closing).toBe(false);
  expect(f.minimized()).toBe(0);
});
test("successful create clears startup failure; rename rejection preserves the host-confirmed name", async () => {
  stubInvoke(async c => { if (c === "terminalEnsure" || c === "terminalRename") throw new Error("offline"); return c === "terminalCreate" ? { terminal: terminal("a") } : { shells: [] }; });
  const f = fixture(); await f.dock.start();
  expect(f.state().error).toBe("offline");
  await f.dock.create();
  expect(f.state().error).toBeNull();
  await f.dock.rename("a", "unconfirmed");
  expect(f.state().terminals[0].name).toBe("a");
});
test("disposed dock ignores pending creation without closing the host process", async () => {
  const creation = deferred(); const calls: string[] = [];
  stubInvoke(async c => { calls.push(c); return c === "terminalCreate" ? creation.promise : { terminals: [], shells: [] }; });
  const f = fixture(); await f.dock.start();
  const creating = f.dock.create(); await Promise.resolve();
  const state = f.state(); f.dock.dispose(); creation.resolve({ terminal: terminal("a") }); await creating;
  expect(f.state()).toBe(state);
  expect(calls).not.toContain("terminalClose");
});

for (const kind of ["create", "restart"] as const) test(`exit delivered before ${kind} response stays authoritative`, async () => {
  const reply = deferred();
  stubInvoke(async channel => channel === "terminalEnsure" ? { terminals: kind === "restart" ? [terminal("a")] : [] }
    : channel === "terminalCreate" || channel === "terminalRestart" ? reply.promise : { shells: [] });
  const f = fixture(); await f.dock.start();
  const mutation = kind === "create" ? f.dock.create() : f.dock.restart("a"); await Promise.resolve();
  if (kind === "restart") f.dock.restarted({ ...terminal("a"), name: "new shell" });
  f.dock.exited("a", 9);
  reply.resolve({ terminal: terminal("a") }); await mutation;
  expect(f.state().terminals[0]).toMatchObject({ exited: true, exitCode: 9, name: kind === "restart" ? "new shell" : "a" });
  f.dock.dispose();
});

test("restart response does not inherit an earlier shell incarnation's exit", async () => {
  const reply = deferred();
  stubInvoke(async channel => channel === "terminalEnsure" ? { terminals: [terminal("a")] }
    : channel === "terminalRestart" ? reply.promise : { shells: [] });
  const f = fixture(); await f.dock.start(); f.dock.exited("a", 7);
  const restarting = f.dock.restart("a"); await Promise.resolve();
  reply.resolve({ terminal: terminal("a") }); await restarting;
  expect(f.state().terminals[0].exited).toBe(false); expect(f.state().terminals[0].exitCode).toBeUndefined();
  f.dock.dispose();
});

test("new exit overlays only exit state, not an older restart's metadata", async () => {
  const reply = deferred();
  stubInvoke(async channel => channel === "terminalEnsure" ? { terminals: [terminal("a")] }
    : channel === "terminalRestart" ? reply.promise : { shells: [] });
  const f = fixture(); await f.dock.start();
  f.dock.restarted({ ...terminal("a"), name: "old name" });
  const restarting = f.dock.restart("a"); await Promise.resolve(); f.dock.exited("a", 9);
  reply.resolve({ terminal: { ...terminal("a"), name: "current name" } }); await restarting;
  expect(f.state().terminals[0]).toMatchObject({ name: "current name", exited: true, exitCode: 9 });
  f.dock.dispose();
});
