<p align="center">
  <img src="./docs/assets/nativepi-wordmark.svg" alt="NativePi" width="270">
</p>

<p align="center">
  <strong>Pi, at home on your desktop.</strong><br>
  A free, open-source Windows desktop interface for the <a href="https://pi.dev/">Pi coding agent</a>.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Platform: Windows" src="https://img.shields.io/badge/platform-Windows-0078D4.svg">
  <img alt="Status: pre-alpha" src="https://img.shields.io/badge/status-pre--alpha-orange.svg">
  <img alt="Built with Electron + React" src="https://img.shields.io/badge/built%20with-Electron%20%2B%20React%2019-47848F.svg">
</p>

<p align="center">
  <a href="#why-nativepi">Why NativePi</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#architecture">Architecture</a>
</p>

---

![NativePi showing a project, Pi conversation, and model controls](./docs/assets/nativepi-home.png)

NativePi brings projects, conversations, model controls, tool activity, diffs,
authentication, and extensions into one focused workspace, without replacing
the agent that makes Pi powerful.

> [!IMPORTANT]
> NativePi is **pre-alpha software**. Releases may be incomplete, unstable, or
> incompatible between versions. Keep backups and expect rough edges.

## Why NativePi

Most agent frontends replace the agent they wrap: their own loop, their own
storage, their own login. NativePi takes the opposite approach.

- **It's all in on extensions.** NativePi extends Pi's extension API into a
  graphical one, so the app itself is hackable. You shape NativePi the same way
  you already shape Pi.
- **Pi stays in charge.** Pi owns the agent loop, providers, auth, tools,
  extensions, and sessions. NativePi calls Pi and renders what Pi returns, so
  Pi improvements land automatically.
- **Nothing is locked in.** Sessions and credentials live in Pi's normal
  storage, fully interchangeable with the Pi CLI. Drop NativePi anytime and
  lose nothing.
- **Everything runs on your machine.** No account, no cloud store, no
  telemetry, no NativePi servers.
- **Free and open source.** MIT licensed, from the app down to the extension
  contract.

## Features

| | |
|---|---|
| **Projects and chats, close at hand** | Open local folders, resume Pi sessions, and keep the active conversation in view. |
| **Watch the work, not a spinner** | Follow streamed responses, thinking, tool calls, errors, and file changes as they happen. |
| **Stay in control mid-run** | Send, steer, queue a follow-up, or stop the agent from the same workspace. |
| **The right model for the moment** | Use Pi's providers, models, and thinking levels without rebuilding your configuration. |
| **Review code in context** | Inspect read-only Git status and rich diffs alongside the transcript. |
| **Manage extensions visually** | Pi extensions can opt into richer desktop presentation through the graphical extension API. |

## Getting Started

NativePi is Windows-first. You need [Bun](https://bun.sh/) and Git installed.

```sh
git clone https://github.com/nonlooped/nativepi.git
cd nativepi
bun install
bun run dev
```

The desktop application lives in `apps/desktop`; the public graphical extension
contract lives in `packages/extension-api`.

### Test and build

```sh
cd apps/desktop && bun test   # run the test suite
cd ../.. && bun run build     # build the app
bun run pack                  # package without installer
bun run dist:win              # build the Windows installer
```

> [!NOTE]
> Windows installers are currently unsigned, so Windows SmartScreen will warn on
> first launch.

## Architecture

Electron, electron-vite, React 19 with React Compiler, Tailwind CSS 4,
shadcn/ui, Zustand, and Zod. Bun manages the workspace.

```text
┌─────────────────────────────┐
│       React renderer        │
└──────────────┬──────────────┘
               │  Electron IPC
┌──────────────▼──────────────┐
│    Electron main process    │
└──────────────┬──────────────┘
               │  Pi JSON RPC over stdin/stdout
┌──────────────▼──────────────┐
│      Bundled Pi process     │
└─────────────────────────────┘
```

A pinned `@earendil-works/pi-coding-agent` is bundled with the app and started
in RPC mode via `ELECTRON_RUN_AS_NODE`. The renderer talks to the host through
Electron IPC and a constrained `contextBridge`; there is no local HTTP or
WebSocket server.

### Extensions

Normal Pi extensions run inside Pi, unchanged. To reach the desktop surface,
an extension imports `@nativepi/extension-api` and adds a `nativepi.renderer`
entry to its manifest. The API is pre-alpha and may change before its first
stable release.

## License

NativePi is available under the [MIT License](./LICENSE). The bundled Departure
Mono wordmark font is by Helena Zhang and is distributed under the SIL Open Font
License; its license is included beside the font asset.

---

<p align="center">
  Made for people who already shape Pi around their workflow.
</p>
