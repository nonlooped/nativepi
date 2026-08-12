# NativePi Agent Instructions

These are the engineering guidelines for NativePi. They are written for coding
agents and apply equally to human contributors. `CONTRIBUTING.md` covers setup
and pull request mechanics.

## Project

NativePi is a small, local desktop interface for the Pi coding agent, for
Windows, macOS, and Linux. It is a wrapper, not an agent harness.

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
- Agent capabilities added inside NativePi itself that Pi does not have, such as
  built-in subagents, MCP support, or per-tool permission rules.

Optional Pi extension packages may provide additional agent capabilities. They
must remain ordinary, separately installable Pi packages so Pi owns their tools,
execution, configuration, and sessions in both the CLI and NativePi.

The line is the agent, not the app. NativePi may add features Pi does not have,
so long as they do not change what reaches the model or how turns are sequenced.
Integrated terminals, browser and remote access, drag and drop, and the
self-updater are all NativePi functionality Pi lacks, and none of them cross the
boundary. The invariant is that the same prompt, under the same Pi configuration,
produces similar results in Pi's terminal interface and in this window.

Apply that test rather than asking whether Pi has a UI for something. Deciding
when an ordinary turn starts is fine: a schedule, a file watcher, or launching
several ordinary sessions at once all leave the turn itself untouched. Deciding
anything inside a run is not: refusing a tool call, editing what sits in context,
sequencing work between runs, or answering on the user's behalf a question the
terminal would have put to them.

Configuration is Pi's, and it may legitimately change output. The model picker,
thinking levels, enabled skills, and a containerization extension all change what
a run produces, and each is acceptable because Pi owns the mechanism and the
command line can reach the same state. A NativePi-side setting Pi never learns
about is not.

Pi is started from `main/pi/host/entry.ts`, not from Pi's `rpc-entry`. That entry
is Pi's own `main(["--mode", "rpc"])` with one interception: `bindExtensions` is
wrapped so the extension UI context gains the terminal half Pi's RPC mode stubs
out, which is what makes `ctx.ui.custom()`, component widgets, footers and headers
appear in the window. RPC mode itself is untouched and stays Pi's to maintain.

That interception, and the pi-tui components it renders, are the one place
NativePi depends on Pi surfaces the RPC protocol does not cover. Keep
`@earendil-works/pi-tui` pinned to the exact `pi-coding-agent` version, and treat
a Pi upgrade as needing a check that extension surfaces still draw.

One component instance serves every connected client, so a surface has one size:
the last client to report its width decides the layout for all of them. That is
the same trade the integrated terminal already makes, and it is the price of the
component running once in the Pi process rather than once per viewer. A project
left in the background keeps its surfaces alive; returning to it sends
`nativepi_tui_sync`, which is what makes the host say its `open`, `state` and
`triggers` frames again to a window that dropped them.

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
- Support the existing light, dark, and system appearances. Use semantic tokens
  so every built-in and custom color scheme works in both appearances.

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

Do not wait for, watch, or poll CI / GitHub Actions runs (`gh run watch`,
`gh run view --log`, Vercel deployments, etc.) unless the user explicitly
asks. Push and report the commit; let CI run in the background.

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
