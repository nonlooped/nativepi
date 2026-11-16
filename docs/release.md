# Releasing NativePi

Add user-facing changes to [CHANGELOG.md](../CHANGELOG.md) under **Unreleased**;
leave app versions unchanged. The [Release workflow](../.github/workflows/release.yml)
owns version bumps, tags, and GitHub releases. Publication requires `main`,
passing CI, and successful packaging on every supported platform. Published
releases and assets are never overwritten. Planning, checks, packaging, and
publication use the same immutable source commit. A successful main-push CI
verdict avoids duplicate checks; otherwise packaging waits for the complete
reusable CI run to pass. Failed or canceled checks cannot start packaging.

| Channel | Trigger | Result |
| --- | --- | --- |
| Stable | Daily at 00:17 UTC when Unreleased has entries; or manual | Next minor version, dated changelog, version commit and tag |
| Nightly | Successful main-push CI, hourly at :47, or manual | Next-minor `X.Y.0-nightly.YYYYMMDDHHMM` prerelease; no version commit |
| Build-only | Manual, from any ref | Installer artifacts retained for seven days; no publication or tag |

Automatic nightlies require application changes since the nearest release tag;
there is no cooldown between releases. Markdown, `docs/`, `.github/`, and website-only (`apps/web/`) changes do not
qualify. Shared dependency changes still qualify. Scheduled runs do not retry a failed release for the same commit;
retry manually or push a fix.

## Manual runs

Use **Actions → Release → Run workflow** and select the channel. For a manual
nightly, **Cut a nightly even when no app files changed** bypasses the change
requirement, but cannot reuse a tag.

For local installers, build on the target platform after completing
[setup](../CONTRIBUTING.md#getting-set-up):

```sh
bun install --frozen-lockfile
bun run package --win --x64 --publish never
# macOS: replace --win --x64 with --mac --x64 or --mac --arm64.
# Linux: compile the terminal addon first, then use --linux --x64 or --linux --arm64:
# bun run --cwd apps/desktop node-gyp rebuild --directory node_modules/node-pty
```

Build-only runs have separate concurrency groups and do not displace queued
publications.

Output: `apps/desktop/release`. Installers have no trusted publisher signature.
macOS app bundles are ad-hoc signed to seal the completed bundle, but are not
Developer ID signed or notarized and still require manual updates and a
Gatekeeper override on first launch. Do not set `mac.identity` to `null`: that
skips signing and leaves Electron's stale signature on the modified bundle,
which macOS rejects as damaged. Both macOS packaging jobs verify the complete
bundle with `codesign --verify --deep --strict` before uploading installers.

## Running background hosts during updates

The desktop updater downloads updates but never installs on desktop quit: the
independent host may still have active work and installed files open. Users must
explicitly stop the background service before installing or manually replacing
the app. Compatible desktop restarts attach to a running host; incompatible wire
protocols leave it running and require an explicit stop. See
[background-service.md](background-service.md). Keep `SERVICE_PROTOCOL` stable for
compatible handler/event changes, and increment it for incompatible semantics.
No new certificates or paid signing services are required for this host.

## Packaging performance

Release packaging installs the production closure of `@nativepi/release-tools`: the
desktop runtime and the locked Electron, electron-builder, and node-gyp toolchain.
Renderer build and test dependencies are installed only by CI or the fallback build.
Keep the tool versions in `apps/release-tools/package.json` aligned with the desktop
devDependencies. Packaging resolves Electron from that installed toolchain and
passes its exact version to electron-builder.
Bun's extracted package cache is not restored: its many-file extraction was slower
than installation on the Windows and Intel macOS runners. Electron and packaging
tool downloads remain cached by host/target architecture and locked tool versions.

Full non-PR CI retains the platform-independent `apps/desktop/out` build for seven
days. Releases reuse it only from the successful main-push CI run certifying the
same source commit, or from their own reusable checks. Plan locates the certified
artifact so the normal path starts packaging without another preparation runner.
If the artifact is absent or expired, one Ubuntu job builds it before the five
packaging jobs start. Release versions are applied to package metadata during packaging; the shared build does
not embed a release version. Local `bun run package` still builds before packaging.

The macOS x64 job uses `macos-15-intel`, and arm64 uses Apple Silicon. Native
smoke checks run in the packaged Electron on each architecture before uploading
installers, preserving signature verification, terminal spawning, Koffi,
transcription-library loading, extension compilation, and computer-use binary/helper
checks. These checks do not replace end-to-end dictation and desktop permission tests.

macOS ZIP/DMG compression uses level 3. It preserves the signed bundle, formats,
feeds, and blockmaps while trading slightly larger downloads for faster packaging.
Windows NSIS and Linux AppImage compression retain their defaults.

Platform file exclusions skip foreign computer-use binaries before copying them;
the afterPack hook still removes binaries for the other CPU architecture. The
development installation is left intact.

When comparing release times, include setup/cache and post-job cache saves, and
compare cold and warm runs of the same commit. Release publication remains
serialized to protect version selection, stable commits, and immutable tags.

## Extension packages and tooling

Extension versions are independent of desktop releases. Bumping them on `main`
triggers [npm publication](../.github/workflows/publish-packages.yml) after CI.
The workflow checks every current package version, so a later successful main
push or manual main dispatch can retry unpublished versions without another
version bump. Manual publication requires successful main-push CI for the same
commit.

Release logic lives in [scripts/release.mjs](../scripts/release.mjs); artifact
handling lives in [scripts/release-assets.mjs](../scripts/release-assets.mjs).
For release-tooling changes, run `bun test ./tests`. Updater regressions are in
`apps/desktop/src/main/updates.test.ts`.
