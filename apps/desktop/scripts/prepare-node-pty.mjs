import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** node-pty 1.1.0 ships macOS helpers as 0644. Fix before dev or packaging, not inside an installed app. */
export function prepareNodePty(packageDir) {
  for (const directory of ["build/Release", "build/Debug", "prebuilds/darwin-arm64", "prebuilds/darwin-x64"]) {
    const helper = join(packageDir, directory, "spawn-helper");
    if (!existsSync(helper)) continue;
    const mode = statSync(helper).mode;
    if ((mode & 0o111) !== 0o111) chmodSync(helper, mode | 0o111);
  }
}

if (import.meta.main && process.platform === "darwin") {
  const require = createRequire(import.meta.url);
  prepareNodePty(dirname(require.resolve("node-pty/package.json")));
}
