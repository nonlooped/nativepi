import { expect, test } from "bun:test";
import type { ExplorerEntry } from "../../shared/pi-types.ts";
import { createExplorerDirectories, emptyExplorerDirectories } from "./explorerDirectories.ts";

const directory = (path: string): ExplorerEntry => ({ name: path.split("/").at(-1)!, path, kind: "dir" });
const file = (path: string): ExplorerEntry => ({ ...directory(path), kind: "file" });

type Reply = { entries: ExplorerEntry[]; error?: string };
function fixture() {
  let state = emptyExplorerDirectories();
  const reads: { path: string; resolve: (reply: Reply) => void; reject: (error: Error) => void }[] = [];
  const controller = createExplorerDirectories(
    (path) => new Promise((resolve, reject) => reads.push({ path, resolve, reject })),
    (next) => { state = next; },
  );
  return { controller, reads, state: () => state };
}
const drain = async () => { await Promise.resolve(); await Promise.resolve(); };

test("reopening unwatched directories refreshes cached rows and expanded descendants", async () => {
  const f = fixture();
  f.controller.start();
  f.reads[0]!.resolve({ entries: [directory("src")] });
  await drain();
  f.controller.toggle("src");
  f.reads[1]!.resolve({ entries: [directory("src/nested"), file("src/old.ts")] });
  await drain();
  f.controller.toggle("src/nested");
  f.reads[2]!.resolve({ entries: [file("src/nested/a.ts")] });
  await drain();
  expect(f.state().visible).toEqual(["", "src", "src/nested"]);
  f.controller.toggle("src");
  expect(f.state().visible).toEqual([""]);
  expect(f.controller.refresh("src/nested")).toBeUndefined();
  expect(f.reads).toHaveLength(3);
  f.controller.toggle("src");
  expect(f.state().dirs.get("src")).toEqual({ status: "ready", entries: [directory("src/nested"), file("src/old.ts")] });
  expect(f.reads.slice(3).map((r) => r.path)).toEqual(["src", "src/nested"]);
  f.reads[3]!.resolve({ entries: [file("src/new.ts")] });
  f.reads[4]!.resolve({ entries: [file("src/nested/b.ts")] });
  await drain();
  expect(f.state().visible).toEqual(["", "src"]);
  expect(f.state().dirs.get("src")).toEqual({ status: "ready", entries: [file("src/new.ts")] });
  f.controller.dispose();
});

test("older directory reads cannot replace newer results in the same project", async () => {
  const f = fixture();
  f.controller.start();
  const latest = f.controller.refresh("");
  f.reads[1]!.resolve({ entries: [file("最新.ts")] });
  await latest;
  f.reads[0]!.resolve({ entries: [file("old.ts")] });
  await drain();
  expect(f.state().dirs.get("")).toEqual({ status: "ready", entries: [file("最新.ts")] });
  f.controller.dispose();
});

test("a disposed project's reads and errors cannot publish into its replacement", async () => {
  const f = fixture();
  f.controller.start();
  f.controller.refresh("");
  f.controller.dispose();
  const last = f.state();
  f.reads[0]!.resolve({ entries: [file("old.ts")] });
  f.reads[1]!.reject(new Error("disconnected"));
  await drain();
  expect(f.state()).toBe(last);
  f.controller.toggle("old");
  expect(f.controller.refresh("")).toBeUndefined();
  expect(f.state()).toBe(last);
});

test("directory errors expose retry and a later successful read clears the error", async () => {
  const f = fixture();
  f.controller.start();
  f.reads[0]!.resolve({ entries: [], error: "Permission denied" });
  await drain();
  expect(f.state().dirs.get("")).toEqual({ status: "error", message: "Permission denied" });
  const retry = f.controller.refresh("");
  f.reads[1]!.resolve({ entries: [] });
  await retry;
  expect(f.state().dirs.get("")).toEqual({ status: "ready", entries: [] });
  f.controller.dispose();
});

test("an obsolete failed read does not erase a successfully refreshed directory", async () => {
  const f = fixture();
  f.controller.start();
  const fresh = f.controller.refresh("");
  f.reads[1]!.resolve({ entries: [file("a [1].ts")] });
  await fresh;
  f.reads[0]!.reject(new Error("stale"));
  await drain();
  expect(f.state().dirs.get("")).toEqual({ status: "ready", entries: [file("a [1].ts")] });
  f.controller.dispose();
});
