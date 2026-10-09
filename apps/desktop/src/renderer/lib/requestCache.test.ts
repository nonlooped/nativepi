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
