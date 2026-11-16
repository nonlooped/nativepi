import { expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
let loginPath = process.env.PATH;
mock.module("shell-env", () => ({ shellEnv: async () => ({ PATH: loginPath }) }));
const { TaskWorkspaces } = await import("./taskWorkspaces.ts");
test.skipIf(process.platform === "win32")("workspace actions find commands installed in the login-shell PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-action-path-"));
  const oldPath = process.env.PATH;
  let manager: InstanceType<typeof TaskWorkspaces> | undefined;
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "initial"], { cwd: root });
    const bin = join(root, "bin"); await mkdir(bin);
    await writeFile(join(bin, "nativepi-login-tool"), "#!/bin/sh\nprintf 'login tool found'\n");
    await chmod(join(bin, "nativepi-login-tool"), 0o755);
    loginPath = `${bin}${delimiter}${oldPath}`; process.env.PATH = "/usr/bin:/bin";
    manager = new TaskWorkspaces(join(root, ".git", "workspaces.json"), () => []);
    const cwd = await manager.create(root, "task", "HEAD");
    await manager.recipe(cwd, { setup: "nativepi-login-tool", run: "", check: "" });
    await manager.start(cwd, "setup", []);
    for (let n = 0; n < 100; n++) {
      const record = (await manager.list(cwd)).worktrees.find(w => w.path === cwd)!.managed!;
      if (record.status !== "running") { expect(record).toMatchObject({ status: "ready", output: "login tool found" }); return; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Action did not finish");
  } finally { process.env.PATH = oldPath; await manager?.close(); await rm(root, { recursive: true, force: true }); await rm(`${root}-worktrees`, { recursive: true, force: true }); }
});
