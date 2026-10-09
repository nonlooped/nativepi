import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { assemble } from "../scripts/release-assets.mjs"

function fixture(t) {
  const prefix = join(tmpdir(), "nativepi-assets-")
  const cwd = mkdtempSync(prefix)
  t.after(() => {
    assert.ok(cwd.startsWith(prefix))
    rmSync(cwd, { recursive: true, force: true })
  })
  const input = join(cwd, "input")
  const output = join(cwd, "output")
  const version = "1.15.0-nightly.202610090947"
  const feeds = [
    ["win-x64", "latest.yml", [`NativePi-Setup-${version}.exe`]],
    ...["x64", "arm64"].map((arch) => [
      `mac-${arch}`, "latest-mac.yml", [`NativePi-${version}-${arch}.zip`, `NativePi-${version}-${arch}.dmg`],
    ]),
    ...["x64", "arm64"].map((arch) => [
      `linux-${arch}`, `latest-linux${arch === "x64" ? "" : "-arm64"}.yml`, [`NativePi-${version}-${arch}.AppImage`],
    ]),
  ]
  for (const [directory, name, names] of feeds) {
    mkdirSync(join(input, directory), { recursive: true })
    const files = names.map((url) => {
      const data = Buffer.from(`installer: ${url}`)
      writeFileSync(join(input, directory, url), data)
      if (url.endsWith(".exe")) writeFileSync(join(input, directory, `${url}.blockmap`), "blockmap")
      return { url, size: data.length, sha512: createHash("sha512").update(data).digest("base64") }
    })
    const info = { version, files, path: files[0].url, sha512: files[0].sha512 }
    writeFileSync(join(input, directory, name), Bun.YAML.stringify(info))
  }
  return { input, output, version }
}

test("release assets retain both macOS architectures and every nightly feed", async (t) => {
  const { input, output, version } = fixture(t)
  await assemble(input, output, version, true)
  const mac = Bun.YAML.parse(readFileSync(join(output, "latest-mac.yml"), "utf8"))
  assert.deepEqual(mac.files.filter((file) => file.url.endsWith(".zip")).map((file) => file.url).sort(), [
    `NativePi-${version}-arm64.zip`, `NativePi-${version}-x64.zip`,
  ])
  for (const suffix of ["", "-mac", "-linux", "-linux-arm64"]) {
    assert.equal(readFileSync(join(output, `latest${suffix}.yml`), "utf8"), readFileSync(join(output, `nightly${suffix}.yml`), "utf8"))
  }
})

test("stable assembly publishes only stable channel metadata", async (t) => {
  const { input, output, version } = fixture(t)
  await assemble(input, output, version, false)
  assert.ok(existsSync(join(output, "latest.yml")))
  assert.equal(existsSync(join(output, "nightly.yml")), false)
})

test("missing architecture installers stop publication without writing output", async (t) => {
  const { input, output, version } = fixture(t)
  rmSync(join(input, "linux-arm64", `NativePi-${version}-arm64.AppImage`))
  await assert.rejects(assemble(input, output, version, true), /Missing .*arm64\.AppImage/)
  assert.equal(existsSync(output), false)
})

test("mixed versions and corrupt installer checksums stop publication", async (t) => {
  const first = fixture(t)
  const feedPath = join(first.input, "win-x64", "latest.yml")
  writeFileSync(feedPath, readFileSync(feedPath, "utf8").replace(first.version, "1.14.0"))
  await assert.rejects(assemble(first.input, first.output, first.version, true), /Invalid update metadata/)
  assert.equal(existsSync(first.output), false)
  const second = fixture(t)
  writeFileSync(join(second.input, "mac-arm64", `NativePi-${second.version}-arm64.zip`), "corrupt payload")
  await assert.rejects(assemble(second.input, second.output, second.version, true), /checksum or size mismatch/)
  assert.equal(existsSync(second.output), false)
})

test("a feed missing one macOS updater ZIP stops publication", async (t) => {
  const { input, output, version } = fixture(t)
  const feedPath = join(input, "mac-arm64", "latest-mac.yml")
  const info = Bun.YAML.parse(readFileSync(feedPath, "utf8"))
  info.files = info.files.filter((file) => !file.url.endsWith(".zip"))
  writeFileSync(feedPath, Bun.YAML.stringify(info))
  await assert.rejects(assemble(input, output, version, true), /Missing updater entry in latest-mac.yml/)
  assert.equal(existsSync(output), false)
})
