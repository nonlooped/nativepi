import { expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { ComputerController, computerArgs, computerBinary, runComputer, type ComputerRunner } from "./computerUse.ts";
import { type ComputerEnvelope, computerOperationSchema } from "../shared/computer-use.ts";

const action = (command = "clipboard-clear", args: string[] = []) => ({ kind: "command", command, args });
const success = { ok: true, command: "click", data: { disposition: { delivery: "delivered", retry: "unsafe" } } };

function harness() {
  type Started = { args: string[]; signal: AbortSignal; finish(): void };
  const starts: Started[] = [];
  const waiting: ((job: Started) => void)[] = [];
  const controller = new ComputerController(async (args, _home, signal): Promise<ComputerEnvelope> => {
    if (args[0] === "snapshot") {
      const window = args[args.indexOf("--window-id") + 1]!;
      return { ok: true, command: "snapshot", data: { snapshot_id: `s${++serial}`, window: { id: window } } };
    }
    if (args[0] === "status") return { ok: true, command: "status", data: {} };
    await new Promise<void>(resolve => {
      const job = { args, signal, finish: resolve };
      starts.push(job); waiting.shift()?.(job);
    });
    signal.throwIfAborted();
    return success;
  });
  let serial = 0;
  let consumed = 0;
  const next = () => starts[consumed++] ? Promise.resolve(starts[consumed - 1]!) : new Promise<Started>(resolve => waiting.push(resolve));
  const snapshot = async (owner: object, window: string) => {
    const result = await controller.run(owner, action("snapshot", ["--window-id", window]));
    return `@${(result.envelope.data as { snapshot_id: string }).snapshot_id}:e1`;
  };
  return { controller, starts, next, snapshot };
}

test("different windows run concurrently and no chat retains control between actions", async () => {
  const h = harness(), a = {}, b = {};
  const ar = await h.snapshot(a, "w-1"), br = await h.snapshot(b, "w-2");
  const first = h.controller.run(a, action("click", [ar])); const aj = await h.next();
  const second = h.controller.run(b, action("click", [br])); const bj = await h.next();
  expect(h.starts).toHaveLength(2);
  bj.finish(); expect((await second).envelope.ok).toBe(true);
  aj.finish(); expect((await first).envelope.ok).toBe(true);
  await h.controller.dispose(a); await h.controller.dispose(b);
});

test("same-window actions queue, then refuse refs invalidated by another chat", async () => {
  const h = harness(), a = {}, b = {};
  const ar = await h.snapshot(a, "w-1"), br = await h.snapshot(b, "w-1");
  const first = h.controller.run(a, action("click", [ar])); const aj = await h.next();
  const second = h.controller.run(b, action("click", [br]));
  expect(h.starts).toHaveLength(1);
  aj.finish(); await first;
  expect((await second).envelope.error).toMatchObject({ code: "STALE_REF", disposition: { delivery: "not_delivered", retry: "safe" } });
  expect(h.starts).toHaveLength(1);
  const fresh = await h.snapshot(b, "w-1");
  const retry = h.controller.run(b, action("click", [fresh])); const bj = await h.next(); bj.finish();
  expect((await retry).envelope.ok).toBe(true);
  await h.controller.dispose(a); await h.controller.dispose(b);
});

test("physical input queues across windows and cannot be starved by later actions", async () => {
  const h = harness(), a = {}, b = {}, c = {}, settings = {};
  const ar = await h.snapshot(a, "w-1");
  const first = h.controller.run(a, action("click", [ar])); const aj = await h.next();
  const physical = h.controller.run(b, { ...action("press", ["return"]), headed: true });
  let observed = false;
  const observation = h.controller.run(c, action("snapshot", ["--window-id", "w-3"])).then(result => { observed = true; return result; });
  expect((await h.controller.run(settings, action("status", []))).envelope.ok).toBe(true);
  aj.finish(); await first;
  const bj = await h.next(); expect(bj.args[0]).toBe("--headed"); expect(observed).toBe(false);
  bj.finish(); await physical; expect((await observation).envelope.ok).toBe(true);
  await Promise.all([a,b,c,settings].map(owner => h.controller.dispose(owner)));
});

test("Stop cancels only its chat and keeps its active window locked until native close", async () => {
  const h = harness(), a = {}, b = {}, c = {};
  const ar = await h.snapshot(a, "w-1"), br = await h.snapshot(b, "w-2");
  const first = h.controller.run(a, action("click", [ar])); const aj = await h.next();
  const second = h.controller.run(b, action("click", [br])); const bj = await h.next();
  const queued = h.controller.run(a, action("snapshot", ["--window-id", "w-1"]));
  const nextWindow = h.controller.run(c, action("snapshot", ["--window-id", "w-1"]));
  let entered = false; void nextWindow.then(() => { entered = true; });
  h.controller.release(a);
  expect((await queued).envelope.error).toMatchObject({ code: "CANCELLED", disposition: { delivery: "not_delivered" } });
  expect(aj.signal.aborted).toBe(true); expect(bj.signal.aborted).toBe(false); expect(entered).toBe(false);
  aj.finish(); expect((await first).envelope.error).toMatchObject({ code: "CANCELLED", disposition: { delivery: "unknown" } });
  expect((await nextWindow).envelope.ok).toBe(true);
  bj.finish(); expect((await second).envelope.ok).toBe(true);
  await Promise.all([a,b,c].map(owner => h.controller.dispose(owner)));
});

test("same-chat namespaces persist between actions and are removed on disposal", async () => {
  const homes: string[] = [];
  const controller = new ComputerController(async (_args, home) => { homes.push(home); return success; });
  const a = {}, b = {};
  await controller.run(a, action()); await controller.run(b, action()); await controller.run(a, action());
  expect(homes[0]).toBe(homes[2]); expect(homes[0]).not.toBe(homes[1]);
  await controller.dispose(a); await controller.dispose(b);
  await expect(access(homes[0]!)).rejects.toThrow();
});

test("unknown references and unknown namespaces never reach native execution", async () => {
  let calls = 0;
  const controller = new ComputerController(async () => { calls++; return success; });
  const owner = {};
  expect((await controller.run(owner, action("click", ["@unseen:e1"]))).envelope.error?.code).toBe("STALE_REF");
  expect(calls).toBe(0); await controller.dispose(owner);
});

test("aborted and invalid commands never acquire desktop control or run", async () => {
  let calls = 0;
  const controller = new ComputerController(async () => { calls++; return success; });
  const a = {}, b = {};
  expect((await controller.run(a, action(), AbortSignal.abort())).envelope.error?.code).toBe("CANCELLED");
  expect((await controller.run(a, action("snapshot", ["--session=other"]))).envelope.error?.code).toBe("INVALID_ARGS");
  expect(calls).toBe(0);
  await expect(controller.run(a, { kind: "command", command: "mcp" })).rejects.toThrow();
  expect((await controller.run(b, action())).envelope.ok).toBe(true);
  await controller.dispose(b);
});

test("CLI arguments are passed literally and NativePi owns debug paths and namespaces", () => {
  const operation = computerOperationSchema.parse({ kind: "command", command: "type", args: ["@snapshot:e1", "--stdin"], input: "$(touch unwanted)\n' text", headed: true });
  expect(computerArgs(operation)).toEqual(["--headed", "type", "@snapshot:e1", "--stdin"]);
  for (const flag of ["--trace", "--trace=path", "--agent-id", "--screenshot", "--debug", "--headed"]) {
    expect(() => computerArgs(computerOperationSchema.parse(action("snapshot", [flag])))).toThrow("managed by NativePi");
  }
  expect(computerArgs({ kind: "screenshot", target: { app: "Electron", windowId: "w-1" } })).toEqual(["screenshot", "--window-id", "w-1"]);
});

test("screenshots become model image content without duplicating base64 in session details", async () => {
  const controller = new ComputerController(async () => ({ ok: true, command: "screenshot", data: { format: "png", data: "aW1hZ2U=", width: 800, height: 600, scale_factor: 2 } }));
  const owner = {};
  const result = await controller.run(owner, { kind: "screenshot", target: {} });
  expect(result.image).toEqual({ type: "image", mimeType: "image/png", data: "aW1hZ2U=" });
  expect(result.envelope.data).toEqual({ format: "png", width: 800, height: 600, scale_factor: 2 });
  expect(JSON.stringify(result.envelope)).not.toContain("aW1hZ2U=");
  await controller.dispose(owner);
});

test("upstream partial delivery, recovery and future fields survive unchanged", async () => {
  const envelope = { ok: false, command: "click", version: "2.6", future: { field: true }, error: { code: "APP_UNRESPONSIVE", message: "Check the menu", disposition: { delivery: "unknown", retry: "unsafe" }, recovery: { requires_fresh_snapshot: true } } };
  const controller = new ComputerController(async () => envelope);
  const owner = {};
  expect((await controller.run(owner, action())).envelope).toEqual(envelope);
  await controller.dispose(owner);
});

test("runner failure reports uncertain delivery without retaining an action lock", async () => {
  const controller = new ComputerController(async () => { throw new Error("timeout"); });
  const owner = {};
  expect((await controller.run(owner, action())).envelope.error).toMatchObject({ code: "COMPUTER_UNAVAILABLE", disposition: { retry: "unsafe" } });
  await controller.dispose(owner);
});

test("native binary and platform helper come from the exact bundled package", async () => {
  const binary = computerBinary();
  expect(binary.file).toContain("agent-desktop");
  expect(binary.file).toEndWith(`agent-desktop-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`);
  await access(binary.file);
  if (binary.helper) await access(binary.helper);
  expect(() => computerBinary("freebsd" as NodeJS.Platform)).toThrow("unavailable");
});

test("bundled CLI version, versioned guides and help run without a system launcher", async () => {
  const controller = new ComputerController(runComputer);
  const owner = {};
  try {
    const status = await controller.run(owner, action("version", []));
    expect(status.envelope.ok).toBe(true);
    expect(status.envelope.data).toMatchObject({ version: "1.3.1" });
    const guide = await controller.run(owner, action("skills", ["get", "desktop"]));
    expect(guide.envelope.ok).toBe(true);
    expect(guide.envelope.data).toHaveProperty("content");
    const help = await controller.run(owner, action("click", ["--help"]));
    expect(help.envelope.data).toHaveProperty("text");
  } finally { await controller.dispose(owner); }
});

test("foreign changes invalidate only overlapping windows, including equals-form root refs", async () => {
  const h = harness(), a = {}, b = {};
  const ar = await h.snapshot(a, "w-1"), br1 = await h.snapshot(b, "w-1"), br2 = await h.snapshot(b, "w-2");
  const mutation = h.controller.run(a, action("click", [ar])); (await h.next()).finish(); await mutation;
  const stale = await h.controller.run(b, action("snapshot", [`--root=${br1}`]));
  expect(stale.envelope.error?.code).toBe("STALE_REF");
  const unrelated = h.controller.run(b, action("click", [br2])); (await h.next()).finish();
  expect((await unrelated).envelope.ok).toBe(true);
  await h.controller.dispose(a); await h.controller.dispose(b);
});

test("an upstream not-delivered refusal preserves other chats’ valid refs", async () => {
  let serial = 0;
  const controller = new ComputerController(async (args): Promise<ComputerEnvelope> => args[0] === "snapshot"
    ? { ok: true, command: "snapshot", data: { snapshot_id: `s${++serial}`, window: { id: "w-1" } } }
    : { ok: false, command: "click", error: { code: "POLICY_DENIED", message: "No action sent", disposition: { delivery: "not_delivered", retry: "safe" } } });
  const a = {}, b = {};
  await controller.run(a, action("snapshot", ["--window-id", "w-1"]));
  await controller.run(b, action("snapshot", ["--window-id", "w-1"]));
  await controller.run(a, action("click", ["@s1:e1"]));
  expect((await controller.run(b, action("click", ["@s2:e1"]))).envelope.error?.code).toBe("POLICY_DENIED");
  await controller.dispose(a); await controller.dispose(b);
});

test("typed text and clipboard content that resemble refs are passed literally", async () => {
  const h = harness(), owner = {};
  const ref = await h.snapshot(owner, "w-1");
  const type = h.controller.run(owner, action("type", [ref, "@literal:e2"]));
  const typed = await h.next(); expect(typed.args).toEqual(["type", ref, "@literal:e2"]); typed.finish();
  expect((await type).envelope.ok).toBe(true);
  const copy = h.controller.run(owner, action("clipboard-set", ["@literal:e2"]));
  const copied = await h.next(); copied.finish(); expect((await copy).envelope.ok).toBe(true);
  await h.controller.dispose(owner);
});
