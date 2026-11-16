import { expect, test } from "bun:test";
import { createExtensionModuleCache } from "./extensionModules.ts";

test("unchanged extension code shares one module across simultaneous and later loads", async () => {
  let instances = 0;
  const load = createExtensionModuleCache(async (_identity, code) => ({ code, instance: ++instances }));
  const [first, concurrent] = await Promise.all([load("extension", "original"), load("extension", "original")]);
  expect(concurrent).toBe(first);
  expect(await load("extension", "original")).toBe(first);
  expect(await load("extension", "changed")).toEqual({ code: "changed", instance: 2 });
  expect(await load("other-extension", "original")).toEqual({ code: "original", instance: 3 });
});
test("a failed extension import can be retried after recovery", async () => {
  let failed = true;
  const load = createExtensionModuleCache(async () => { if (failed) throw new Error("unavailable"); return "ready"; });
  await expect(load("extension", "code")).rejects.toThrow("unavailable");
  failed = false;
  expect(await load("extension", "code")).toBe("ready");
});

test("the cache releases old source references after repeated edits", async () => {
  let instances = 0;
  const load = createExtensionModuleCache(async () => ++instances, 2);
  expect(await load("a", "1")).toBe(1);
  await load("a", "2");
  await load("b", "1");
  expect(await load("a", "1")).toBe(4);
});
