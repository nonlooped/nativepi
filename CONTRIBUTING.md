# Contributing to NativePi

Thanks for your interest in the project. NativePi is a small desktop interface
for the Pi coding agent on Windows, macOS, and Linux, and it is deliberately
narrow in scope. Reading this page before you start will save you a rewrite.

## Scope

Pi provides NativePi's agent runtime, providers, models, authentication, tool
execution, queues, compaction, and sessions. NativePi also builds useful agent
tools, instructions, and graphical workflows directly into the app through Pi's
APIs. Features do not need a separately installable extension or Pi CLI parity.
Third-party Pi extensions remain supported.

That boundary rules out a category of otherwise reasonable contributions:

- Provider-specific implementations for things Pi already handles.
- Support for agent harnesses other than Pi.
- A second conversation store or a parallel Pi domain model.
- Checkpoints, hidden commits, or anything that rewrites Git history.

If Pi already provides a capability, use its API. Keep Pi as the execution and
session foundation rather than adding a competing agent loop or transcript store.

`AGENTS.md` summarizes project constraints and points to task-specific guidance.
It is written for coding agents but applies equally to people.

## Getting set up

You need [Bun](https://bun.sh/) and Git. Windows, macOS, and Linux are all
supported and released platforms.

Native build tools use Node 24.15 or newer. Linux packaging also needs Python,
make, and a C++ compiler; Windows and macOS use the terminal addon's prebuilds.

```sh
git clone https://github.com/nonlooped/nativepi.git
cd nativepi
bun install
bun run dev
```

For browser testing, start **Local access** in the running app under Settings,
**Access**. Its development link uses the live Vite renderer and the same host
as the Electron window.

The desktop application lives in `apps/desktop`. The public graphical extension
contract lives in `packages/extension-api`.

## Before you open a pull request

`bun install` installs the repository's pre-push hook automatically (outside CI).
For an existing checkout, run `bun run hooks:install` once. Each code push runs
`bun run ci`: frozen-lockfile installation, checksum-pinned workflow linting,
all typechecks, website lint, unit/DOM/integration tests, and both production
builds. Commands come directly from `.github/workflows/ci.yml`; local pushes
always use the full main-branch scope. The first run downloads actionlint to
`.cache/`; Bun, Bash (Git Bash on Windows), and `tar` must be available on PATH.

Commit or stash changes before pushing, and push the checked-out commit. This
ensures checks validate the tree being sent; deletion-only pushes skip checks.
You can also run `bun run ci` on work in progress before committing. Local runs
use your OS and installed Node/Bun; GitHub still verifies Ubuntu with its pinned
toolchain. Installer packaging remains in the Release workflow.

During development, run focused checks for the areas you changed. For example:

```sh
bun run --cwd apps/desktop typecheck
bun test apps/desktop/src/main/updates.test.ts
bun run --cwd apps/desktop test:dom
bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
```

A few conventions that will otherwise cost you a review round:

- **Bun only.** Do not add `package-lock.json`, `pnpm-lock.yaml`, or
  `yarn.lock`. The workspace is managed by `bun.lock`.
- **Conventional Commits.** For example `fix: keep drafts on session switch`.
  Use a title with no body.
- **No version bumps.** Leave `package.json` versions alone. Releases are a
  handled by the automatic Release workflow. Add user-facing changes to
  `CHANGELOG.md` under Unreleased; see [Releasing](./docs/release.md).
- **No extra commit trailers.** No `Co-authored-by`, no generated-by lines, no
  agent attribution.
- **Keep the change focused.** Unrelated refactoring in a feature PR makes the
  change harder to review and more likely to be rejected.

Tests are expected for behavior that can actually break: parsing, session
handling, state transitions, and regressions for bugs that really happened.
They are not expected for static rendering, getters, or coverage counts.

CI runs the complete workspace checks, tests, and builds on main, manual runs,
and reusable release checks. Pull requests select desktop/packages or website
checks from the tested merge tree; known documentation-only changes skip the
install. Shared configuration and unknown paths run everything. Code changes
always run package and integration tests, including compiled documentation
examples. The `Typecheck, Test & Build` status always reports a verdict.

CI also validates workflows with checksum-pinned actionlint. When updating it,
update its version and Linux x64 archive checksum in `.github/workflows/ci.yml`,
and the platform archive checksums in `scripts/lint-workflows.ts`.
Release and CI regression tests live in `tests/`; run `bun test ./tests` when
changing those workflows.

DOM regressions run in isolated happy-dom processes with `bun run --cwd apps/desktop test:dom`.
Pass a `.dom.test.tsx` path relative to `apps/desktop` to run one suite. The root
`bun run test` command also runs these tests; plain `bun test` skips them without
the DOM preload.

Personal maintenance reports and review captures belong outside the repository.

## Reporting bugs

Open an issue with the NativePi version, your operating system and its
version, and the steps that reproduce the problem. Logs and screenshots help.
If the problem involves a specific model or provider, say which one.

## Reporting vulnerabilities

Do not open a public issue. Use
[private vulnerability reporting](https://github.com/nonlooped/nativepi/security/advisories/new)
instead. `SECURITY.md` has the details.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](./LICENSE).
