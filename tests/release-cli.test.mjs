import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("../scripts/release.mjs", import.meta.url))
function fixture(t, entries = "- A fix.\n\n") {
  const prefix = join(tmpdir(), "nativepi-release-")
  const cwd = mkdtempSync(prefix)
  t.after(() => {
    assert.ok(cwd.startsWith(prefix))
    rmSync(cwd, { recursive: true, force: true })
  })
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  git("init", "--initial-branch=main")
  git("config", "user.name", "Release test")
  git("config", "user.email", "release@example.test")
  git("config", "commit.gpgsign", "false")
  git("config", "tag.gpgsign", "false")
  git("config", "core.hooksPath", join(cwd, ".git", "no-hooks"))
  mkdirSync(join(cwd, "apps/desktop"), { recursive: true })
  for (const path of ["package.json", "apps/desktop/package.json"]) {
    writeFileSync(join(cwd, path), JSON.stringify({ name: "@nativepi/desktop", version: "0.1.0" }))
  }
  writeFileSync(
    join(cwd, "bun.lock"),
    JSON.stringify({
      workspaces: { "apps/desktop": { name: "@nativepi/desktop", version: "0.1.0" } },
    }),
  )
  writeFileSync(
    join(cwd, "CHANGELOG.md"),
    `# Changelog\n\n## [Unreleased]\n\n${entries}[Unreleased]: https://example.test\n`,
  )
  git("add", ".")
  git("commit", "-m", "Initial")
  git("tag", "v0.1.0")
  // Every CLI call in a fixture sees the same minute, including duplicate-tag checks.
  const now = Date.now()
  const clock = join(cwd, ".git", "clock.mjs")
  writeFileSync(clock, `
    const NativeDate = Date
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [${now}])) }
      static now() { return ${now} }
    }
  `)
  const run = (...args) =>
    spawnSync(process.execPath, ["--preload", clock, script, ...args], { cwd, encoding: "utf8" })
  const plan = (channel, ...args) => {
    const result = run("plan", channel, ...args)
    assert.equal(result.status, 0, result.stderr)
    return Object.fromEntries(
      result.stdout
        .trim()
        .split("\n")
        .map((line) => line.split(/=(.*)/)),
    )
  }
  const commit = (path, message) => {
    writeFileSync(join(cwd, path), message)
    git("add", path)
    git("commit", "-m", message)
  }
  return { cwd, git, run, plan, commit }
}

test("a stable release is planned only when the changelog has Unreleased entries", (t) => {
  const withEntries = fixture(t).plan("stable")
  assert.equal(withEntries.release, "true")
  assert.equal(withEntries.version, "0.2.0")
  assert.equal(withEntries.tag, "v0.2.0")
  assert.equal(withEntries.prerelease, "false")
  const without = fixture(t, "").plan("stable")
  assert.equal(without.release, "false")
  assert.match(without.reason, /no Unreleased entries/)
})

test("a nightly is planned only when app files changed since the last release", (t) => {
  const { plan, commit } = fixture(t)
  assert.equal(plan("nightly").release, "false")
  commit("README.md", "docs: explain")
  assert.equal(plan("nightly").release, "false")
  commit("main.ts", "feat: work")
  const nightly = plan("nightly")
  assert.equal(nightly.release, "true")
  assert.match(nightly.version, /^0\.2\.0-nightly\.\d{12}$/)
  assert.equal(nightly.previous, "v0.1.0")
  assert.equal(nightly.prerelease, "true")
})

test("a manual nightly can be forced without app changes", (t) => {
  const { plan, git, run } = fixture(t)
  assert.equal(plan("nightly").release, "false")
  const forced = plan("nightly", "--force")
  assert.equal(forced.release, "true")
  assert.equal(forced.previous, "v0.1.0")
  assert.match(forced.version, /^0\.2\.0-nightly\.\d{12}$/)
  git("tag", forced.tag)
  assert.equal(plan("nightly", "--force").release, "false")
  assert.match(run("plan", "stable", "--force").stderr, /Only nightly plans accept --force/)
})

