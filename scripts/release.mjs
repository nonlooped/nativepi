// Release tooling for the scheduled and manual Release workflow.
// `plan <stable|nightly> [--force|--automatic]` decides whether HEAD should be released and prints key=value outputs.
// `set-version X` writes a version into every version field without committing.
// `cut X` moves the changelog's Unreleased entries under X, bumps the version, commits, and tags.
// `notes X [ref]` prints X's changelog entries; `nightly-notes <previous-tag> <ref>` summarizes a
// nightly build.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const REPOSITORY = "https://github.com/nonlooped/nativepi"
// The app version lives in the root and desktop manifests; extension packages are versioned independently.
const VERSIONED_WORKSPACES = ["", "apps/desktop"]
const STABLE = /^(\d+)\.(\d+)\.(\d+)$/
const VERSION = /^\d+\.\d+\.\d+(-nightly\.\d+)?$/
// Changes to these paths alone do not warrant a nightly build.
const NON_APP_PATH = /^(docs\/|\.github\/)|\.md$/

/** Every stable release is the next minor version. */
export function nextVersion(current) {
  const parts = STABLE.exec(current)?.slice(1).map(Number)
  if (!parts) throw new Error(`Current version ${current} is not a stable X.Y.Z version`)
  return `${parts[0]}.${parts[1] + 1}.0`
}

/** A nightly precedes the stable release it leads up to, and later nightlies sort higher. */
export function nightlyVersion(current, date) {
  const stamp = date.toISOString().slice(0, 16).replace(/\D/g, "")
  return `${nextVersion(current)}-nightly.${stamp}`
}

export const isAppChange = (path) => !NON_APP_PATH.test(path)

