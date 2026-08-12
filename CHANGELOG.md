# Changelog

All notable changes to NativePi will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Require explicit project trust before opening a workspace.
- Preserve chat and session state through concurrent writes, cancelled switches, and asynchronous navigation.
- Anchor Git paths at the repository root and honor the selected push remote.
- Serialize package changes and contain Pi process failures without leaving commands busy.
- Retire stale session watchers and bound remote terminal backpressure.
- Bundle and run package-manager tooling through Electron's Node runtime in packaged builds.
- Enable macOS update checks and publish distinct artifacts for every supported architecture.

### Performance
- Stream session history and search parsing.
- Skip offscreen transcript rendering and reuse transcript visibility tracking.

## [1.12.1] - 2026-08-12

### Fixed
- Retry Electron binary downloads in release CI after transient failures.

## [1.12.0] - 2026-08-12

### Added
- Interactive questions through the optional ask-user extension.
- Tool batching through the optional throughput extension.
- Folder mentions in the composer.
- Markdown rendering for user messages.

### Changed
- Redesign the project pane.
- Register the ask-user and throughput extension workspaces.

## [1.11.0] - 2026-08-12

### Changed
- Replace the transcript markdown renderer with richer streaming-friendly rendering.

### Fixed
- Preserve the session write grace period.
- Address desktop interface audit findings and regressions.

### Performance
- Restore chats before loading history and avoid rescanning session history after local turns.
- Reclaim idle chat resources and remove per-chat sidebar subscriptions.
- Suspend and batch hidden terminal output.
- Defer heavy workspace modules, isolate extension event handling, deduplicate Git status scans, and streamline CI publishing.

## [1.10.0] - 2026-08-11

### Added
- Distinguish installed extension packages from local extensions and label local path sources.
- Render skill and file mentions as chips in user messages.
- Show live elapsed time while a turn is running.

### Fixed
- Allow parallel chats within a project.
- Update sidebar sessions without rescanning and persist sidebar width after resizing.

### Changed
- Tighten the default sidebar and context pane widths.
- Simplify pane, composer, list, progress, and modal motion treatments.

## [1.9.0] - 2026-08-11

### Added
- Ten built-in color schemes with settings, import/export, and contrast checks.
- Apply the selected color scheme to the desktop interface and integrated terminals.

### Fixed
- Resolve Pi's entry point from the packaged app path while keeping resolution testable outside Electron.
- Select chats only after their project's session list loads.
- Generate stable chat-search request IDs.
- Avoid a release workflow verification race.

### Changed
- Polish the transcript, composer, sidebar, project list, session rows, and source control interface.

## [1.8.1] - 2026-08-11

### Performance
- Optimize desktop rendering and state-management hot paths.

## [1.8.0] - 2026-08-11

### Changed
- Polish responsive layouts, diff theming, and source control details.

## [1.7.0] - 2026-08-11

### Added
- Cohesive interface motion and collapsible pane transitions.

### Performance
- Cache Git status, extension bundles, compression, and session metadata in the main process.
- Optimize transcript, sidebar, and autocomplete rendering.
- Split renderer bundles for charts, icons, and Zod.

## [1.6.0] - 2026-08-11

### Added
- Detect stale development windows and show a freshness indicator.

### Fixed
- Address desktop interface audit findings.

## [1.5.0] - 2026-08-10

### Added
- Source control with staged groups, commit history, upstream tracking, and Pi-generated Conventional Commit messages.
- Graphical extension conversation views and transcripts.
- Rich subagent conversation history, overview UI, terminal dashboard, and slash commands.
- Extension composer editor slots and dynamic terminal-surface sizing.

### Fixed
- Generate chat titles when prompts are submitted.
- Handle missing extension conversation views and overflowing headers.
- Address source control review findings.

### Documentation
- Document source control and graphical extension conversation views in the product and design guides.

## [1.4.0] - 2026-08-09

### Added
- A Subscriptions settings page with aggregated usage and simplified controls.

### Fixed
- Publish the subagents package with a registry-compatible extension API range.
- Remove an unsupported argument separator that broke subagent invocation.

