import { execFile } from "node:child_process";
import type { GitDiff, GitStatus } from "../shared/pi-types.ts";


function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
        resolve({ stdout, stderr, code });
      },
    );
  });
}

function labelFor(x: string, y: string): GitStatus["files"][number]["state"] {
  if (x === "?" && y === "?") return "untracked";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  if (x === "R") return "renamed";
  return "modified";
}

export async function gitStatus(projectDir: string): Promise<GitStatus> {
  const inside = await run(["rev-parse", "--is-inside-work-tree"], projectDir);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return { isRepo: false, files: [] };
  }

  const branchRes = await run(["rev-parse", "--abbrev-ref", "HEAD"], projectDir);
  const branch = branchRes.stdout.trim();
  const detached = branch === "HEAD";

  // NUL-delimited porcelain output is unambiguous even with odd filenames.
  const status = await run(["status", "--porcelain=v1", "--untracked-files=all", "-z"], projectDir);
  const files: GitStatus["files"] = [];
  const records = status.stdout.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    const x = record[0] ?? " ";
    const y = record[1] ?? " ";
    let path = record.slice(3);
    // A rename entry is followed by its original path in the next NUL field.
    if (x === "R" || y === "R") i++;
    if (!path) continue;
    files.push({ path, state: labelFor(x, y), staged: x !== " " && x !== "?" });
  }

  return {
    isRepo: true,
    branch: detached ? undefined : branch,
    detached,
    files,
  };
}

export async function gitDiff(projectDir: string, file: string, untracked: boolean): Promise<GitDiff> {
  // `--no-index` diffs an untracked file against nothing so its content shows as
  // added; it exits non-zero by design, which `run` tolerates.
  const args = untracked
    ? ["diff", "--no-color", "--no-index", "--", "/dev/null", file]
    : ["diff", "--no-color", "HEAD", "--", file];
  const res = await run(args, projectDir);
  return { path: file, patch: res.stdout };
}
