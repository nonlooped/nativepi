# NativePi Agent Instructions

## Project

NativePi is a small, local, Windows-first desktop interface for the Pi coding
agent. It is a wrapper, not an agent harness.

Read `PLAN.md` before making architectural or product-scope decisions.

The intended stack is:

- Electron and electron-vite.
- Bun as the package manager (not the desktop runtime).
- React 19.2 with React Compiler.
- Vite+ / Vite.
- Tailwind CSS 4.
- shadcn/ui using preset `b1wXDkDqCm`.
- Zustand.
- Zod 4 at process and external-data boundaries.

Use Bun as the package manager. Do not introduce npm, pnpm, or Yarn lockfiles.
Electron main/preload run on Node; spawn Pi with Electron's binary under
`ELECTRON_RUN_AS_NODE`. Use Electron IPC (`ipcMain.handle` + preload
`contextBridge`), not a custom RPC framework.

Do not be shy about using cutting-edge technology. Prefer functionality over
stability when choosing tools, packages, APIs, and platform features. A young or
rapidly evolving technology is acceptable when it materially improves the
product or developer experience; do not reject it merely because an older option
is more established. Still choose technology for a concrete benefit, not novelty
alone.

## Product Boundary

Pi owns the agent loop, providers, models, authentication data, tools, prompts,
skills, extensions, queues, compaction, and sessions. NativePi presents those
capabilities through a desktop UI.

Do not add:

- NativePi-owned AI logic or LLM requests.
- NativePi-owned agent tools.
- Provider-specific implementations when Pi already owns them.
- Support for other agent harnesses.
- Worktrees, checkpoints, hidden commits, or Git mutation features.
- A second durable conversation store or parallel Pi domain model.
- Architecture copied from the previous `nonlooped/pi-wrapper` attempt.

When Pi already provides a capability, call Pi and display its result instead of
reimplementing it.

## Simplicity Is the Primary Engineering Value

Prefer the smallest correct change. A successful change should normally leave
the relevant area simpler than it was before.

The preferred git diff has more deletions than insertions whenever functionality
can be retained. Actively look for ways to reduce lines of code, indirection,
state, and concepts without moving the complexity somewhere else.

- Retain behavior while reducing LOC and complexity.
- Delete obsolete code instead of preserving compatibility without a concrete
  need.
- Keep logic in one function or module until reuse is real.
- Do not extract helpers that only rename a straightforward operation.
- Do not introduce interfaces, factories, managers, services, registries, event
  buses, repositories, adapters, or generic wrappers for a single use case.
- Do not add caching, batching, virtualization, pooling, background workers, or
  persistence layers before a measured problem requires them.
- Do not add architecture merely to satisfy a linter, checker, test-count target,
  or perceived future requirement.
- Do not trade visible complexity for hidden framework complexity.
- Do not refactor unrelated code while completing a focused change.
- Some local duplication is preferable to a premature abstraction.

If two approaches are correct, choose the one with fewer concepts, files,
dependencies between internal modules, and lines of project-owned code.

## Prefer Maintained Packages

Strictly prefer established public packages and platform libraries over
hand-rolling generic, difficult, or maintenance-heavy behavior. Packages provide
convenience, community testing, maintenance, and a familiar API.

Examples include:

- Authentication: use an established package such as `better-auth` when the
  concern is not already owned by Pi.
- Diff rendering: use `@pierre/diffs` rather than building a diff engine or view.
- UI primitives: use shadcn/ui and its underlying maintained primitives.
- Markdown, syntax highlighting, file search, schema validation, and similar
  generic concerns: select a maintained package before writing custom machinery.

Before hand-rolling a generic feature, search for an established package. Prefer
a focused, actively maintained, license-compatible package with a public API.
Use the package directly unless a wrapper solves a concrete project-specific
problem. Do not recreate package behavior behind a homegrown abstraction.

Native Bun, browser, and platform APIs count as maintained library APIs. Use them
when they already solve the concern cleanly.

## React and React Compiler

Use React Compiler properly. Write idiomatic React that the compiler can analyze;
do not trick, bypass, suppress, or work around it.

- Keep components and hooks pure during render.
- Never mutate props, state, hook values, or values created outside the current
  render.
- Call hooks unconditionally and only from React components or custom hooks.
- Derive values during render instead of synchronizing derived state in effects.
- Put interaction logic in event handlers rather than effects.
- Use effects only to synchronize with external systems.
- Use `useEffectEvent` when an effect needs the latest non-reactive callback or
  value.
- Use `startTransition` for non-urgent updates and `useDeferredValue` when an
  expensive view should lag behind urgent input.
- Do not add `useMemo`, `useCallback`, or `React.memo` by default. Let React
  Compiler handle memoization. Add manual memoization only for a measured case or
  an API that requires stable identity.
- Do not create fake stable references, ref-based callback indirection, empty
  dependency arrays, eslint suppressions, or component boundaries merely to make
  compiler diagnostics disappear.
- Fix the code that violates compiler rules. Do not disable the compiler for the
  component or file unless the user explicitly approves a documented external
  incompatibility.
- Do not define components inside other components.
- Subscribe to the smallest useful Zustand state slice rather than entire stores.

