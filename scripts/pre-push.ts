import { execFileSync } from "node:child_process";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const updates = (await Bun.stdin.text()).trim().split("\n").filter(Boolean);
const commits = updates.map(line => line.split(/\s+/)[1]!).filter(sha => !/^0+$/.test(sha));
// Deletion-only pushes have no code to validate.
if (commits.length) {
  if (commits.some(sha => git("rev-parse", `${sha}^{commit}`) !== git("rev-parse", "HEAD"))) {
    console.error("Pre-push: check out the commit being pushed and push one commit tree at a time.");
    process.exit(1);
  }
  if (git("status", "--porcelain")) {
    console.error("Pre-push: commit or stash your changes so the checks test the commit being pushed.");
    process.exit(1);
  }
  const result = Bun.spawnSync(["bun", "run", "ci"], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  process.exit(result.exitCode);
}
