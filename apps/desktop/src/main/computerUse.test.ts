import { expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { ComputerController, computerArgs, computerBinary, runComputer, type ComputerRunner } from "./computerUse.ts";
import { computerOperationSchema } from "../shared/computer-use.ts";

const action = (command = "click", args = ["@snapshot:e1"]) => ({ kind: "command", command, args });
const success = { ok: true, command: "click", data: { disposition: { delivery: "delivered", retry: "unsafe" } } };

test("one Work turn retains control between commands and releases it at settlement", async () => {
  const homes: string[] = [];
  const controller = new ComputerController(async (_args, home) => { homes.push(home); return success; });
  const a = {}, b = {};
  try {
    expect((await controller.run(a, action())).envelope.ok).toBe(true);
    expect((await controller.run(b, action())).envelope.error?.code).toBe("COMPUTER_BUSY");
    expect((await controller.run(b, action("status", []))).envelope.ok).toBe(true);
    expect((await controller.run(a, action())).envelope.ok).toBe(true);
    expect(homes[0]).toBe(homes[2]);
    expect(homes[0]).not.toBe(homes[1]);
    controller.release(a);
    expect((await controller.run(b, action())).envelope.ok).toBe(true);
  } finally { await controller.dispose(a); await controller.dispose(b); }
  await expect(access(homes[0]!)).rejects.toThrow();
});

test("Stop waits for the interrupted command to close before handing over the desktop", async () => {
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  let complete!: () => void;
  let interrupted: AbortSignal | undefined;
  const runner: ComputerRunner = async (_args, _home, signal) => {
    interrupted = signal; started();
    await new Promise<void>(resolve => { complete = resolve; });
    signal.throwIfAborted();
    return success;
  };
  const controller = new ComputerController(runner);
  const a = {}, b = {};
  const pending = controller.run(a, action());
  await start;
  controller.release(a);
  expect(interrupted?.aborted).toBe(true);
  expect((await controller.run(b, action())).envelope.error?.code).toBe("COMPUTER_BUSY");
  complete();
  const cancelled = await pending;
  expect(cancelled.envelope.error).toMatchObject({ code: "CANCELLED", disposition: { delivery: "unknown", retry: "unsafe" } });
  const restarted = new Promise<void>(resolve => { started = resolve; });
  const next = controller.run(b, action());
  await restarted;
  complete();
  expect((await next).envelope.ok).toBe(true);
  await controller.dispose(a); await controller.dispose(b);
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
  expect(computerArgs({ kind: "screenshot", target: { app: "Electron", windowId: "w-1" } })).toEqual(["screenshot", "--app", "Electron", "--window-id", "w-1"]);
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

test("runner failure retains uncertain delivery and releases control on turn end", async () => {
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
