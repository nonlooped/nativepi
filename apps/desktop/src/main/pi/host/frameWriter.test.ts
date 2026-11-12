import { expect, test } from "bun:test";
import { createFrameWriter } from "./frameWriter.ts";
const first = { type: "nativepi_tui_reset" } as const;
const second = { type: "nativepi_tui_session", sessionFile: "fixture.jsonl" } as const;
function errno(code: string) { return Object.assign(new Error(code), { code }); }
async function pause() { await Bun.sleep(35); }

for (const code of ["EAGAIN", "EWOULDBLOCK"]) {
  for (const mode of ["callback", "throw"]) {
    test(`${code} ${mode} retries the same line and preserves later frame order`, async () => {
      const attempts: string[] = [], delivered: string[] = [], errors: unknown[] = [];
      const done = Promise.withResolvers<void>();
      const writer = createFrameWriter((line, callback) => {
        attempts.push(line);
        if (attempts.length === 1) {
          if (mode === "throw")
            throw errno(code);
          callback(errno(code));
          writer.handleError(errno(code));
          return;
        }
        delivered.push(line);
        callback();
        if (delivered.length === 2)
          done.resolve();
      }, error => errors.push(error));
      try {
        writer.send(first);
        writer.send(second);
        await done.promise;
        expect(attempts).toEqual([JSON.stringify(first) + "\n", JSON.stringify(first) + "\n", JSON.stringify(second) + "\n"]);
        expect(delivered).toEqual(attempts.slice(1));
        expect(errors).toEqual([]);
      }
      finally { writer.dispose(); }
    });
  }
}
for (const code of ["EPIPE", "EINVAL"]) {
  for (const mode of ["callback", "throw"]) {
    test(`permanent ${code} ${mode} closes the channel without retry or later writes`, async () => {
      let calls = 0;
      const errors: unknown[] = [];
      const failure = errno(code);
      const writer = createFrameWriter((_line, callback) => {
        calls++;
        if (mode === "throw")
          throw failure;
        callback(failure);
      }, error => errors.push(error));
      writer.send(first);
      writer.send(second);
      await pause();
      expect(calls).toBe(1);
      expect(errors).toEqual([failure]);
      writer.dispose();
    });
  }
}
test("disposal during pressure cancels the timer and discards queued frames", async () => {
  let calls = 0;
  const errors: unknown[] = [];
  const writer = createFrameWriter((_line, callback) => { calls++; callback(errno("EAGAIN")); }, error => errors.push(error));
  writer.send(first);
  writer.send(second);
  writer.dispose();
  writer.dispose();
  writer.send(first);
  await pause();
  expect(calls).toBe(1);
  expect(errors).toEqual([]);
});
test("closed pipe/disposal ignores a late callback and cannot release queued frames", async () => {
  let calls = 0;
  let complete!: (error?: Error | null) => void;
  const errors: unknown[] = [];
  const writer = createFrameWriter((_line, callback) => { calls++; complete = callback; }, error => errors.push(error));
  writer.send(first);
  writer.send(second);
  const failure = errno("EPIPE");
  writer.handleError(failure);
  complete();
  complete(errno("EAGAIN"));
  writer.send(first);
  await pause();
  expect(calls).toBe(1);
  expect(errors).toEqual([failure]);
});
test("persistent transient pressure is bounded and closes rather than leaking a retry queue", async () => {
  let calls = 0;
  const closed = Promise.withResolvers<unknown>();
  const failure = errno("EWOULDBLOCK");
  const writer = createFrameWriter((_line, callback) => { calls++; callback(failure); }, closed.resolve);
  try {
    writer.send(first);
    writer.send(second);
    expect(await closed.promise).toBe(failure);
    expect(calls).toBeGreaterThan(1);
    const count = calls;
    writer.send(first);
    await pause();
    expect(calls).toBe(count);
  }
  finally { writer.dispose(); }
}, 2500);
