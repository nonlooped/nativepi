import { expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
const { saveState, drainState } = await import("./state.ts");
const { nativePiStateSchema } = await import("../shared/rpc-schema.ts");
test("persistence drain includes accepted writes through final rename", async () => {
  const state = nativePiStateSchema.parse({ drafts: { draft: "retained" } });
  const save = saveState(state);
  let drained = false;
  const drain = drainState().then(() => { drained = true; });
  await Promise.resolve();
  expect(drained).toBe(false);
  gate.resolve();
  await Promise.all([save, drain]);
  expect(JSON.parse(await readFile(join(root, "state.json"), "utf8")).drafts).toEqual({ draft: "retained" });
  block = false;
  await rm(root, { recursive: true, force: true });
});