### Changed
- Remove the redundant usage button from the sidebar footer.

## [1.3.0] - 2026-08-09

### Added
- Promote the usage dashboard to Settings and add token metrics.

## [1.2.0] - 2026-08-09

### Added
- Light mode with an appearance switcher and refined light palette.
- Optional MCP package exposing configured server tools through Pi (`packages/mcp`).
- Optional asynchronous subagents package with model, thinking-level, cancellation, and concurrency controls (`packages/subagents`).
- Vercel Web Analytics for the website.

### Fixed
- Disable auto-update on unsigned macOS builds to prevent visible errors.
- Preserve release tags when CI fetches release refs.

## [1.1.1] - 2026-08-09

### Fixed
- Add missing React types for the `meta` provider package typecheck.

## [1.1.0] - 2026-08-09

### Added
- Meta provider for Muse Spark models (`packages/meta`).

### Fixed
- Isolate draft session events, avoid spawning a draft Pi instance for existing chats, fix mobile download fallback.
- Align Pi peer dependency to `0.84.1` and include `packages/meta` in workspace typecheck.
- Nest service-tier extension menu label within its group.

### Changed
- Bump minor and patch dependencies.
- Remove legacy built-in migration and fallback code.
- Trim useless and tautological tests.

### Documentation
- Expand website documentation and refresh stale extension API / website content.
- Clarify agent guidance not to watch CI unless asked.

## [1.0.0] - 2026-08-08

### Added
- Overhauled public website (new landing, docs structure).
- Redesigned graphical extension API (`feat(extensions)!` — breaking: new extension package layout and API surface).

### Fixed
- Preserve project-scoped file actions when switching projects.

### Documentation
- Clarify extension reference versioning and address website review findings.

## [0.21.0] - 2026-08-08

### Added
- Terminal control panels for extensions.

### Fixed
- Clarify update download state in the desktop UI.

### Documentation
- Refresh product capabilities documentation.

## [0.20.2] - 2026-08-07

### Fixed
- Load `esbuild` after binary setup for extensions.

## [0.20.1] - 2026-08-07

### Fixed
- Launch bundled `esbuild` binary for extension compilation.
- Repair package manifests for release.
- Allow verified manual release retries.

### Changed
- Declare the TypeScript toolchain each package typechecks with.

## [0.20.0] - 2026-08-07

### Added
- Publish native extension packages (`@nativepi/extension-api` workspace, bundled toolchain).

### Fixed
- Report provider auth readiness rather than stored credentials.
- Update Pi to `0.84.1`.

### Changed
- Update Pi to `0.84.1`.

## [0.19.2] - 2026-08-03

### Fixed
- Increase `maxTokens` and `maxRetries` for title generation.

## [0.19.1] - 2026-08-03

### Fixed
- Improve interface contrast.
- Clarify product copy.

### Changed
- Always deploy production changes for the web app.

## [0.19.0] - 2026-08-03

### Added
- Simplify the marketing page.

## [0.18.1] - 2026-08-03

### Fixed
- Correct interface defects found in UI audit.

### Changed
- Update application screenshot and retract unreleased 0.18.1 bump.

## [0.18.0] - 2026-08-02

### Added
- Group chats by calendar date.
- Add native usage tracking and automatic chat titles.

### Changed
- Refine workspace navigation and surfaces.
- Remove stale design metadata artifacts.

## [0.17.0] - 2026-08-02

### Added
- Show subscription usage for connected plans.

### Changed
- Remove the run board.
- Clarify settings controls.

## [0.16.0] - 2026-08-01

### Changed
- Reduce sidebar chat rows to title and time.

## [0.15.0] - 2026-08-01

### Added
- Share the service-tier extension with the Pi TUI.

### Fixed
- Give synthesized write patches a file header.

## [0.14.0] - 2026-08-01

### Added
- Per-chat response speed controls.

### Fixed
- Keep access servers awake.
- Improve sidebar chat discovery and recovery; make startup and trust states less disruptive.

## [0.13.0] - 2026-08-01

### Added
- Usage spending charts.
- Live project file explorer.
- Improved repository changes workflow.

