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

- Before any new feature or UI/UX change, read and apply the [UI and UX requirements](apps/desktop/PRODUCT.md#ui-and-ux-requirements). Do not assume the person using the app is technically savvy.
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

## Testing

- Add or change tests only when needed to verify the task or explicitly requested.
  Prioritize parsing, state transitions, error paths, concurrency, persistence,
  IPC/Pi RPC, and untrusted extension input. No coverage targets or speculative
  test expansion.
- For bug fixes, add a focused regression test that fails before the fix and
  passes after it. If the failure cannot be reproduced in an automated test,
  verify it directly and report the gap.
- For renderer behavior, drive an action or event and assert the resulting
  state or user-observable behavior. Do not test React element trees, CSS/layout
  values, or merely that rendering succeeds; use real UI inspection for visuals.
- Skip tests of type-system guarantees, trivial getters, copies of implementation
  logic, mock-call counts alone, and duplicate cases exercising the same behavior.
  Do not add snapshot tests unless explicitly requested.
- Each test must catch a plausible defect: identify a code change that would
  make it fail. Use independent expected results and keep only cases that catch
  distinct failures.
- Do not delete, skip, or weaken tests to make a change pass. If an existing test
  is wrong, explain the incorrect expectation and preserve coverage of the
  intended behavior when correcting it.
- Run focused checks for changed behavior and meaningful failure cases; see
  [CONTRIBUTING.md](CONTRIBUTING.md#before-you-open-a-pull-request) for commands
  and the required DOM test runner. No project-wide tests, builds, or quality
  suites unless requested. Report the exact commands run, their results, and
  any verification gaps; do not claim unrun checks passed.

## Verification and delivery

- For UI work, check for a running app and reuse it, or start the app if none
  is running. Inspect real UI states, capture before/after evidence, and iterate
  on polish. Browser testing uses the app's Local Access feature and shares its
  real data. Check for stale processes if the app appears to serve old state.
- Prefer [agent-desktop](https://github.com/vercel-labs/agent-desktop) for native
  app inspection, interaction, and screenshots instead of Codex computer use.
  Before first use, run `agent-desktop status`, `agent-desktop skills get desktop`,
  and `agent-desktop skills get platform`; follow the version-matched guides.
  Use `list-windows` to select NativePi's window (the development app is named
  Electron). Observe after actions and keep matching before/after captures
  outside the repository. Use Local Access when browser inspection is needed.
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
