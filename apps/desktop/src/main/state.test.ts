import { afterAll, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await mkdtemp(join(tmpdir(), "nativepi-state-"));
const rename = fs.rename;
const gate = Promise.withResolvers<void>();
let block = true;
mock.module("electron", () => ({ app: { getPath: () => root } }));
mock.module("node:fs/promises", () => ({ ...fs, rename: async (...args: Parameters<typeof fs.rename>) => {
    if (block)
      await gate.promise;
    return rename(...args);
  } }));
const { saveState, loadState, drainState } = await import("./state.ts");
const { nativePiStateSchema } = await import("../shared/rpc-schema.ts");
afterAll(() => rm(root, { recursive: true, force: true }));
test("persistence drain and reload include accepted writes through final rename", async () => {
  const state = nativePiStateSchema.parse({ drafts: { draft: "retained" } });
  const save = saveState(state);
  let drained = false;
  const drain = drainState().then(() => { drained = true; });
  let loaded = false;
  const loading = loadState().then(state => { loaded = true; return state; });
  await Promise.resolve();
  expect(loaded).toBe(false);
  expect(drained).toBe(false);
  gate.resolve();
  await Promise.all([save, drain]);
  expect((await loading).drafts).toEqual({ draft: "retained" });
  expect(JSON.parse(await readFile(join(root, "state.json"), "utf8")).drafts).toEqual({ draft: "retained" });
  block = false;
});

test("an unreadable workspace is reported instead of loading empty defaults", async () => {
  await writeFile(join(root, "state.json"), "{broken", "utf8");
  await expect(loadState()).rejects.toThrow("left untouched");
  expect(await readFile(join(root, "state.json"), "utf8")).toBe("{broken");
});
test("only a genuinely missing workspace starts from defaults", async () => {
  await rm(join(root, "state.json"));
  expect((await loadState()).projects).toEqual([]);
});