### Changed
- Standardize interface interactions.

### Documentation
- Clarify desktop product boundaries and expert-first sidebar interactions.

## [0.12.3] - 2026-07-31

### Fixed
- Protect Pi settings writes.

### Documentation
- Clarify cross-platform support.

## [0.12.2] - 2026-07-31

### Added
- Session management with distinct provider tracking and improved prompt display.

## [0.12.1] - 2026-07-31

### Fixed
- Use a Linux-safe executable name.

## [0.12.0] - 2026-07-31

### Added
- Usage and cost dashboard.
- Cross-project run board.
- Commit and pull request authoring.
- Configurable keyboard shortcuts.
- Parallel project runs.
- Context window inspector.
- Read-only project file explorer and preview.
- Expanded integrated terminal with named tabs, shell profiles, and links.
- Repository-host PR and issue context in the changes pane.
- macOS and Linux desktop builds with path handling, terminal, and editor integration.

### Fixed
- Synchronize terminal state, secure file previews, harden repository host context and usage dashboard, complete cross-platform release support, route parallel sessions independently, keep context usage inspection safe, harden commit authoring workflow, address run board and shortcut audits.

## [0.11.0] - 2026-07-30

### Added
- Full-text chat search.
- Organize and pin sidebar chats.
- Open projects, chats and files by dropping them.
- Surface extension-registered providers in the model picker.
- Render Pi's terminal extension UI natively (including TUI overlay via dialog portal).
- Remote access controls: account for who a shared link reaches.
- Replace landing page prose with interface vignettes.

### Fixed
- Isolate remote access lifecycle, preserve mixed drop actions, route extension provider auth through Pi.

## [0.10.2] - 2026-07-29

### Fixed
- Scope sidebar chats to their projects; sync and independently expand sidebar chats.
- Verify the originating tunnel is still live before publishing a public link.

### Changed
- Cut public link startup and first load (perf).

## [0.10.1] - 2026-07-29

### Fixed
- Improve toast feedback.

## [0.10.0] - 2026-07-29

### Added
- One-click public links for remote access (replacing Tailscale).

### Fixed
- Bound the tunnel client download and evict an unusable cache.

## [0.9.0] - 2026-07-28

### Added
- In-app updater (update NativePi from inside the app, gated to desktop).
- Marketing site and documentation (initial website).
- Remote access (initial Tailscale-based).

### Fixed
- Gate updater actions to desktop, keep update installation explicit, harden local access network boundaries, validate Tailscale URLs by hostname.

## [0.8.2] - 2026-07-28

### Fixed
- Derive the extension API version from its package manifest (publishing fix).

### Added
- Contributing guide, issue and pull request templates.
- CI now runs tests and publishes the extension API on version bumps.

## [0.8.1] - 2026-07-28

### Fixed
- ModelSelector with no-drag region and typeahead support.
- Generate stable release notes from stable releases.

### Changed
- Prepare repository for public releases.

## [0.8.0] - 2026-07-28

### Added
- Phone and touch input adaptation.
- Token-protected local server access.

### Fixed
- Watch each active session; harden local server access.

## [0.7.0] - 2026-07-27

### Added
- Contextual desktop actions.
- File type icons.

### Fixed
- Clean up generated chat titles; address contextual action review.

## [0.6.0] - 2026-07-27

### Added
- Run Pi slash commands from the composer (`/`).
- Attach images to messages.
- Confirm before quitting with work in flight.
- Enforce a single app instance.
- Overhauled settings screen with Pi-backed preferences.

### Fixed
- Keep slash commands honest about Pi state, keep attachments with their draft, hold quit confirmation for work the marker missed, honour launches while shutting down, serialize Pi settings writes and honor project overrides, protect background agent turns during settings restart.

## [0.5.1] - 2026-07-27

### Fixed
- Harden integrated terminal startup and copy.

## [0.5.0] - 2026-07-27

### Added
- Integrated project terminals (xterm + node-pty, shell profiles).

## [0.4.0] - 2026-07-27

### Added
- Composer completions for skills (`$`) and files (`@`).

### Fixed
- Publish releases after installer build.

