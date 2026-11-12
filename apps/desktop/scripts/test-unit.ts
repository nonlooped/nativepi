import { resolve } from "node:path";

const cwd = resolve(import.meta.dir, "..");
const files = [...new Bun.Glob("**/*.test.{ts,tsx,mjs}").scanSync({ cwd, onlyFiles: true })]
  .filter((file) => !file.includes("node_modules/") && !file.endsWith(".dom.test.tsx"))
  .sort();
if (!files.length) throw new Error("No unit tests found.");
let failed = false;
for (const file of files) {
  const result = Bun.spawnSync([process.execPath, "test", file], {
    cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit",
  });
  if (result.exitCode !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
