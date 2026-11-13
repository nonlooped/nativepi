<p align="center">
  <img src="./docs/assets/nativepi-wordmark.svg" alt="NativePi" width="270">
</p>

<p align="center">
  <strong>A desktop workspace for the Pi coding agent.</strong><br>
  Free and open source for Windows, macOS, and Linux.
</p>

<p align="center">
  <a href="https://github.com/nonlooped/nativepi/releases/latest">Download</a> ·
  <a href="./CHANGELOG.md">Changelog</a> ·
  <a href="./CONTRIBUTING.md">Contribute</a>
</p>

NativePi is a native desktop app for the [Pi coding agent](https://pi.dev/).
It keeps conversations, project files, diffs, and terminals in one window, and
uses your existing Pi models, credentials, configuration, and extensions. Pi is
included; no separate Pi installation or NativePi account is required.

![NativePi workspace with project threads, a conversation, the file explorer, and checkout and branch menus](./docs/assets/nativepi-home.png)

## Install

[Download a release](https://github.com/nonlooped/nativepi/releases/latest) for
Windows, macOS, or Linux. Open a local project folder, or drop one onto the
window. Connect a model provider in **Settings → Providers** if you have not
already configured Pi, then start a chat.

Installers are unsigned, and macOS builds are not notarized, so Windows
SmartScreen and macOS Gatekeeper may show warnings. Choose Stable or Nightly in
**Settings → About**. Windows and Linux install updates when the app quits;
unsigned macOS builds offer a manual download.

## Features

- Organize, search, and pin project chats, and run more than one at a time
- Steer, queue, or stop a run; attach images and `@` mention local files
- Browse the project tree, review diffs, and stage, commit, or branch
- Project terminals that stay alive when hidden or when you switch projects
- Themes, custom colors, and rebindable shortcuts
- Optional browser access to the running workspace, on your network or through a temporary public link

NativePi is local-first. It has no product accounts or NativePi-owned telemetry,
and agent work goes only to the providers you configure in Pi.

## Develop

You need [Bun](https://bun.sh/) and Git.

```sh
git clone https://github.com/nonlooped/nativepi.git
cd nativepi
bun install
bun run dev
```

See [Contributing](./CONTRIBUTING.md) for prerequisites and checks. The desktop
app lives in `apps/desktop`, the website in `apps/web`, and extension packages
in `packages`.

## Docs

- [Contributing](./CONTRIBUTING.md)
- [Product scope](./apps/desktop/PRODUCT.md)
- [Release process](./docs/release.md)
- [Upgrading from retired packages](./docs/upgrade.md)
- [Security policy](./SECURITY.md)
- [Changelog](./CHANGELOG.md)
- [MIT License](./LICENSE)
