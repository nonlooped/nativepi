import { expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let shellPath = process.env.PATH;
mock.module("shell-env", () => ({ shellEnv: async () => ({ PATH: shellPath }) }));
const { runRepositoryCommand } = await import("./repoCommand.ts");

test.skipIf(process.platform === "win32")("repository hooks find tools from the login shell when launched with a desktop PATH", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nativepi-repo-command-"));
  const originalPath = process.env.PATH;
  try {
    execFileSync("git", ["init", "-q", cwd]);
    const bin = path.join(cwd, "bin");
    await mkdir(bin);
    const tool = path.join(bin, "nativepi-test-hook-tool");
    await writeFile(tool, "#!/bin/sh\nprintf 'hook passed'\n");
    await chmod(tool, 0o755);
    const hook = path.join(cwd, ".git", "hooks", "pre-commit");
    await writeFile(hook, "#!/bin/sh\nexec nativepi-test-hook-tool\n");
    await chmod(hook, 0o755);
    shellPath = `${bin}${path.delimiter}${originalPath}`;
    process.env.PATH = "/usr/bin:/bin";
    const result = await runRepositoryCommand("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "test"], cwd);
    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).toContain("hook passed");
  } finally {
    process.env.PATH = originalPath;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("repository command launch failures include the executable error", async () => {
  const result = await runRepositoryCommand("nativepi-nonexistent-executable", [], tmpdir());
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain("nativepi-nonexistent-executable");
});
