import { spawn, execFile, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, realpath, rename, writeFile, constants } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { z } from "zod";
import { gitAddWorktree, gitResolveWorktreeBase } from "./git.ts";
import { repositoryEnv, runRepositoryCommand } from "./repoCommand.ts";
import { workspaceRecordSchema, workspaceRecipeSchema, type WorkspaceListing, type WorkspaceRecord, type WorkspaceRecipe } from "../shared/task-workspaces.ts";
const diskSchema = z.object({ version: z.literal(1), records: z.array(workspaceRecordSchema), recipes: z.record(z.string(), workspaceRecipeSchema) });
const git = async (cwd: string, args: string[]) => {
  const result = await runRepositoryCommand("git", args, cwd, 1024 * 1024);
  if (result.code !== 0) throw new Error(result.stderr || "Git command failed");
  return result.stdout.trim();
};
/** NativePi lifecycle metadata only. Conversations stay in Pi's native files. */
export class TaskWorkspaces {
  private records: WorkspaceRecord[] = [];
  private recipes: Record<string, WorkspaceRecipe> = {};
  private jobs = new Map<string, { child: ChildProcess; done: Promise<void> }>();
  async owns(cwd: string) { await this.loaded; const root = await realpath(cwd); return this.records.some(record => record.path === root); }
  runningProjects() { return [...this.jobs.keys()]; }
  private closing = false;
  private exclusive = new Set<string>();
  isPreparing(cwd: string) { return this.exclusive.has(cwd) || (this.jobs.has(cwd) && this.records.find(r => r.path === cwd)?.action === "setup"); }
  async close() { this.closing = true; await this.queue; await Promise.all([...this.jobs.keys()].map(cwd => this.stop(cwd))); await this.queue; }
  private queue: Promise<unknown> = Promise.resolve();
  private loaded: Promise<void>;
  constructor(private file: string, private blockers: (cwd: string) => string[]) { this.loaded = this.load(); void this.loaded.catch(() => {}); }
  private async load() {
    try {
      const data = diskSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
      this.records = data.records.map(r => r.status === "running" ? { ...r, status: "interrupted", error: "App stopped during this action. Inspect processes and files before retrying." } : r);
      this.recipes = data.recipes;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  private async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify({ version: 1, records: this.records, recipes: this.recipes }));
    await rename(temp, this.file);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => { await this.loaded; return fn(); });
    this.queue = next.catch(() => {}); return next;
  }
  async list(cwd: string): Promise<WorkspaceListing> {
    await this.queue; await this.loaded;
    const currentPath = await realpath(cwd);
    const probe = await runRepositoryCommand("git", ["rev-parse", "--is-inside-work-tree"], cwd, 4096);
    if ((probe.code !== 0 && /not a git repository|must be run in a work tree/i.test(probe.stderr)) || probe.stdout.trim() === "false") return { currentPath, supported: false, worktrees: [], recipe: workspaceRecipeSchema.parse({}) };
    if (probe.code !== 0) throw new Error(probe.stderr || "Git could not read this project. You can still start a chat in the current folder.");
    const raw = await git(cwd, ["worktree", "list", "--porcelain", "-z"]);
    const worktrees = raw.split("\0\0").filter(Boolean).flatMap((block, index) => {
      const fields = block.split("\0"); const dir = fields.find(f => f.startsWith("worktree "))?.slice(9);
      return dir ? [{ path: dir, branch: fields.find(f => f.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? "Detached HEAD", main: index === 0, managed: this.records.find(r => r.path === dir) }] : [];
    });
    const repository = worktrees[0]?.path ?? cwd;
    return { currentPath, worktrees, recipe: this.recipes[repository] ?? workspaceRecipeSchema.parse({}) };
  }
  async recipe(cwd: string, recipe: WorkspaceRecipe) {
    const listing = await this.list(cwd);
    return this.serial(async () => { this.recipes[listing.worktrees[0]?.path ?? cwd] = workspaceRecipeSchema.parse(recipe); await this.save(); });
  }
  async register(record: Omit<WorkspaceRecord, "status" | "output">) {
    return this.serial(async () => { if (!this.records.some(r => r.path === record.path)) { this.records.push({ ...record, status: "created", output: "" }); await this.save(); } });
  }
  async create(cwd: string, branch: string, base: string) {
    const resolved = await gitResolveWorktreeBase(cwd, base);
    const listing = await this.list(cwd);
    return this.serial(async () => {
      let record: WorkspaceRecord | undefined;
      const result = await gitAddWorktree(cwd, branch, true, resolved, async target => {
        record = { path: target.path, repository: listing.worktrees[0]?.path ?? cwd, branch, base: resolved, owner: "chat", status: "created", output: "" };
        this.records = this.records.filter(r => r.path !== target.path);
        this.records.push(record); await this.save();
      });
      if (!result.ok) { if (record) { record.status = "failed"; record.error = result.error; await this.save(); } throw new Error(result.error); }
      return result.path!;
    });
  }
  async inspect(cwd: string): Promise<string[]> {
    await this.loaded;
    const record = this.records.find(r => r.path === cwd);
    const reasons = this.blockers(cwd);
    if (!record) reasons.push("Only separate workspaces created by NativePi can be removed here.");
    if (this.jobs.has(cwd)) reasons.push("Stop the running setup, app or check command first.");
    if (record?.status === "interrupted") reasons.push("An earlier command was interrupted. Check its output and stop any program it left running before removing this folder.");
    const listing = await this.list(cwd);
    if (listing.worktrees.find(w => w.path === cwd)?.main !== false) reasons.push("This is the project’s original folder. It cannot be removed as a separate workspace.");
    if (await git(cwd, ["status", "--porcelain", "--untracked-files=all", "--ignored"])) reasons.push("This folder still contains local changes or additional files. Review Changes and Files, then save them elsewhere before removal.");
    if (await git(cwd, ["rev-list", "HEAD", "--not", "--remotes"])) reasons.push("Some saved changes have not been published. Publish them and check the result before removing this folder.");
    return reasons;
  }
  async remove(cwd: string) {
    this.exclusive.add(cwd);
    return this.serial(async () => {
      // Do not call list/inspect while holding the registry queue.
      const record = this.records.find(r => r.path === cwd);
      if (!record) throw new Error("Workspace is not managed");
      const blockers = this.blockers(cwd);
      if (this.jobs.has(cwd) || record.status === "interrupted" || blockers.length) throw new Error(blockers.join("\n") || "Stop or recover workspace actions first");
      if (await git(cwd, ["status", "--porcelain", "--untracked-files=all", "--ignored"])) throw new Error("Workspace contains local files or changes");
      if (await git(cwd, ["rev-list", "HEAD", "--not", "--remotes"])) throw new Error("Workspace contains unpublished commits");
      await git(record.repository, ["worktree", "remove", "--", cwd]);
      this.records = this.records.filter(r => r !== record); await this.save();
    }).finally(() => this.exclusive.delete(cwd));
  }
  async stop(cwd: string) {
    const job = this.jobs.get(cwd); if (!job) return;
    if (process.platform === "win32") await new Promise<void>((resolve, reject) => execFile("taskkill", ["/pid", String(job.child.pid), "/T", "/F"], error => error ? reject(error) : resolve()));
    else if (job.child.pid) { try { process.kill(-job.child.pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; } }
    await job.done;
  }
  async start(cwd: string, action: "setup" | "run" | "check", copyFiles: string[]) {
    const listing = await this.list(cwd);
    return this.serial(async () => {
      if (this.closing) throw new Error("Workspace host is stopping");
      const record = this.records.find(r => r.path === cwd);
      if (!record) throw new Error("Select a managed workspace first");
      if (this.jobs.has(cwd)) throw new Error("Stop the current action first");
      const blockers = this.blockers(cwd); if (blockers.length) throw new Error(blockers.join("\n"));
      if (action === "setup") this.exclusive.add(cwd);
      const command = listing.recipe[action];
      record.error = undefined; record.output = ""; record.action = action;
      try {
        if (copyFiles.length && action !== "setup") throw new Error("Local files can only be copied during setup");
        for (const file of copyFiles) await this.copyLocal(record, file);
        const taken = new Set(this.records.filter(r => r !== record).map(r => r.port));
        let port = record.port ?? 3100;
        while (taken.has(port) || !await this.available(port)) { if (++port > 65000) throw new Error("No available workspace port"); }
        record.port = port;
        if (!command.trim()) { record.status = "ready"; await this.save(); return; }
        record.status = "running"; await this.save();
        const child = spawn(command, { cwd, shell: process.env.SHELL || true, detached: process.platform !== "win32", env: { ...await repositoryEnv(), NATIVEPI_WORKSPACE_PORT: String(port), PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
        const append = (data: Buffer) => { record.output = (record.output + data.toString()).slice(-64000); };
        child.stdout?.on("data", append); child.stderr?.on("data", append);
        let spawnError: string | undefined;
        child.on("error", error => { spawnError = error.message; });
        const done = new Promise<void>(resolve => child.once("close", code => {
          this.jobs.delete(cwd);
          void this.serial(async () => { record.status = code === 0 ? "ready" : "failed"; record.error = spawnError ?? (code === 0 ? undefined : `Action stopped (exit ${code ?? "signal"}). Inspect files before retrying.`); await this.save(); }).then(resolve, error => { record.error = `Could not save action result: ${String(error)}`; resolve(); });
        }));
        this.jobs.set(cwd, { child, done });
      } catch (error) { record.status = "failed"; record.error = String(error); await this.save(); throw error; }
      finally { this.exclusive.delete(cwd); }
    });
  }
  private available(port: number): Promise<boolean> { return new Promise(resolve => { const server = net.createServer(); server.once("error", () => resolve(false)); server.listen(port, "127.0.0.1", () => server.close(() => resolve(true))); }); }
  private async copyLocal(record: WorkspaceRecord, file: string) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).some(p => !p || p === "." || p === ".." || p.toLowerCase() === ".git")) throw new Error("Use a relative file path without traversal or .git");
    const sourceRoot = await realpath(record.repository), targetRoot = await realpath(record.path);
    const source = path.join(sourceRoot, file), target = path.join(targetRoot, file);
    if (!await git(sourceRoot, ["check-ignore", "--", file])) throw new Error("Only explicitly ignored files can be copied");
    if (!(await lstat(source)).isFile() || !(await realpath(source)).startsWith(sourceRoot + path.sep)) throw new Error("Local file must be a regular file inside the source checkout");
    // Require existing real parent folders; never follow a target directory symlink.
    if (!(await realpath(path.dirname(target))).startsWith(targetRoot + path.sep) && await realpath(path.dirname(target)) !== targetRoot) throw new Error("Destination escapes workspace");
    await copyFile(source, target, constants.COPYFILE_EXCL);
  }
}
