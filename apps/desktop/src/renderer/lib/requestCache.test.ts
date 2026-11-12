import { expect, test } from "bun:test";
import { createRequestCache } from "./requestCache.ts";

test("request cache preserves successful reads and refreshes on demand", async () => {
  const cache = createRequestCache<string, number>();
  let reads = 0;
  const read = () => cache.load("usage", async () => ++reads);

  expect(await read()).toBe(1);
  expect(await read()).toBe(1);
  expect(reads).toBe(1);

  cache.invalidate("usage");
  expect(await read()).toBe(2);
});

test("request cache shares an in-flight read", async () => {
  const cache = createRequestCache<string, number>();
  let resolve: ((value: number) => void) | undefined;
  const run = () => new Promise<number>((done) => {
    resolve = done;
  });

  const first = cache.load("usage", run);
  const second = cache.load("usage", run);
  resolve?.(42);

  expect(await Promise.all([first, second])).toEqual([42, 42]);
});

test("invalidation detaches a pending read without letting it refill or clear the replacement", async () => {
  const cache = createRequestCache<string, number>();
  let resolveOld!: (value: number) => void;
  let resolveNew!: (value: number) => void;
  const old = cache.load("usage", () => new Promise((done) => { resolveOld = done; }));
  cache.invalidate("usage");
  const fresh = cache.load("usage", () => new Promise((done) => { resolveNew = done; }));
  resolveOld(1);
  await old;
  expect(cache.get("usage")).toBeUndefined();
  expect(cache.load("usage", async () => 99)).toBe(fresh);
  resolveNew(2);
  expect(await fresh).toBe(2);
  expect(cache.get("usage")).toBe(2);
});

test("a detached failure cannot evict a newer successful value", async () => {
  const cache = createRequestCache<string, number>();
  let reject!: (error: Error) => void;
  const old = cache.load("usage", () => new Promise((_, fail) => { reject = fail; }));
  cache.invalidate("usage");
  expect(await cache.load("usage", async () => 2)).toBe(2);
  reject(new Error("old failure"));
  await expect(old).rejects.toThrow("old failure");
  expect(await cache.load("usage", async () => 3)).toBe(2);
});

test("failed and synchronously throwing reads can be retried", async () => {
  const cache = createRequestCache<string, number>();
  await expect(cache.load("usage", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  const thrown = () => { throw new Error("sync"); };
  await expect(cache.load("usage", thrown)).rejects.toThrow("sync");
  expect(await cache.load("usage", async () => 42)).toBe(42);
});
