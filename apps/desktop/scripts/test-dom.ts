import { resolve } from "node:path";

const cwd = resolve(import.meta.dir, "..");
const selected = process.argv.slice(2);
const files = selected.length ? selected : [...new Bun.Glob("src/renderer/**/*.dom.test.tsx").scanSync({ cwd })].sort();
if (!files.length) throw new Error("No DOM regression tests found.");
let failed = false;
for (const file of files) {
  // Each suite gets its own DOM and bridge module registry. A test's replaced
  // host globals must not silently change another suite's transport.
  const result = Bun.spawnSync([process.execPath, "test", "--preload", "./scripts/dom-preload.ts", file], {
    cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit",
  });
  if (result.exitCode !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
