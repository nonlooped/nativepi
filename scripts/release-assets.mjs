import { createHash } from "node:crypto"
import { copyFileSync, createReadStream, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { pathToFileURL } from "node:url"

/** Keep both macOS architectures in one feed and Linux architectures in their own feeds. */
export async function assemble(input, output, version, prerelease) {
  const metadata = new Map()
  const assets = new Map()
  for (const directory of readdirSync(input)) {
    const artifact = join(input, directory)
    if (!statSync(artifact).isDirectory()) throw new Error(`Unexpected artifact ${directory}`)
    for (const name of readdirSync(artifact)) {
      const path = join(artifact, name)
      if (/^latest.*\.yml$/.test(name)) {
        const info = Bun.YAML.parse(readFileSync(path, "utf8"))
        if (info.version !== version || !Array.isArray(info.files) || !info.files.length) {
          throw new Error(`Invalid update metadata in ${directory}/${name}`)
        }
        const existing = metadata.get(name)
        if (existing) existing.files.push(...info.files)
        else metadata.set(name, info)
      } else if (/\.(exe|dmg|zip|AppImage|blockmap)$/.test(name)) {
        if (assets.has(name)) throw new Error(`Duplicate asset ${name}`)
        if (!statSync(path).size) throw new Error(`Empty asset ${name}`)
        assets.set(name, path)
      } else throw new Error(`Unexpected asset ${name}`)
    }
  }
  const required = [
    `NativePi-Setup-${version}.exe`, `NativePi-Setup-${version}.exe.blockmap`,
    ...["x64", "arm64"].flatMap((arch) => [
      `NativePi-${version}-${arch}.dmg`, `NativePi-${version}-${arch}.zip`,
      `NativePi-${version}-${arch}.AppImage`,
    ]),
  ]
  for (const name of required) {
    if (!assets.has(name)) throw new Error(`Missing ${name}`)
  }
  for (const [name, expected] of [
    ["latest.yml", required.filter((file) => file.endsWith(".exe"))],
    ["latest-mac.yml", required.filter((file) => file.endsWith(".zip"))],
    ["latest-linux.yml", [`NativePi-${version}-x64.AppImage`]],
    ["latest-linux-arm64.yml", [`NativePi-${version}-arm64.AppImage`]],
  ]) {
    const info = metadata.get(name)
    if (!info || expected.some((file) => !info.files.some((entry) => entry.url === file))) {
      throw new Error(`Missing updater entry in ${name}`)
    }
  }
  for (const [name, info] of metadata) {
    const seen = new Set()
    for (const file of info.files) {
      if (typeof file.url !== "string" || basename(file.url) !== file.url || seen.has(file.url)) {
        throw new Error(`Invalid or duplicate updater URL in ${name}`)
      }
      seen.add(file.url)
      const asset = assets.get(file.url)
      if (!asset) throw new Error(`Missing updater asset ${file.url}`)
      const hash = createHash("sha512")
      for await (const chunk of createReadStream(asset)) hash.update(chunk)
      if (hash.digest("base64") !== file.sha512 || (file.size != null && statSync(asset).size !== file.size)) {
        throw new Error(`Updater checksum or size mismatch for ${file.url}`)
      }
    }
  }
  // Validate the complete set before creating any publishable output.
  mkdirSync(output, { recursive: true })
  for (const [name, path] of assets) copyFileSync(path, join(output, name))
  for (const [name, info] of metadata) {
    const yaml = Bun.YAML.stringify(info, null, 2) + "\n"
    writeFileSync(join(output, name), yaml)
    if (prerelease) writeFileSync(join(output, name.replace(/^latest/, "nightly")), yaml)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [input, output, version, prerelease] = process.argv.slice(2)
  try {
    if (!input || !output || !version || !["true", "false"].includes(prerelease)) {
      throw new Error("Usage: bun scripts/release-assets.mjs INPUT OUTPUT VERSION PRERELEASE")
    }
    await assemble(input, output, version, prerelease === "true")
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
