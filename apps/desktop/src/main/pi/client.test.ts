import { expect, test } from "bun:test";
import { PiProcess } from "./client.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("invalid graphical extension calls are rejected before they install frame waiters", async () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  for (const params of [circular, 1n] as const) {
    const pi = Object.create(PiProcess.prototype) as PiProcess;
    const waiters = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
    Reflect.set(pi, "frameWaiters", waiters);
    Reflect.set(pi, "sendFrame", () => {});

    // @ts-expect-error Runtime validation protects callers outside TypeScript too.
    const call = pi.callExtension("@acme/ext", "save", params);
    const installedWaiter = waiters.size > 0;
    for (const waiter of waiters.values()) waiter.resolve(null);

    await expect(call).rejects.toThrow("parameters must be a JSON value");
    expect(installedWaiter).toBe(false);
  }
});

test("a spawn error is reported through the process exit callback", async () => {
  const missingCwd = join(tmpdir(), `nativepi-missing-${crypto.randomUUID()}`);
  const failure = new Promise<Error | undefined>((resolve) => {
    new PiProcess(missingCwd, () => {}, (_code, error) => resolve(error));
  });

  expect(await failure).toBeInstanceOf(Error);
});
