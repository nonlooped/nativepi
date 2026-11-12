import { test, expect } from "bun:test";
import { subscribeState as subagents } from "../packages/subagents/renderer/state.ts";

type Subscribe = (channel: { call: () => Promise<unknown>; on: (event: string, listener: (value: unknown) => void) => () => void }, apply: (value: unknown) => void, fail: (error: unknown) => void) => () => void;
for (const [name, subscribe] of Object.entries({ subagents }) as Array<[string, Subscribe]>) {
  test(`${name} ignores a delayed snapshot/error after a newer event, and ignores unmounted results`, async () => {
    for (const reject of [false, true]) {
      const pending = Promise.withResolvers<unknown>();
      let listener!: (value: unknown) => void;
      let off = false;
      const applied: unknown[] = [];
      const errors: unknown[] = [];
      const stop = subscribe({
        call: () => pending.promise,
        on: (_event, fn) => { listener = fn; return () => { off = true; }; },
      }, value => applied.push(value), error => errors.push(error));
      listener({ version: "newer" });
      if (reject) pending.reject(new Error("old failure")); else pending.resolve({ version: "older" });
      await Promise.resolve(); await Promise.resolve();
      expect(applied).toEqual([{ version: "newer" }]);
      expect(errors).toEqual([]);
      stop(); listener({ version: "unmounted" });
      expect(off).toBe(true);
      expect(applied).toHaveLength(1);
    }
    const pending = Promise.withResolvers<unknown>();
    const applied: unknown[] = [];
    const stop = subscribe({ call: () => pending.promise, on: () => () => {} }, value => applied.push(value), () => {});
    stop(); pending.resolve({ version: "unmounted initial" });
    await Promise.resolve();
    expect(applied).toEqual([]);
    const ready: unknown[] = [];
    const cleanup = subscribe({ call: async () => ({ version: "initial" }), on: () => () => {} }, value => ready.push(value), () => {});
    await Promise.resolve();
    expect(ready).toEqual([{ version: "initial" }]);
    cleanup();
  });
}
