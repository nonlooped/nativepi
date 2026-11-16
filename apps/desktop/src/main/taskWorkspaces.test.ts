import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { TaskWorkspaces } from "./taskWorkspaces.ts";
const roots: string[] = [];
const command = (script: string) => `"${process.execPath}" -e "${script}"`;
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "nativepi-managed-")); roots.push(root, `${root}-worktrees`);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString().trim();
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  await writeFile(path.join(root, ".gitignore"), ".env.local\nlocal-link\n");
  await writeFile(path.join(root, "tracked"), "committed"); git("add", "."); git("commit", "-m", "init");
  const file = path.join(root, ".git", "nativepi-test.json");
  let busy = false;
  const manager = new TaskWorkspaces(file, () => busy ? ["Active agent"] : []);
  return { root, git, file, manager, busy: (value: boolean) => { busy = value; } };
}
async function settled(manager: TaskWorkspaces, cwd: string) {
  for (let n = 0; n < 100; n++) { const item = (await manager.list(cwd)).worktrees.find(w => w.path === cwd)?.managed; if (item?.status !== "running") return item!; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("Action never settled");
}
test("isolates committed bases, discovers external worktrees, and preserves dirty source files", async () => {
  const f = await fixture(); await writeFile(path.join(f.root, "tracked"), "dirty");
  const [a, b] = await Promise.all([f.manager.create(f.root, "task-a", "main"), f.manager.create(f.root, "task-b", "main")]);
  expect(a).not.toBe(b); expect(await readFile(path.join(a, "tracked"), "utf8")).toBe("committed");
  expect(await readFile(path.join(f.root, "tracked"), "utf8")).toBe("dirty");
  expect((await f.manager.list(a)).worktrees.map(w => w.branch).sort()).toEqual(["main", "task-a", "task-b"]);
  await expect(f.manager.create(f.root, "invalid", "missing-ref")).rejects.toThrow();
});
test("setup failures retain output and workspace, retry works, and active owners block actions", async () => {
  const f = await fixture(); const cwd = await f.manager.create(f.root, "failure", "HEAD");
  await f.manager.recipe(cwd, { setup: command("console.log('setup-failed');process.exit(7)"), run: "", check: "" });
  await f.manager.start(cwd, "setup", []);
  expect(await settled(f.manager, cwd)).toMatchObject({ status: "failed", output: "setup-failed\n" });
  await f.manager.recipe(cwd, { setup: command("console.log('recovered')"), run: "", check: "" });
  f.busy(true); await expect(f.manager.start(cwd, "setup", [])).rejects.toThrow("Active agent");
  f.busy(false); await f.manager.start(cwd, "setup", []); expect((await settled(f.manager, cwd)).status).toBe("ready");
});
test("copies only named ignored regular files without overwriting or following symlinks", async () => {
  const f = await fixture(); const cwd = await f.manager.create(f.root, "files", "HEAD");
  await writeFile(path.join(f.root, ".env.local"), "private");
  await f.manager.start(cwd, "setup", []); await expect(readFile(path.join(cwd, ".env.local"))).rejects.toThrow();
  await f.manager.start(cwd, "setup", [".env.local"]); expect(await readFile(path.join(cwd, ".env.local"), "utf8")).toBe("private");
  await expect(f.manager.start(cwd, "setup", [".env.local"])).rejects.toThrow();
  await expect(f.manager.start(cwd, "setup", ["../escape"])).rejects.toThrow("relative");
  await symlink(path.join(f.root, "tracked"), path.join(f.root, "local-link"));
  await expect(f.manager.start(cwd, "setup", ["local-link"])).rejects.toThrow("regular");
});
test("coordinates busy ports, rejects duplicate actions, and stops process groups", async () => {
  const f = await fixture(); const cwd = await f.manager.create(f.root, "ports", "HEAD");
  const other = await f.manager.create(f.root, "ports-two", "HEAD");
  const server = net.createServer(); await new Promise<void>(resolve => server.listen(3100, "127.0.0.1", resolve));
  try {
    await f.manager.recipe(cwd, { setup: "", run: command("setTimeout(() => {}, 30000)"), check: "" });
    await f.manager.start(cwd, "run", []);
    expect((await f.manager.list(cwd)).worktrees.find(w => w.path === cwd)?.managed?.port).toBeGreaterThan(3100);
    await f.manager.start(other, "run", []);
    const assignments = (await f.manager.list(cwd)).worktrees.flatMap(w => w.managed?.port ?? []);
    expect(new Set(assignments).size).toBe(2);
    await expect(f.manager.start(cwd, "run", [])).rejects.toThrow("Stop");
    expect(await f.manager.inspect(cwd)).toContain("Stop the workspace action first.");
    await f.manager.stop(cwd); expect((await settled(f.manager, cwd)).status).toBe("failed");
  } finally { server.close(); await f.manager.close(); }
});
test("restart marks unfinished actions interrupted and never replays commands", async () => {
  const f = await fixture(); const cwd = await f.manager.create(f.root, "restart", "HEAD");
  const saved = JSON.parse(await readFile(f.file, "utf8")); saved.records[0].status = "running"; await writeFile(f.file, JSON.stringify(saved));
  const reloaded = new TaskWorkspaces(f.file, () => []);
  expect((await reloaded.list(cwd)).worktrees.find(w => w.path === cwd)?.managed?.status).toBe("interrupted");
  await expect(reloaded.remove(cwd)).rejects.toThrow("recover");
});
test("retirement blocks local files, unpublished commits and active agents; retains published branch", async () => {
  const f = await fixture(); const cwd = await f.manager.create(f.root, "retire", "HEAD");
  await expect(f.manager.remove(cwd)).rejects.toThrow("unpublished");
  f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  f.busy(true); await expect(f.manager.remove(cwd)).rejects.toThrow("Active agent"); f.busy(false);
  await writeFile(path.join(cwd, ".env.local"), "keep"); await expect(f.manager.remove(cwd)).rejects.toThrow("local files");
  await rm(path.join(cwd, ".env.local")); await f.manager.remove(cwd);
  expect(f.git("rev-parse", "retire")).toBe(f.git("rev-parse", "main"));
  expect((await f.manager.list(f.root)).worktrees).toHaveLength(1);
});

test("corrupt lifecycle metadata fails closed without replacing the file", async () => {
  const f = await fixture(); await writeFile(f.file, "corrupt");
  const manager = new TaskWorkspaces(f.file, () => []);
  await expect(manager.list(f.root)).rejects.toThrow();
  await expect(manager.register({ path: "/unused", repository: f.root, branch: "keep", base: "HEAD", owner: "chat" })).rejects.toThrow();
  expect(await readFile(f.file, "utf8")).toBe("corrupt");
});

test("retry after Git rejects a branch does not shadow the successful workspace with stale intent", async () => {
  const f = await fixture();
  await expect(f.manager.create(f.root, "bad name", "HEAD")).rejects.toThrow();
  const cwd = await f.manager.create(f.root, "bad-name", "HEAD");
  expect((await f.manager.list(cwd)).worktrees.find(w => w.path === cwd)?.managed).toMatchObject({ branch: "bad-name", status: "created" });
});
