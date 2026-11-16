import { afterEach, expect, test } from "bun:test";
import { mkdtemp, writeFile, readFile, symlink, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_TEXT_BYTES, readWorkspaceFile, saveWorkspaceFile } from "./workspaceFiles.ts";
const roots: string[] = [];
async function fixture() { const root = await mkdtemp(join(tmpdir(), "nativepi-editor-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
test("save detects same-length disk edits and keeps the external version", async () => {
  const root = await fixture(); await writeFile(join(root, "a.ts"), "one");
  const original = await readWorkspaceFile(root, "a.ts");
  await writeFile(join(root, "a.ts"), "two");
  expect(await saveWorkspaceFile(root, "a.ts", "mine", original.revision)).toMatchObject({ ok: false, conflict: true });
  expect(await readFile(join(root, "a.ts"), "utf8")).toBe("two");
});
test("concurrent saves from the same revision accept only one writer", async () => {
  const root = await fixture(); await writeFile(join(root, "a.md"), "original");
  const original = await readWorkspaceFile(root, "a.md");
  const results = await Promise.all([saveWorkspaceFile(root, "a.md", "first", original.revision), saveWorkspaceFile(root, "a.md", "second", original.revision)]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(results.filter(result => !result.ok && result.conflict)).toHaveLength(1);
  expect(await readFile(join(root, "a.md"), "utf8")).toBe(results[0]!.ok ? "first" : "second");
});
test("rejects traversal and symlinks escaping the workspace", async () => {
  const root = await fixture(); await mkdir(join(root, "project")); await writeFile(join(root, "outside"), "secret");
  await symlink(join(root, "outside"), join(root, "project", "link"));
  await expect(readWorkspaceFile(join(root, "project"), "../outside")).rejects.toThrow("outside");
  await expect(readWorkspaceFile(join(root, "project"), "link")).rejects.toThrow("outside");
});
test("bounded reads reject binary, invalid UTF-8, directories and large files", async () => {
  const root = await fixture();
  for (const [name, bytes] of [["binary", Buffer.from([1, 0, 2])], ["invalid", Buffer.from([0xff])], ["large", Buffer.alloc(MAX_TEXT_BYTES + 1, 97)]] as const) {
    await writeFile(join(root, name), bytes); await expect(readWorkspaceFile(root, name)).rejects.toThrow();
  }
  await mkdir(join(root, "dir")); await expect(readWorkspaceFile(root, "dir")).rejects.toThrow();
});
test("UTF-8 BOM and CRLF round trip exactly, then shorter saves truncate", async () => {
  const root = await fixture(); const text = "\ufeffhello\r\nworld\r\n"; await writeFile(join(root, "a"), text);
  const opened = await readWorkspaceFile(root, "a"); expect(opened.text).toBe(text);
  expect((await saveWorkspaceFile(root, "a", "x", opened.revision)).ok).toBe(true);
  expect(await readFile(join(root, "a"), "utf8")).toBe("x");
});
