import { expect, test } from "bun:test";
import { PiProcess } from "./client.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("a spawn error is reported through the process exit callback", async () => {
  const missingCwd = join(tmpdir(), `nativepi-missing-${crypto.randomUUID()}`);
  const failure = new Promise<Error | undefined>((resolve) => {
    new PiProcess(missingCwd, () => { }, (_code, error) => resolve(error));
  });
  expect(await failure).toBeInstanceOf(Error);
});