## [0.3.0] - 2026-07-26

### Fixed
- Key conversation runtime state per project; update project busy state and session management.

### Added
- Caching for Electron and electron-builder tools in CI; setup action for Bun and Electron.

## [0.2.1] - 2026-07-26

### Fixed
- Code health findings and comment clarity.

### Added
- Quality tools (`fallow`, `react-doctor`).

## [0.2.0] - 2026-07-26

### Added
- Switch branches and create worktrees from the composer/project menu.
- Installer sidebar images and configuration.
- Branded app icons.
- Branch picker with checkout and worktree separation.

### Fixed
- Report unreadable branch lists; handle main window state; slim provider icon bundle.

## [0.1.1] / [0.1.2] - 2026-07-26

### Added
- Branded app icons.

### Changed
- CI release automation (build, tagging, pre-release marking, quality checks).

## [0.1.0] - 2026-07-26

### Added
- Initial NativePi desktop wrapper for the Pi coding agent (Electron + electron-vite + Bun + React 19.2 + Vite 8 + Tailwind CSS 4 + shadcn/ui + Zustand + Zod).
- Project bootstrap, README and logo assets, build and release automation.

[Unreleased]: https://github.com/nonlooped/nativepi/compare/v1.12.1...HEAD
[1.12.1]: https://github.com/nonlooped/nativepi/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/nonlooped/nativepi/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/nonlooped/nativepi/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/nonlooped/nativepi/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/nonlooped/nativepi/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/nonlooped/nativepi/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/nonlooped/nativepi/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/nonlooped/nativepi/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/nonlooped/nativepi/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/nonlooped/nativepi/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/nonlooped/nativepi/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/nonlooped/nativepi/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nonlooped/nativepi/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/nonlooped/nativepi/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/nonlooped/nativepi/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nonlooped/nativepi/compare/v0.21.0...v1.0.0
[0.21.0]: https://github.com/nonlooped/nativepi/compare/v0.20.2...v0.21.0
[0.20.2]: https://github.com/nonlooped/nativepi/compare/v0.20.1...v0.20.2
[0.20.1]: https://github.com/nonlooped/nativepi/compare/v0.20.0...v0.20.1
[0.20.0]: https://github.com/nonlooped/nativepi/compare/v0.19.2...v0.20.0
[0.19.2]: https://github.com/nonlooped/nativepi/compare/v0.19.1...v0.19.2
[0.19.1]: https://github.com/nonlooped/nativepi/compare/v0.19.0...v0.19.1
[0.19.0]: https://github.com/nonlooped/nativepi/compare/v0.18.1...v0.19.0
[0.18.1]: https://github.com/nonlooped/nativepi/compare/v0.18.0...v0.18.1
[0.18.0]: https://github.com/nonlooped/nativepi/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/nonlooped/nativepi/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/nonlooped/nativepi/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/nonlooped/nativepi/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/nonlooped/nativepi/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/nonlooped/nativepi/compare/v0.12.3...v0.13.0
[0.12.3]: https://github.com/nonlooped/nativepi/compare/v0.12.2...v0.12.3
[0.12.2]: https://github.com/nonlooped/nativepi/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/nonlooped/nativepi/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/nonlooped/nativepi/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/nonlooped/nativepi/compare/v0.10.2...v0.11.0
[0.10.2]: https://github.com/nonlooped/nativepi/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/nonlooped/nativepi/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/nonlooped/nativepi/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/nonlooped/nativepi/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/nonlooped/nativepi/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/nonlooped/nativepi/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/nonlooped/nativepi/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/nonlooped/nativepi/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/nonlooped/nativepi/compare/v0.5.0...v0.6.0
[0.5.1]: https://github.com/nonlooped/nativepi/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/nonlooped/nativepi/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/nonlooped/nativepi/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nonlooped/nativepi/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/nonlooped/nativepi/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/nonlooped/nativepi/compare/v0.1.2...v0.2.0
[0.1.1]: https://github.com/nonlooped/nativepi/compare/v0.1.0...v0.1.2
[0.1.0]: https://github.com/nonlooped/nativepi/releases/tag/v0.1.0
