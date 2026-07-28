# NativePi Agent Instructions

These are the engineering guidelines for NativePi. They are written for coding
agents and apply equally to human contributors. `CONTRIBUTING.md` covers setup
and pull request mechanics.

## Project

NativePi is a small, local, Windows-first desktop interface for the Pi coding
agent. It is a wrapper, not an agent harness.

Read `apps/desktop/PRODUCT.md` before making product-scope decisions and
`apps/desktop/DESIGN.md` before changing the interface's visual language.

The stack is Electron and electron-vite, Bun as the package manager (not the
desktop runtime), React 19.2 with React Compiler, Vite 8, Tailwind CSS 4,
shadcn/ui using preset `b1wXDkDqCm`, Zustand, and Zod 4 at process and
external-data boundaries.

Do not introduce npm, pnpm, or Yarn lockfiles. Electron main and preload run on
Node; spawn Pi with Electron's binary under `ELECTRON_RUN_AS_NODE`. Use Electron
IPC (`ipcMain.handle` plus preload `contextBridge`), not a custom RPC framework.

Prefer functionality over stability when choosing tools, packages, APIs, and
platform features. A young or rapidly evolving technology is acceptable when it
materially improves the product, but choose it for a concrete benefit rather
than novelty.

## Product Boundary

Pi owns the agent loop, providers, models, authentication data, tools, prompts,
skills, extensions, queues, compaction, and sessions. NativePi presents those
capabilities through a desktop UI. When Pi already provides a capability, call
Pi and display its result instead of reimplementing it.

Do not add:

- NativePi-owned AI logic or LLM requests.
- NativePi-owned agent tools.
- Provider-specific implementations when Pi already owns them.
- Support for other agent harnesses.
- Checkpoints, hidden commits, or anything that rewrites Git history.
- A second durable conversation store or parallel Pi domain model.

## Simplicity Is the Primary Engineering Value

Prefer the smallest correct change. A successful change should normally leave
the relevant area simpler than it was before, and the preferred diff has more
deletions than insertions whenever functionality can be retained. Reduce lines
of code, indirection, state, and concepts without moving the complexity
somewhere else.

- Delete obsolete code instead of preserving compatibility without a concrete
  need.
- Keep logic in one function or module until reuse is real.
- Do not extract helpers that only rename a straightforward operation.
- Do not introduce interfaces, factories, managers, services, registries, event
  buses, repositories, adapters, or generic wrappers for a single use case.
- Do not add caching, batching, virtualization, pooling, background workers, or
  persistence layers before a measured problem requires them.
- Do not add architecture merely to satisfy a linter, checker, test-count
  target, or perceived future requirement.
- Do not trade visible complexity for hidden framework complexity.
- Some local duplication is preferable to a premature abstraction.

If two approaches are correct, choose the one with fewer concepts, files,
internal dependencies, and lines of project-owned code.

## Prefer Maintained Packages

Strictly prefer established public packages and platform libraries over
hand-rolling generic, difficult, or maintenance-heavy behavior. Diff rendering
uses `@pierre/diffs` rather than a homegrown diff engine; UI primitives come
from shadcn/ui; markdown, syntax highlighting, file search, and schema
validation are package concerns.

Before hand-rolling a generic feature, search for a focused, actively
maintained, license-compatible package. Use it directly unless a wrapper solves
a concrete project-specific problem. Native Bun, browser, and platform APIs
count as maintained library APIs.

## React and React Compiler

Write idiomatic React that the compiler can analyze. Do not trick, bypass,
suppress, or work around it.

- Keep components and hooks pure during render.
- Never mutate props, state, hook values, or values created outside the current
  render.
- Call hooks unconditionally and only from React components or custom hooks.
- Derive values during render instead of synchronizing derived state in effects.
- Put interaction logic in event handlers rather than effects; use effects only
  to synchronize with external systems.
- Use `useEffectEvent` when an effect needs the latest non-reactive callback or
  value.
- Use `startTransition` for non-urgent updates and `useDeferredValue` when an
  expensive view should lag behind urgent input.
