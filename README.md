# NativePi

**Pi, at home on your desktop.**

NativePi is a free, open-source Windows desktop interface for the
[Pi coding agent](https://pi.dev/). It brings projects, conversations, model
controls, tool activity, diffs, authentication, and extensions into one focused
workspace without replacing the agent that makes Pi powerful.

> [!IMPORTANT]
> NativePi is **pre-alpha software**. Core workflows are taking shape, but
> releases may be incomplete, unstable, or incompatible between versions. It is
> not yet recommended for critical work without a backup and comfort debugging
> early-stage software.

## The Pi You Know, With A Native Place To Work

Pi is intentionally minimal and deeply adaptable. NativePi keeps that philosophy
intact while giving it a visual home: projects and chats stay close at hand,
agent work remains visible as it happens, and the files changed by a run are
available for review without leaving the conversation.

NativePi is not another agent harness and does not hide Pi behind a parallel
system. Pi still owns the agent loop, providers, models, authentication, tools,
extensions, prompts, skills, compaction, queues, and sessions. NativePi calls Pi,
renders what Pi returns, and keeps the desktop experience out of the agent's way.

## Built For Flow

- **Move between projects and chats quickly.** Open local folders, resume Pi
  sessions, and keep the active conversation in view.
- **Watch the work, not a spinner.** Follow streamed responses, thinking, tool
  calls, errors, and file changes as they happen.
- **Stay in control mid-run.** Send, steer, queue a follow-up, or stop the agent
  from the same workspace.
- **Choose the right model for the moment.** Use Pi's providers, models, and
  thinking levels without rebuilding your configuration.
- **Review code where the conversation happened.** Inspect read-only Git status
  and rich diffs alongside the transcript.
- **Keep your Pi setup yours.** Existing credentials, sessions, packages,
  extensions, skills, and prompts remain in Pi's normal storage and continue to
  work with the Pi CLI.
- **Work locally.** NativePi has no product account, cloud conversation store,
  collaboration service, or telemetry.

## A Desktop Wrapper, Not A Walled Garden

NativePi is designed for people who already shape Pi around their workflow and
for developers who want that power without living in a terminal. Normal Pi
extensions continue to run inside Pi. Extensions can also opt into controlled
NativePi surfaces for richer desktop presentation without replacing the core
composer, transcript, or navigation.

Sessions remain Pi sessions. Credentials remain Pi credentials. If NativePi
disappeared tomorrow, your agent history and configuration would still belong to
the Pi ecosystem rather than a second proprietary store.

## Pre-Alpha Roadmap

The current codebase already covers much of the daily workspace: local projects,
session discovery, conversations, streaming, tool results, model controls,
provider authentication, read-only Git context, and extension management.

Before the first stable release, the project still needs sustained real-world
testing, stronger recovery around concurrent session changes and process
failures, polished diagnostics, a complete update flow, and clean-machine
installer validation. See [PLAN.md](./PLAN.md) for the product boundary, release
criteria, and implementation phases.

## Develop NativePi

NativePi is Windows-first. You need [Bun](https://bun.sh/) and Git available on
your machine.

```sh
bun install
bun run dev
```

The desktop application lives in `apps/desktop`; the public graphical extension
contract lives in `packages/extension-api`.

## Test And Build

```sh
cd apps/desktop && bun test
cd ../.. && bun run build
bun run pack
bun run dist:win
```

Windows installers are currently unsigned, so Windows SmartScreen will warn on
first launch.

## Technical Shape

NativePi uses Electron, electron-vite, React 19 with React Compiler, Tailwind CSS
4, shadcn/ui, Zustand, and Zod. Bun manages the workspace, but Electron's Node
runtime runs the main and preload processes.

A pinned `@earendil-works/pi-coding-agent` dependency is bundled with the app and
started in RPC mode through Electron's binary using `ELECTRON_RUN_AS_NODE`. The
renderer communicates with the host through Electron IPC and a constrained
`contextBridge`; it does not run a local HTTP or WebSocket server.

```text
React renderer
    | Electron IPC
Electron main process
    | Pi JSON RPC over stdin/stdout
Bundled Pi process
```

The NativePi graphical extension API is imported as
`@nativepi/extension-api`. Extension manifests opt in with a `nativepi.renderer`
entry. This API is also pre-alpha and may change before its first stable release.

## License

NativePi is available under the [MIT License](./LICENSE). The bundled Departure
Mono wordmark font is by Helena Zhang and is distributed under the SIL Open Font
License; its license is included beside the font asset.
