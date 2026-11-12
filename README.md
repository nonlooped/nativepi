<p align="center">
  <img src="./docs/assets/nativepi-wordmark.svg" alt="NativePi" width="270">
</p>

<p align="center">
  <strong>Your Pi workflow. A desktop workspace.</strong><br>
  Free and open source for Windows, macOS, and Linux.
</p>

<p align="center">
  <a href="https://github.com/nonlooped/nativepi/releases/latest">Download NativePi</a> ·
  <a href="./CHANGELOG.md">Changelog</a> ·
  <a href="./CONTRIBUTING.md">Contribute</a>
</p>

NativePi brings the [Pi coding agent](https://pi.dev/) to your desktop. Keep
conversations, project files, code changes, and terminals in one workspace,
with your existing Pi models, credentials, configuration, and extensions.
Pi is included; no separate Pi installation or NativePi account is required.

![NativePi demo workspace with project threads, a sample conversation, the file explorer, and checkout and branch menus](./docs/assets/nativepi-home.png)

*Captured at 2560 × 1600 through Local Access from an isolated demo profile
using the current app, sample conversations, and a disposable project.*

> This README describes the current development checkout, including unreleased
> work. Published Stable and Nightly builds may differ. See
> [Unreleased](./CHANGELOG.md#unreleased) for changes since the last release.
> The website and hosted guides are being refreshed.

## Get started

1. [Download a release](https://github.com/nonlooped/nativepi/releases/latest)
   for Windows, macOS, or Linux.
2. Open a local project folder, or drop one onto the window.
3. Connect a model provider in **Settings → Providers** if you have not already
   configured Pi. Existing Pi credentials are shared with the command line.
4. Start a chat, choose a model and reasoning level, and send your prompt.

Installers are currently unsigned, and macOS builds are not notarized, so
Windows SmartScreen and macOS Gatekeeper may show warnings.

Choose Stable or Nightly under **Settings → About → Updates**. Windows and
Linux download updates automatically and install them when the app quits;
unsigned macOS builds offer manual downloads.

## A workspace for daily project work

- **Keep threads organized.** Search titles and messages, filter by project,
  pin conversations, and move completed work to Finished. Compact thread cards
  show project icons, branches, and run status. Multiple chats can run at once,
  including chats in different projects.
- **Work directly with Pi sessions.** Resume, rename, clone, fork, import,
  export to HTML, navigate conversation branches, or compact a session.
  Conversations open from Pi's files, and text drafts survive chat switches.
- **Direct the run.** Follow streamed responses, thinking, and tool activity;
  steer an active turn, queue follow-ups, or stop it. The composer groups models
  by provider and keeps reasoning controls alongside model selection.
- **Bring in context.** Attach images by picker, paste, or drag and drop. Use
  the paperclip or `@` mentions for local files and folders, and invoke Pi's
  extension commands, prompt templates, and skills with `/`.
- **Read rich results.** Conversations support highlighted code, tables, task
  lists, math, Mermaid diagrams, and local project images. File links open in
  your preferred editor.

The refreshed interface uses a monochrome default palette, a compact sidebar,
a project/chat breadcrumb, and checkout and branch controls below the composer.
Pane widths are resizable, and narrower windows adapt the navigation and
context panels to leave room for the conversation.

## Files, changes, and terminals

Browse the project tree with Git status indicators, mention a file in chat,
copy its path, or open it in your editor. The dedicated diff viewer separates
working-tree and staged changes, supports refresh and staging actions, and
reports when a diff is too large to preview.

Source control includes file and hunk staging, unstaging, confirmed reversion
of unstaged tracked-file changes, inline commits, push, fast-forward sync, and
a local/remote commit graph. Switch or create branches from a clean worktree,
or create a worktree as another NativePi project. GitHub pull requests use
`gh`; GitHub and GitLab review context uses your authenticated `gh` or `glab`.

Project terminals support selectable shells, side-by-side or stacked splits,
and links to your browser or editor. Shells stay alive when hidden or when you
switch projects. Closing the app warns about active runs, terminals, and
connected browsers.

## Make it yours

![Theme and motion settings in the isolated NativePi demo](./docs/assets/nativepi-settings.png)

Settings has searchable pages grouped under **Interface**, **Pi**, and
**Application**:

- **Theme & motion:** light, dark, or system appearance; ten built-in color
  schemes; custom semantic colors with JSON import/export; motion preferences.
- **Layout & diffs:** interface scale, conversation width, and diff preferences.
  New scale preferences default to 110%; Command/Ctrl +/− adjusts the scale and
  Command/Ctrl 0 restores the default.
- **Keyboard:** rebind workspace shortcuts by pressing the desired keys.
- **Providers, Behavior, and Extensions:** manage Pi connections, relevant
  agent settings, and user- or project-scoped packages.
- **Usage:** local token and cost estimates from Pi session files, plus
  subscription limits for supported connected providers.
- **General, Terminal, Access, and About:** startup and notifications, shell
  preferences, browser access, updates, local file locations, and diagnostics.

## Pi extensions, in the window and terminal

Normal Pi extensions run through Pi. NativePi displays their dialogs,
notifications, widgets, and custom terminal components, and offers their
commands and autocomplete in the composer.

Extensions can also provide graphical tool results, composer controls,
conversation views, settings, and context panels through
[`@nativepi/extension-api`](./packages/extension-api/README.md). These are
optional UI contributions; agent capabilities remain Pi extensions usable
from the CLI as well. Extensions are trusted code, not sandboxed plugins.

New chats receive an automatic title after their first successful response.
NativePi also ships the `ask_user` tool, with choices and free-text answers,
and a `/speed` command for provider service tiers. These run through Pi's
APIs and session log; no optional package is needed.

Pi now supplies MCP connections and the Meta provider directly. Configure
MCP with `pi mcp` or `mcp.json` and inspect it with `/mcp`. Meta uses
`META_API_KEY` or Pi's Meta sign-in.

The remaining optional packages provide
[subagents](./packages/subagents/README.md),
[tool batching guidance and statistics](./packages/throughput/README.md), and
[subscription usage](./packages/subscription-usage/README.md).
See each package's README for installation and configuration.

### Upgrading from the retired packages

Existing npm installations of the retired packages are ignored inside NativePi
to prevent duplicate tools, requests, and providers. Pi CLI configuration is
left unchanged. Remove `@nativepi/mcp`, `@nativepi/meta`, `@nativepi/title-generator`,
`@nativepi/ask-user`, and `@nativepi/service-tier` with `pi remove npm:<name>`
(add `--local` for project installations). Reload or restart existing chats.
Remove any `-builtin:mcp` exclusion from Pi settings so Pi can connect servers.
Existing `mcp.json` files and session names are preserved. Change
`MODEL_API_KEY` to `META_API_KEY` for Meta API-key authentication. Existing
Standard/Fast session choices are read as Standard/Priority; the old title
model picker is replaced by using the chat's current model.

Use `/speed` to choose a tier for the current chat, or `/speed auto` to restore
the provider default. OpenAI Responses offers Standard, Priority, and Flex;
Codex offers Standard and Priority; Anthropic offers Automatic and Standard
only. Model and account eligibility are enforced by the provider. A saved
choice is ignored on unsupported providers. Priority can increase costs or
subscription usage; Flex can be slower or temporarily unavailable.

## Open the workspace in a browser

Start **Local access** in **Settings → Access** to use the same projects,
conversations, changes, and terminals from another device. You can also create
an optional temporary public link through a Cloudflare quick tunnel.

Access links are protected by a token and require the desktop app to remain
open. Settings shows connected devices and lets you replace the token or
revoke access. This is access to the running local workspace, not cloud sync
or remote project hosting.

## Built around Pi

Pi owns the agent loop, models, authentication, tools, configuration,
extensions, and sessions. Its session files remain the conversation source
of truth and work with the Pi CLI. NativePi stores its own interface
preferences and workspace state, and detects conflicting external session
writes before allowing stale edits.

NativePi is local-first, has no product accounts or NativePi-owned telemetry,
and sends agent work through the model providers you configure in Pi. Usage
figures are local estimates, not provider invoices.

## Develop and contribute

For the current checkout, install dependencies with Bun and start the desktop:

```sh
bun install
bun run dev
```

See [Contributing](./CONTRIBUTING.md) for prerequisites, focused checks, and
project conventions. The desktop lives in `apps/desktop`, the website in
`apps/web`, and the extension packages in `packages`.

[Product scope](./apps/desktop/PRODUCT.md) ·
[Release process](./docs/release.md) ·
[Security policy](./SECURITY.md) ·
[MIT License](./LICENSE)
