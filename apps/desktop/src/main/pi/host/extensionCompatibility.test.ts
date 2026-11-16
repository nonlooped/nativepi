import { expect, test } from "bun:test";
import { mkdtemp, rm, cp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { callExtensionMethod, installExtensionChannel } from "./extensionChannel.ts";
import { loadGraphicalExtensions } from "../../extensions.ts";

test("Pi loads its unchanged hello example and the optional graphical activity package", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nativepi-real-extension-"));
  const piRoot = path.resolve(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")), "../..");
  const example = path.resolve(import.meta.dir, "../../../../../../packages/extension-api/examples/activity");
  try {
    const packageDir = path.join(root, "activity");
    await cp(example, packageDir, { recursive: true });
    await symlink(path.resolve(import.meta.dir, "../../../../node_modules"), path.join(packageDir, "node_modules"), "dir");
    installExtensionChannel(() => {});
    const loaded = await discoverAndLoadExtensions([path.join(piRoot, "examples/extensions/hello.ts"), path.join(packageDir, "extension.ts")], root, path.join(root, "agent"));
    expect(loaded.errors).toEqual([]);
    expect(loaded.extensions.some(extension => extension.tools.has("hello"))).toBe(true);
    expect(loaded.extensions.some(extension => extension.commands.has("activity"))).toBe(true);
    expect(await callExtensionMethod("nativepi-example-activity", "state", undefined)).toEqual({ tools: 0, lastTool: null });
    const graphical = await loadGraphicalExtensions(packageDir, true);
    expect(graphical.find(extension => extension.name === "nativepi-example-activity")?.error).toBeUndefined();
    expect(graphical.find(extension => extension.name === "nativepi-example-activity")?.code).toContain("scoped-handles");
  } finally { await rm(root, { recursive: true, force: true }); }
});
