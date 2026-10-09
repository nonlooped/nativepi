# Contributing to NativePi

Thanks for your interest in the project. NativePi is a small desktop interface
for the Pi coding agent on Windows, macOS, and Linux, and it is deliberately
narrow in scope. Reading this page before you start will save you a rewrite.

## Scope

NativePi is a wrapper, not an agent harness. Pi owns the agent loop, providers,
models, authentication, tools, prompts, skills, extensions, queues, compaction,
and sessions. NativePi calls Pi and renders what Pi returns.

That boundary rules out a category of otherwise reasonable contributions:

- NativePi-owned AI logic, LLM requests, or agent tools.
- Provider-specific implementations for things Pi already handles.
- Support for agent harnesses other than Pi.
- A second conversation store or a parallel Pi domain model.
- Checkpoints, hidden commits, or anything that rewrites Git history.

If Pi already provides a capability, the right change is to call Pi and display
the result. When you are unsure whether an idea fits, open an issue and ask
before writing code.

`AGENTS.md` holds the full engineering guidelines, including the state, testing,
and React Compiler rules. It is written for coding agents but applies equally to
people.

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

Run focused checks for the areas you changed. For example:

```sh
bun run --cwd apps/desktop typecheck
bun test apps/desktop/src/main/updates.test.ts
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

CI runs the complete workspace checks, tests, and builds. Release tooling tests
live in `tests/`; run `bun test ./tests` when changing release behavior.

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
