import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProjectFiles } from "./files.ts";

test("capping Git output returns collected paths even when the producer is terminated", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-files-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init");
    const hash = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, input: "", encoding: "utf8" }).trim();
    const entries = Array.from({ length: 21000 }, (_, i) => `100644 ${hash}\tfile-${String(i).padStart(5, "0")}\n`).join("");
    execFileSync("git", ["update-index", "--index-info"], { cwd: root, input: entries });
    const files = await listProjectFiles(root);
    expect(files).toHaveLength(20000);
    expect(files[0]).toBe("file-00000");
    expect(files.at(-1)).toBe("file-19999");
  } finally { await rm(root, { recursive: true, force: true }); }
});
