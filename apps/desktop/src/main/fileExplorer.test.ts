import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readProjectDirectory, watchProjectDirectory } from "./fileExplorer.ts";

async function project(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "nativepi-explorer-"));
  await writeFile(path.join(dir, ".gitignore"), "ignored/\n", "utf8");
  await writeFile(path.join(dir, "file10.ts"), "export {};\n", "utf8");
  await writeFile(path.join(dir, "file2.ts"), "export {};\n", "utf8");
  await mkdir(path.join(dir, ".git"));
  await writeFile(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
  await mkdir(path.join(dir, "ignored"));
  await writeFile(path.join(dir, "ignored", "cache.json"), "{}\n", "utf8");
  await mkdir(path.join(dir, "src"));
  await writeFile(path.join(dir, "src", "index.ts"), "export {};\n", "utf8");
  return dir;
}

test("the root lists folders first, hides .git, and keeps Git-ignored entries", async () => {
  expect(await readProjectDirectory(await project(), "")).toEqual([
    { name: "ignored", path: "ignored", kind: "dir" },
    { name: "src", path: "src", kind: "dir" },
    { name: ".gitignore", path: ".gitignore", kind: "file" },
    { name: "file2.ts", path: "file2.ts", kind: "file" },
    { name: "file10.ts", path: "file10.ts", kind: "file" },
  ]);
});

test("a subfolder reads on its own, with paths relative to the project root", async () => {
  expect(await readProjectDirectory(await project(), "src")).toEqual([
    { name: "index.ts", path: "src/index.ts", kind: "file" },
  ]);
});

test("a path outside the project is refused", async () => {
  expect(readProjectDirectory(await project(), "..")).rejects.toThrow();
});

/** One `onChange`, however many events the platform decided that write was. */
function changes(): { calls: () => number; onChange: () => void; settle: () => Promise<void> } {
  let count = 0;
  return {
    calls: () => count,
    onChange: () => count++,
    // Longer than the watcher's own coalescing window, so a change that is
    // coming has arrived by the time this resolves.
    settle: () => new Promise((resolve) => setTimeout(resolve, 400)),
  };
}

test("a watched folder reports a file appearing in it", async () => {
  const dir = await project();
  const seen = changes();
  const stop = await watchProjectDirectory(dir, "src", seen.onChange);

  await writeFile(path.join(dir, "src", "added.ts"), "export {};\n", "utf8");
  await seen.settle();
  stop();

  expect(seen.calls()).toBeGreaterThan(0);
});

test("a folder that was let go stops reporting", async () => {
  const dir = await project();
  const seen = changes();
  const stop = await watchProjectDirectory(dir, "src", seen.onChange);
  stop();

  await writeFile(path.join(dir, "src", "added.ts"), "export {};\n", "utf8");
  await seen.settle();

  expect(seen.calls()).toBe(0);
});

test("watching a path outside the project is inert rather than fatal", async () => {
  const seen = changes();
  const stop = await watchProjectDirectory(await project(), "..", seen.onChange);
  stop();
  expect(seen.calls()).toBe(0);
});
