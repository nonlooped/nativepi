# NativePi

NativePi is a local desktop interface for the Pi coding agent on Windows,
macOS, and Linux. Pi supplies the agent runtime; NativePi adds built-in agent
tools, instructions, and a graphical workflow.

## Task-specific context

- [PRODUCT.md](apps/desktop/PRODUCT.md): product scope and ownership boundaries.
- [CONTRIBUTING.md](CONTRIBUTING.md): setup, checks, and contribution conventions.
- [docs/release.md](docs/release.md): packaging and release operations.

## Pi boundary

Pi supplies model execution, configuration, authentication, tool execution,
extensions, and sessions. NativePi may add built-in agent tools and instructions
through Pi's APIs. Chat mode, web access, HTML artifacts, chat naming, ask_user,
and service-tier controls are app features, not separately installable NativePi
extensions. New useful capabilities may be built directly into the app; they do
not need equivalent Pi CLI behavior. Keep support for third-party Pi extensions.

Pi session files are the conversation source of truth. Persist only
NativePi-owned UI data; preserve unknown Pi fields and protect against
conflicting external session writes. Do not add a parallel Pi domain model,
other agent harnesses, or Git history-rewriting features.

Pi starts through `apps/desktop/src/main/pi/host/entry.ts`, which adds terminal
extension UI to Pi's RPC mode without reimplementing it. Keep
`@earendil-works/pi-tui` pinned to the exact `pi-coding-agent` version and verify
extension surfaces when upgrading Pi.

## Engineering choices

- Follow the design philosophy: create, review, enhance, polish, repeat. Use
  this process at all times instead of one-shotting designs for time or
  simplicity. Design is a very important and heavily underrated aspect of any app.
- Prefer the smallest correct change and maintained packages or platform APIs
  over custom infrastructure. Simplicity matters more than speculative reuse.
- Use Bun for package management; keep `bun.lock` as the only lockfile.
  Electron main and preload run on Node. Spawn Pi with Electron's binary under
  `ELECTRON_RUN_AS_NODE`; use Electron IPC and `contextBridge`.
- React Compiler handles memoization. Fix compiler diagnostics rather than
  suppressing them; add manual memoization only for a demonstrated need.
- Use existing shadcn/base-ui primitives, preset `b1wXDkDqCm`, Phosphor icons,
  and semantic theme tokens. Support light, dark, and custom color schemes.
  Run shadcn commands with `bunx --bun shadcn@latest`.
- Use Zustand for renderer UI state and Zod at IPC, Pi RPC, persisted-file,
  and untrusted extension boundaries.

## Verification and delivery

- Use focused checks for the changed behavior and meaningful failure cases.
  No coverage targets; no project-wide tests, builds, or quality suites unless
  requested. Report what was verified and any gaps.
- Do not start the app or long-lived dev processes unless requested. Browser
  testing uses the running app's Local Access feature and shares its real data.
  Check for stale processes if the app appears to serve old state.
- Do not watch or poll hosted CI unless requested.
- Use Conventional Commit titles, with no body or attribution trailers.
- After finishing work, commit the changes following repository conventions;
  staging and committing do not need to be hunk-specific.
- When publishing, push small features or changes directly to `main`. Push
  unrelated changes directly to `main` as separate commits. Open a new PR for
  a noticeable UI change or refactor and use the `before-and-after` skill. Open
  a new PR for a large, unified change or refactor.
- Record user-visible changes in `CHANGELOG.md` under Unreleased. App version
  bumps, tags, and releases belong to the Release workflow. Extension package
  version bumps on `main` trigger npm publication after CI; treat them as
  publishing. See the release guide for details.
- Keep personal maintenance reports and review captures outside the repository.