test("automatic nightlies wait 30 minutes after the previous release", (t) => {
  const { cwd, git, plan, commit } = fixture(t)
  commit("main.ts", "feat: first update")
  assert.equal(plan("nightly", "--automatic").release, "false")
  assert.match(plan("nightly", "--automatic").reason, /less than 30 minutes ago/)
  assert.equal(plan("nightly").release, "true")

  git("tag", "-d", "v0.1.0")
  execFileSync("git", ["tag", "-a", "-m", "Older release", "v0.1.0", "HEAD~1"], {
    cwd,
    env: {
      ...process.env,
      GIT_COMMITTER_DATE: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  })
  assert.equal(plan("nightly", "--automatic").release, "true")
})

test("set-version writes every version field without committing", (t) => {
  const { cwd, git, run } = fixture(t)
  const result = run("set-version", "0.2.0-nightly.202609250507")
  assert.equal(result.status, 0, result.stderr)
  for (const path of ["package.json", "apps/desktop/package.json"]) {
    assert.equal(JSON.parse(readFileSync(join(cwd, path))).version, "0.2.0-nightly.202609250507")
  }
  assert.equal(Bun.JSON5.parse(readFileSync(join(cwd, "bun.lock"), "utf8")).workspaces["apps/desktop"].version, "0.2.0-nightly.202609250507")
  assert.equal(git("log", "--oneline").split("\n").length, 1)
  assert.match(run("set-version", "0.2").stderr, /not a release version/)
})

test("cut commits consistent manifests and notes under an annotated tag", (t) => {
  const { cwd, git, run } = fixture(t)
  const result = run("cut", "0.2.0")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(git("status", "--porcelain"), "")
  assert.equal(git("cat-file", "-t", "v0.2.0"), "tag")
  assert.equal(git("log", "-1", "--format=%s"), "chore(release): v0.2.0")
  for (const path of ["package.json", "apps/desktop/package.json"]) {
    assert.equal(JSON.parse(readFileSync(join(cwd, path))).version, "0.2.0")
  }
  assert.equal(Bun.JSON5.parse(readFileSync(join(cwd, "bun.lock"), "utf8")).workspaces["apps/desktop"].version, "0.2.0")
  assert.equal(run("notes", "0.2.0", "v0.2.0").stdout, "- A fix.\n")
  assert.equal(run("plan", "stable").stdout.match(/^release=(.*)$/m)[1], "false")
})

test("cut refuses anything but the next minor version", (t) => {
  const { git, run } = fixture(t)
  assert.match(run("cut", "0.1.1").stderr, /Expected 0\.2\.0/)
  assert.equal(git("tag", "--list"), "v0.1.0")
  assert.equal(git("status", "--porcelain"), "")
})

test("manifest mismatch fails without partially cutting the changelog", (t) => {
  const { cwd, git, run } = fixture(t)
  writeFileSync(join(cwd, "apps/desktop/package.json"), JSON.stringify({ version: "0.0.9" }))
  git("add", ".")
  git("commit", "-m", "Mismatched version")
  const before = git("rev-parse", "HEAD")
  assert.match(run("cut", "0.2.0").stderr, /Version mismatch/)
  assert.equal(git("rev-parse", "HEAD"), before)
  assert.equal(git("status", "--porcelain"), "")
})

test("nightly notes summarize commits since the previous release", (t) => {
  const { git, run, commit } = fixture(t)
  commit("main.ts", "feat: work")
  git("tag", "v0.2.0-nightly.202609250507")
  const result = run("nightly-notes", "v0.1.0", "v0.2.0-nightly.202609250507")
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Changes since the last stable release:\n\n- A fix\./)
  assert.match(result.stdout, /Commits since v0\.1\.0:\n\n- feat: work \([0-9a-f]+\)/)
})

test("Bun lockfile edits preserve comments, compact package records, and independent versions", (t) => {
  const { cwd, git, run } = fixture(t)
  const lockPath = join(cwd, "bun.lock")
  const lock = `{
  // Keep Bun's JSONC formatting.
  "workspaces": {
    "": { "name": "nativepi", },
    "apps/desktop": { "name": "@nativepi/desktop", "version": "0.1.0", },
    "packages/extension-api": { "version": "1.0.0", },
  },
  "packages": { "example": ["example@1.0.0", "", {}, "sha512-value"], },
}\n`
  writeFileSync(lockPath, lock)
  git("add", "bun.lock")
  git("commit", "-m", "chore: use JSONC lockfile")
  const result = run("set-version", "0.2.0-nightly.202610090947")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(lockPath, "utf8"), lock.replace('"version": "0.1.0"', '"version": "0.2.0-nightly.202610090947"'))
})

test("lock mismatch and uncommitted changes prevent a partial stable release", (t) => {
  const { cwd, git, run } = fixture(t)
  writeFileSync(join(cwd, "bun.lock"), JSON.stringify({ workspaces: { "apps/desktop": { version: "0.0.9" } } }))
  git("add", "bun.lock")
  git("commit", "-m", "chore: mismatched lock")
  const before = git("rev-parse", "HEAD")
  assert.match(run("cut", "0.2.0").stderr, /Version mismatch in bun.lock/)
  assert.equal(git("rev-parse", "HEAD"), before)
  assert.equal(git("status", "--porcelain"), "")
  writeFileSync(join(cwd, "draft.txt"), "keep this draft")
  assert.match(run("cut", "0.2.0").stderr, /Commit local changes first/)
  assert.equal(readFileSync(join(cwd, "draft.txt"), "utf8"), "keep this draft")
})
