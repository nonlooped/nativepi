# Releasing NativePi

The [Release workflow](../.github/workflows/release.yml) follows
[MeldShell's release flow](https://github.com/nonlooped/meldshell/blob/main/.github/workflows/release.yml).
It checks eligibility, packages installers, then publishes only after the source
commit passes CI and every platform packages successfully.

| Channel | Trigger | Result |
| --- | --- | --- |
| Stable | Daily at 00:17 UTC, or manual dispatch | Next minor version, dated changelog, version commit, annotated tag, latest GitHub release |
| Nightly | Successful main-push CI, hourly at :47, or manual dispatch | Timestamped prerelease for the upcoming minor version, without a version commit |
| Build-only | Manual dispatch from any ref | Installer artifacts retained for seven days; no publication or tag |

Automatic nightlies require application changes since the nearest release tag
and at least 30 minutes since that release. Markdown, `docs/`, and `.github/`
changes alone do not qualify. A CI-triggered nightly skips a commit superseded
on main. Scheduled runs skip a release that already failed for that commit;
a new commit or a manual rerun of the failed workflow retries it.

## Routine changes

Leave app versions unchanged. Add concise user-facing entries to
[CHANGELOG.md](../CHANGELOG.md) under **Unreleased**. The daily stable run moves
those entries into a dated section and updates the root and desktop manifests
and the desktop workspace version in `bun.lock`.

Each stable release increments the minor version, matching MeldShell. Nightly
versions use `X.Y.0-nightly.YYYYMMDDHHMM` for the next minor release. Version
planning and changelog changes live in [scripts/release.mjs](../scripts/release.mjs).

## Manual runs

Open **Actions → Release → Run workflow** and select Stable, Nightly, or
Build-only. Publishing requires main. **Cut a nightly even when no app files
changed** applies only to a manual nightly and cannot reuse an existing tag.

Successful main-push CI for the candidate is reused. Otherwise, the workflow
calls CI for that exact commit. Packaging runs independently on Windows x64,
macOS x64 and arm64, and Linux x64 and arm64.

To make an installer locally on its target platform:

```sh
bun install --frozen-lockfile
bun run package --win --x64 --publish never
# macOS: --mac --x64 or --mac --arm64
# Linux: first compile the terminal addon on the target architecture:
# bun run --cwd apps/desktop node-gyp rebuild --directory node_modules/node-pty
# then package with --linux --x64 or --linux --arm64
```

Output is in `apps/desktop/release`. Linux needs Node 24.15 or newer, Python,
make, and a C++ compiler. The workflow explicitly runs the terminal addon's
compiler from the desktop workspace on each Linux architecture, using its
`node-gyp` dependency. This keeps the compiler accessible with Bun's isolated installs.
Installers remain unsigned; macOS builds are not notarized.

## Publication and updates

The workflow verifies installer completeness and update metadata checksums,
combines the two macOS feeds, and preserves Linux's separate architecture feeds.
It adds SHA-256 checksums and copies every `latest*.yml` to its corresponding
`nightly*.yml` for prereleases. Tags are pushed only after packaging succeeds.
Stable commits and tags are pushed atomically; a moved main causes publication
to stop. Draft releases are uploaded completely before becoming public.
Published releases and their assets are never overwritten.

On Windows and Linux, packaged NativePi checks on launch and every four hours, downloads updates
automatically, and installs them when it quits. Users choose **Stable** or
**Nightly** in **Settings → System → Updates**. The preference survives restart;
new installs follow their installed build. Switching from Nightly to Stable
can install an older stable version. Browser access cannot manage app updates.

Current macOS builds are unsigned. Squirrel.Mac requires a matching Developer ID
signature to install updates, so the Mac app offers **View downloads** instead
of downloading an installer it cannot apply. Both channels and architectures
are published. Download the chosen DMG and replace the app in Applications.
Automatic macOS updates require signing configuration and a signed installation;
the current repository has no signing credentials configured.

Extension packages are versioned independently. Their existing
[trusted-publisher workflow](../.github/workflows/publish-packages.yml) publishes
changed package versions after successful main CI; desktop releases do not bump
those versions.

## Verification

Run `bun test ./tests` for release planning, changelog, tag, and artifact regressions.
Updater regressions are in `apps/desktop/src/main/updates.test.ts`.
Follow the repository's focused-check policy in [AGENTS.md](../AGENTS.md).
Do not watch hosted CI unless asked; a push alone does not prove that installers
have been published or exercised on every operating system.
