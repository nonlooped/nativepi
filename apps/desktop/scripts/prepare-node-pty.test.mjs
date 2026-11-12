import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { prepareNodePty } from "./prepare-node-pty.mjs";

test.skipIf(process.platform === "win32")("repair makes macOS spawn helpers executable and preserves other permissions", () => {
  const root = mkdtempSync(join(tmpdir(), "nativepi-pty-"));
  try {
    for (const directory of ["prebuilds/darwin-arm64", "prebuilds/darwin-x64", "build/Release"]) {
      const folder = join(root, directory);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "spawn-helper"), "#!/bin/sh\nprintf pty-ok", { mode: 0o640 });
    }
    const helper = join(root, "prebuilds/darwin-arm64/spawn-helper");
    expect(spawnSync(helper).error?.code).toBe("EACCES");
    prepareNodePty(root);
    const result = spawnSync(helper, { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("pty-ok");
    for (const directory of ["prebuilds/darwin-arm64", "prebuilds/darwin-x64", "build/Release"]) {
      expect(statSync(join(root, directory, "spawn-helper")).mode & 0o777).toBe(0o751);
    }
    prepareNodePty(root);
    expect(statSync(helper).mode & 0o777).toBe(0o751);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
