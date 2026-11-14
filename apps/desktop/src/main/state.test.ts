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

test("queued transformations read the latest state without losing concurrent fields", async () => {
  const { updateState } = await import("./state.ts");
  await saveState(nativePiStateSchema.parse({ drafts: { keep: "draft" } }));
  await Promise.all([
    updateState(state => ({ ...state, finishedChats: { ...state.finishedChats, thread: new Date().toISOString() } })),
    updateState(state => ({ ...state, pinnedChats: [...state.pinnedChats, "other"] })),
  ]);
  const state = await loadState();
  expect(state.finishedChats.thread).toBeDefined();
  expect(state.pinnedChats).toEqual(["other"]);
  expect(state.drafts).toEqual({ keep: "draft" });
});

test("a stale renderer save cannot reverse host organization and deleted metadata stays removed", async () => {
  const { updateState, noteDeletedSession } = await import("./state.ts");
  const old = await loadState();
  await updateState(state => ({ ...state, organizationRevision: state.organizationRevision + 1, finishedChats: { ...state.finishedChats, target: new Date().toISOString() }, pinnedChats: [] }));
  noteDeletedSession("deleted");
  await saveState({ ...old, drafts: { deleted: "stale draft", keep: "draft" }, lastChatByProject: { project: "deleted" }, chatFolderBySession: { deleted: "folder" } });
  const fresh = await loadState();
  expect(fresh.finishedChats.target).toBeDefined();
  expect(fresh.pinnedChats).toEqual([]);
  expect(fresh.organizationRevision).toBeGreaterThan(old.organizationRevision);
  expect(fresh.drafts).toEqual({ keep: "draft" });
  expect(fresh.lastChatByProject).toEqual({});
  expect(fresh.chatFolderBySession).toEqual({});
});