- Do not add `useMemo`, `useCallback`, or `React.memo` by default. Let React
  Compiler handle memoization; add manual memoization only for a measured case
  or an API that requires stable identity.
- Do not create fake stable references, ref-based callback indirection, empty
  dependency arrays, eslint suppressions, or component boundaries merely to
  silence compiler diagnostics. Fix the offending code instead of disabling the
  compiler.
- Do not define components inside other components.
- Subscribe to the smallest useful Zustand state slice rather than whole stores.

## UI

- Use `bunx --bun shadcn@latest` for shadcn commands.
- Check existing and registry components before writing custom UI primitives,
  and prefer shadcn/base-ui components over hand-rolled equivalents.
- Use preset `b1wXDkDqCm` and its semantic tokens rather than raw Tailwind
  colors.
- Use Phosphor icons, as selected by the preset. Do not silently introduce a
  second icon library.
- Use shadcn chat primitives for conversation scrolling, messages, attachments,
  and markers.
- Preserve the accessibility requirements of dialogs, sheets, fields, and menus.
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

Test important behavior and realistic failure cases only. Good targets include
parsing streamed Pi JSONL across arbitrary chunk boundaries, protecting drafts
and pending messages from loss, session parsing and external-write conflicts,
one-run-per-project enforcement, graphical extension compilation, and
regressions for bugs that have actually occurred.

Do not test that static text renders, snapshot every component, test
third-party library behavior, write one test per getter or schema field, mirror
implementation details in mocks, or add tests whose only value is coverage.
There is no coverage target and no required test-to-code ratio.

After a change, run the narrowest check that exercises the changed behavior.
Do not run project-wide tests, builds, or quality suites unless asked. If no
focused automated verification exists, say so rather than inventing a low-value
test. Report exactly what was and was not verified.

## Running the App

Do not start a dev server, `electron-vite dev`, preview server, or any
long-lived app process on your own initiative.

A single NativePi window appears as several OS processes: the Vite dev server on
port 5173 plus multiple `electron.exe` helpers. Not seeing a window is not proof
that nothing is running. A silent startup failure such as `Port 5173 is already
in use` can leave a stale instance serving old state, which looks convincingly
like a data bug. When behavior seems impossible, suspect a leftover process
before suspecting the code. Do not leave background processes running once a
task is finished.

## Subagents

Use a subagent only when separate work can genuinely proceed independently and
its result will materially save time or context. Handle focused work directly.
Do not spawn subagents for routine file discovery, one-file edits, simple
research, or to manufacture agreement.

## Change Discipline

- Read the relevant code before editing it.
- Keep changes focused on the requested behavior, and preserve unrelated changes
  already present in the worktree.
- Do not add backward-compatibility code without a concrete persisted or
  external compatibility requirement.
- Use existing naming and patterns when they are simple and appropriate.
- Replace a complex existing pattern rather than adding a second path beside it.
- Remove dead code, stale comments, unused exports, and obsolete tests made
  unnecessary by the change.
- Comments should explain non-obvious constraints, not narrate straightforward
  code.
- Do not document self-evident implementation details.

When a feature appears to require substantial infrastructure, first look for a
maintained package or a smaller product behavior that meets the actual need. If
complexity is genuinely unavoidable, explain the concrete constraint before
introducing it.

## Git and Releases

- Use Conventional Commits for every commit, including release commits.
- Commit titles only, with no body.
- Do not add `Co-authored-by`, generated-by, agent attribution, or any other
  trailer.
- Feature, fix, docs, and maintenance changes do not bump versions. Leave
  package versions unchanged until an explicit release.
- Version bumps are a separate release step covering all merged work since the
  last tag. Apply one SemVer bump for the batch, highest-impact change wins.
- Every version-bump commit must be followed immediately by a matching `vX.Y.Z`
  tag and GitHub release. Never leave a bumped version untagged or unpublished.
- `packages/extension-api` is versioned independently of the app. Bumping its
  version on `main` publishes it to npm automatically once CI passes, so treat
  that bump as the publish itself.
