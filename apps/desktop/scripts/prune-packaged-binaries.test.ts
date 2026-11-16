import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const prune = createRequire(import.meta.url)("./prune-packaged-binaries.cjs");

for (const [platform, arch, index] of [["darwin", "arm64", 3], ["linux", "x64", 1], ["win32", "x64", 1]] as const) {
  test(`packaging keeps only ${platform}-${arch} computer-use binaries`, async () => {
    const root = await mkdtemp(join(tmpdir(), "nativepi-package-"));
    try {
      const resources = platform === "darwin" ? join(root, "NativePi.app", "Contents", "Resources") : join(root, "resources");
      const bin = join(resources, "app.asar.unpacked", "node_modules", "agent-desktop", "bin");
      await mkdir(bin, { recursive: true });
      const names = ["agent-desktop", "agent-desktop-darwin-arm64", "agent-desktop-macos-helper-darwin-arm64", "agent-desktop-linux-x64", "agent-desktop-linux-clipboard-owner-linux-x64", "agent-desktop-win32-x64.exe", "agent-desktop-win32-x64.exe.sha256"];
      await Promise.all(names.map(name => writeFile(join(bin, name), "fixture")));
      await prune({ appOutDir: root, electronPlatformName: platform, arch: index, packager: { appInfo: { productFilename: "NativePi" } } });
      expect((await readdir(bin)).sort()).toEqual(names.filter(name => name === "agent-desktop" || name.includes(`${platform}-${arch}`)).sort());
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
