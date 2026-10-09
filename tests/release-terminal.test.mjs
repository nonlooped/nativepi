import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

test("the Linux release command resolves the desktop compiler and targets the addon directory", async (t) => {
  const workflow = Bun.YAML.parse(await Bun.file(new URL("../.github/workflows/release.yml", import.meta.url)).text())
  const step = workflow.jobs.package.steps.find(step => step.name === "Build the Linux terminal addon")
  const args = step.run.trim().replace(/\brebuild\b/, "clean").split(/\s+/).slice(1)
  const prefix = join(tmpdir(), "nativepi-terminal-build-")
  const addon = mkdtempSync(prefix)
  t.after(() => {
    assert.ok(addon.startsWith(prefix))
    rmSync(addon, { recursive: true, force: true })
  })
  mkdirSync(join(addon, "build"))
  writeFileSync(join(addon, "build", "probe"), "compiler must act on this addon")
  // Clean exercises the same compiler lookup and directory option without downloading headers or compiling.
  args.push("--directory", addon)
  const result = spawnSync(process.execPath, args, {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(existsSync(join(addon, "build")), false, "Compiler did not act on the requested addon directory")
})