Follow the installed `vercel-react-best-practices` skill when writing or
reviewing React code.

## UI

Use the installed shadcn skill whenever working with shadcn components,
registries, or the preset.

- Use `bunx --bun shadcn@latest` for shadcn commands.
- Check existing and registry components before writing custom UI primitives.
- Prefer shadcn/base-ui components over hand-rolled equivalent components; they
  are customizable by default.
- Use preset `b1wXDkDqCm` and its semantic tokens.
- Use Phosphor icons, as selected by the preset. Do not silently introduce a
  second icon library.
- Use shadcn chat primitives for conversation scrolling, messages, attachments,
  and markers.
- Use semantic color tokens instead of raw Tailwind colors.
- Preserve accessibility requirements of dialogs, sheets, fields, menus, and
  other primitives.
- Keep the UI dark-only unless the product scope changes.

Using shadcn does not require wrapping every element in a Card. Prefer a clear,
dense desktop interface over a generic dashboard appearance.

## State and Boundaries

- Keep Pi session files as the conversation source of truth.
- Store only NativePi-owned UI data in NativePi persistence.
- Use Zustand for renderer state, not as a second backend or Pi domain model.
- Use Zod at renderer/main IPC, Pi RPC, persisted-file, and untrusted extension
  boundaries. Do not validate every internal function call.
- Preserve unknown Pi fields and entries rather than rewriting them.
- Fail conservatively when an externally modified active session could be
  corrupted.

## Tests and Verification

Do not add tests for useless, trivial, or unrealistic behavior. Test important
behavior and realistic failure cases only.

Good test targets include:

- Parsing streamed Pi JSONL across arbitrary chunk boundaries.
- Protecting drafts and pending messages from loss.
- Session parsing and external-write conflict behavior.
- One-run-per-project enforcement.
- Graphical extension compilation and registration.
- Regression tests for bugs that have actually occurred.

Bad test targets include:

- Testing that static text renders.
- Snapshotting every component.
- Testing third-party library behavior.
- One test per getter, setter, branch, or schema field for the sake of counts.
- Mirroring implementation details in mocks.
- Tests whose only value is increasing coverage.

There is no coverage target and no required test-to-code ratio. Do not add a test
merely because production code changed.

After making a change:

1. Run only the narrowest test, check, or command that directly exercises the
   changed behavior.
2. Do not run project-wide tests, type checks, builds, lint commands, quality
   suites, or release checks unless the user explicitly asks.
3. If no focused automated verification exists, ask the user to test the changed
   behavior instead of creating a low-value test or running the whole project.
4. Report exactly what was and was not verified.

## Running the App and Dev Servers

Never start a dev server, `electron-vite dev`, preview server, or any long-lived
app process on your own initiative. The user runs the app themselves.

- Before assuming nothing is running, check. A single NativePi window appears as
  several OS processes (the vite dev server on port 5173 plus multiple
  `electron.exe` helpers), so "I don't see it" is not proof it is stopped. Look
  for a listener on port 5173 and for `electron`/`electron-vite`/`node` processes
  whose command line references `nativepi`.
- If you genuinely need the app running to verify something, first check whether
  an instance is already running and use it, or ask the user to start it. Do not
  launch one yourself without explicit approval in this session.
- A silent startup failure (for example `Port 5173 is already in use`) can leave
  a stale instance serving old state and masquerade as a data bug. When behavior
  looks impossible, suspect a leftover process before suspecting the code.
- Do not leave background processes running after a task. If you were explicitly
  approved to start one, stop it when finished.

## Subagents

Do not overuse subagents. Subagents are an optimization for genuinely independent
work, not a required step and not a measure of task quality.

- Handle focused work directly.
- Use a subagent only when separate work can proceed independently and its result
  will materially save time or context.
- Do not spawn subagents for routine file discovery, one-file edits, simple
  research, or to manufacture agreement.
- Prefer one well-understood implementation over coordinating multiple speculative
  approaches.

## Change Discipline

- Read the relevant code before editing it.
- Keep changes focused on the requested behavior.
- Preserve user changes already present in the worktree.
- Do not add backward-compatibility code without a concrete persisted or external
  compatibility requirement.
- Use existing naming and patterns when they are simple and appropriate.
- Replace a complex existing pattern rather than adding a second path beside it.
- Remove dead code, stale comments, unused exports, and obsolete tests made
  unnecessary by the change.
- Comments should explain non-obvious constraints, not narrate straightforward
  code.
- Do not create documentation for self-evident implementation details.

When a requested feature appears to require substantial infrastructure, first
look for a maintained package or a smaller product behavior that meets the actual
need. If complexity is genuinely unavoidable, explain the concrete constraint
before introducing it.

## Git And Releases

- Use Conventional Commits for every commit, including release commits.
- Before every commit, inspect all package versions and decide whether the change
  requires a SemVer bump. Apply major, minor, and patch bumps according to SemVer;
  never change a version incidentally or leave required package versions stale.
- Every version-bump commit must be followed immediately by a matching `vX.Y.Z`
  Git tag and GitHub release. Do not leave bumped versions untagged or unpublished.
- Commits must have `nonlooped` as their sole author. Never add `Co-authored-by`,
  generated-by, agent attribution, or any other additional author or trailer.
