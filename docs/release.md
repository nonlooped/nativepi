# Releasing NativePi

Add user-facing changes to [CHANGELOG.md](../CHANGELOG.md) under **Unreleased**;
leave app versions unchanged. The [Release workflow](../.github/workflows/release.yml)
owns version bumps, tags, and GitHub releases. Publication requires `main`,
passing CI, and successful packaging on every supported platform. Published
releases and assets are never overwritten.

| Channel | Trigger | Result |
| --- | --- | --- |
| Stable | Daily at 00:17 UTC when Unreleased has entries; or manual | Next minor version, dated changelog, version commit and tag |
| Nightly | Successful main-push CI, hourly at :47, or manual | Next-minor `X.Y.0-nightly.YYYYMMDDHHMM` prerelease; no version commit |
| Build-only | Manual, from any ref | Installer artifacts retained for seven days; no publication or tag |

Automatic nightlies require application changes since the nearest release tag
and a 30-minute cooldown. Markdown, `docs/`, and `.github/` changes alone do not
qualify. Scheduled runs do not retry a failed release for the same commit;
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

Output: `apps/desktop/release`. Installers are unsigned; macOS builds are also
unnotarized and require manual updates.

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
