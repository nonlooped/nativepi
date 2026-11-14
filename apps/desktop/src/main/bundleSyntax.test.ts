import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MainConfigFactory } from "electron-vite";
import { build } from "vite";

/** Parse the actual Electron main ESM output, without launching Electron. */
test("main ESM shims cannot redeclare the native-addon loader", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const output = await mkdtemp(join(tmpdir(), "nativepi-main-syntax-"));
  try {
    const entry = join(output, "entry.ts");
    const material = fileURLToPath(new URL("./windowsMaterial.ts", import.meta.url));
    await writeFile(entry, `export { setWindowsMaterialActive } from ${JSON.stringify(material)}; export const filename = __filename;`);
    await writeFile(join(output, "package.json"), '{"type":"module"}');
    const config = await new MainConfigFactory({ root, build: { outDir: output, lib: { entry, formats: ["es"], fileName: "main" }, rolldownOptions: { external: ["koffi"] }, emptyOutDir: false } }, { configFile: false }, { root }).build();
    await build({ ...config, logLevel: "silent" });
    const scripts = (await readdir(output)).filter(name => name.endsWith(".js") || name.endsWith(".mjs"));
    expect(scripts.length).toBeGreaterThan(0);
    for (const name of scripts) execFileSync("node", ["--check", join(output, name)], { stdio: "pipe" });
  } finally { await rm(output, { recursive: true, force: true }); }
});