/** Splits the changelog into its preamble, `## ` sections, and trailing link definitions. */
function parseChangelog(changelog) {
  const [body, ...rest] = changelog.split(/\n(?=\[Unreleased\]: )/)
  const [preamble, ...sections] = body.split(/\n(?=## )/)
  return { preamble, sections, links: rest.join("\n") }
}

function sectionBody(section) {
  return section.slice(section.indexOf("\n") + 1).trim()
}

/** The Unreleased entries, or an empty string when there are none to release. */
export function unreleasedEntries(changelog) {
  const [unreleased] = parseChangelog(changelog).sections
  if (!unreleased?.startsWith("## [Unreleased]")) {
    throw new Error("CHANGELOG.md must start its sections with ## [Unreleased]")
  }
  const entries = sectionBody(unreleased)
  return /^- /m.test(entries) ? entries : ""
}

export function releaseNotes(changelog, version) {
  const section = parseChangelog(changelog).sections.find((candidate) =>
    candidate.startsWith(`## [${version}] - `),
  )
  const notes = section && sectionBody(section)
  if (!notes) throw new Error(`CHANGELOG.md has no entries for ${version}`)
  return `${notes}\n`
}

/** `previousTag` links the new version to a comparison; untagged history gets a release link. */
export function cutChangelog(changelog, version, date, previousTag = null) {
  const { preamble, sections, links } = parseChangelog(changelog)
  const entries = unreleasedEntries(changelog)
  if (!entries) throw new Error("CHANGELOG.md has no Unreleased entries to release")
  const versionLink = previousTag
    ? `${REPOSITORY}/compare/${previousTag}...v${version}`
    : `${REPOSITORY}/releases/tag/v${version}`
  const otherLinks = links.split("\n").filter((line) => line && !line.startsWith("[Unreleased]: "))
  return [
    preamble.trimEnd(),
    "",
    "## [Unreleased]",
    "",
    `## [${version}] - ${date}`,
    "",
    entries,
    "",
    ...sections.slice(1).map((section) => `${section.trimEnd()}\n`),
    `[Unreleased]: ${REPOSITORY}/compare/v${version}...HEAD`,
    `[${version}]: ${versionLink}`,
    ...otherLinks,
    "",
  ].join("\n")
}

export function nightlyNotes({ entries, commits, previousTag, tag }) {
  const lines = []
  if (entries) lines.push("Changes since the last stable release:", "", entries, "")
  lines.push(`Commits since ${previousTag}:`, "", commits.trim() || "- None", "")
  lines.push(`Full comparison: ${REPOSITORY}/compare/${previousTag}...${tag}`, "")
  return lines.join("\n")
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()
const manifestPath = (workspace) => (workspace ? `${workspace}/package.json` : "package.json")

/** The nearest release tag behind HEAD, stable or nightly. */
function previousTag() {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*")
  } catch {
    return null
  }
}

function plan(channel, force = false, automatic = false, now = new Date()) {
  const current = readJson("package.json").version
  const previous = previousTag()
  let version
  let reason
  if (channel === "stable") {
    version = nextVersion(current)
    if (!unreleasedEntries(readFileSync("CHANGELOG.md", "utf8"))) reason = "no Unreleased entries"
  } else if (channel === "nightly") {
    version = nightlyVersion(current, now)
    const changed = previous
      ? git("diff", "--name-only", previous, "HEAD").split("\n").filter(Boolean)
      : ["(no earlier release)"]
    if (!force && !changed.some(isAppChange)) reason = `no app changes since ${previous}`
    if (!reason && automatic && previous) {
      const releasedAt = Number(
        git("for-each-ref", "--format=%(creatordate:unix)", `refs/tags/${previous}`),
      )
      if (!Number.isFinite(releasedAt) || releasedAt <= 0) {
        throw new Error(`Cannot read release time for ${previous}`)
      }
      if (now.getTime() - releasedAt * 1000 < 30 * 60 * 1000) {
        reason = `last release ${previous} was less than 30 minutes ago`
      }
    }
  } else throw new Error("Plan stable or nightly")
  if (!reason && git("tag", "--list", `v${version}`)) reason = `v${version} already exists`
  return {
    release: !reason,
    reason: reason ?? `release ${version}`,
    version,
    tag: `v${version}`,
    previous: previous ?? "",
    prerelease: channel === "nightly",
  }
}

function setVersion(version) {
  if (!VERSION.test(version ?? "")) throw new Error(`${version} is not a release version`)
  const current = readJson("package.json").version
  const lockText = readFileSync("bun.lock", "utf8")
  const lock = Bun.JSON5.parse(lockText)
  const manifests = VERSIONED_WORKSPACES.map((workspace) => {
    const manifest = readJson(manifestPath(workspace))
    if (manifest.version !== current) throw new Error(`Version mismatch in ${manifestPath(workspace)}`)
    return manifest
  })
  if (lock.workspaces?.["apps/desktop"]?.version !== current) {
    throw new Error("Version mismatch in bun.lock")
  }
  // Bun has no root version record. Keep its compact lockfile intact and edit only this workspace.
  const updatedLock = lockText.replace(
    /("apps\/desktop"\s*:\s*\{\s*"name"\s*:\s*"@nativepi\/desktop",\s*"version"\s*:\s*")[^"]+("|$)/,
    (_, prefix, suffix) => prefix + version + suffix,
  )
  const expectedLock = structuredClone(lock)
  expectedLock.workspaces["apps/desktop"].version = version
  if (JSON.stringify(Bun.JSON5.parse(updatedLock)) !== JSON.stringify(expectedLock)) {
    throw new Error("Cannot update the desktop version in bun.lock")
  }
  VERSIONED_WORKSPACES.forEach((workspace, index) => {
    writeJson(manifestPath(workspace), { ...manifests[index], version })
  })
  writeFileSync("bun.lock", updatedLock)
}

function cut(version) {
  if (git("status", "--porcelain")) throw new Error("Commit local changes first")
  const current = readJson("package.json").version
  if (version !== nextVersion(current)) throw new Error(`Expected ${nextVersion(current)}`)
  if (git("tag", "--list", `v${version}`)) throw new Error(`Tag v${version} already exists`)
  const date = new Date().toISOString().slice(0, 10)
  const previous = git("tag", "--list", `v${current}`) || null
  const changelog = cutChangelog(readFileSync("CHANGELOG.md", "utf8"), version, date, previous)
  setVersion(version)
  writeFileSync("CHANGELOG.md", changelog)
  git("add", "CHANGELOG.md", "bun.lock", ...VERSIONED_WORKSPACES.map(manifestPath))
  git("commit", "--quiet", "--message", `chore(release): v${version}`)
  git("tag", "--annotate", `v${version}`, "--message", `NativePi ${version}`)
  console.log(`Tagged v${version}`)
}

const changelogAt = (ref) =>
  ref ? git("show", `${ref}:CHANGELOG.md`) : readFileSync("CHANGELOG.md", "utf8")

function run(command, args) {
  if (command === "plan") {
    const [channel, ...options] = args
    if (
      options.length > 1 ||
      (options.length === 1 &&
        (channel !== "nightly" || !["--force", "--automatic"].includes(options[0])))
    ) {
      throw new Error("Only nightly plans accept --force or --automatic")
    }
    const result = plan(channel, options[0] === "--force", options[0] === "--automatic")
    return Object.entries(result)
      .map(([key, value]) => `${key}=${value}\n`)
      .join("")
  }
  if (command === "set-version") return setVersion(args[0])
  if (command === "cut") return cut(args[0])
  if (command === "notes") return releaseNotes(changelogAt(args[1]), args[0])
  if (command === "nightly-notes") {
    const [previous, ref] = args
    if (!previous || !ref) throw new Error("Pass the previous tag and the nightly ref")
    return nightlyNotes({
      entries: unreleasedEntries(changelogAt(ref)),
      commits: git("log", "--no-merges", "--format=- %s (%h)", `${previous}..${ref}`),
      previousTag: previous,
      tag: ref,
    })
  }
  throw new Error(
    "Usage: bun scripts/release.mjs plan <stable|nightly> [--force|--automatic for nightly] | set-version X | cut X | notes X [ref] | nightly-notes <previous-tag> <ref>",
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const [command, ...args] = process.argv.slice(2)
    const output = run(command, args)
    if (typeof output === "string") process.stdout.write(output)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
