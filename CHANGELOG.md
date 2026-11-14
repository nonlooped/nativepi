# Changelog

All notable changes to NativePi will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Build Chat mode and web access directly into the app; retire their standalone NativePi packages.
- Move Chat/Work shortcuts to Command/Ctrl+Alt+1/2 and interface-scale reset to Command/Ctrl+Alt+0 to reserve the number keys for sidebar threads.
- Prioritize everyday settings above galleries, previews, and reference details; clarify section headings, row spacing, descriptions, and selected controls across Settings.
- Remove the desktop notification status and test row from General settings.
- Extend compact settings styles to subscription limits, usage filters, extension installation, access links, file paths, and Pi restart notices.
- Soften the Settings modal backdrop, frame, selection fills, and control borders to match the workspace.
- Simplify individual settings with quieter rows, compact layout selectors, smaller visual previews, inline status labels, and consistent keyboard and sign-in controls.
- Quiet the transcript work area with compact grouped tool calls, optional thinking and output, subdued Markdown code/table chrome, and collapsed file-change details. Keep work expanded during a run and collapse it on completion; retain tool failures inside their output.
- Use compact headings above full-width provider lists in Settings, with tighter provider rows.
- Redesign Settings with compact navigation, unboxed sections, aligned controls, and combined appearance and layout preferences. Move Chat extension controls to Extensions and load settings pages eagerly, preparing local Pi configuration at startup.

### Added
- Built-in interactive HTML artifacts in Chat and Work, with proactive visualization guidance, screenshot previews, live theme integration, fullscreen expansion, HTML downloads, and snapshots saved in Pi sessions.
- Add individually rebindable sidebar thread shortcuts (Command/Ctrl+1–9 and 0 for thread 10), terminal focus, creation, splitting, navigation, and closing shortcuts, plus source-control opening, refresh, and commit shortcuts. Restore source control beside Files in the context pane.
- Add rebindable shortcuts for focusing the composer, choosing a model, cycling chats in the current project, switching between Chat and Work, and opening a project folder.
- Render files, folders, source locations, skills, web links, pull requests, and chat references as compact transcript chips; expand quoted responses, source-linked replies, terminal selections, and on-demand image, video, and audio previews inline.
- Start Work chats with “No project” for general device tasks, with normal Pi tools and a dedicated working directory.
- Separate Chat and Work destinations. Chat opens without a project, keeps conversations in persistent colored, collapsible folders, and supports creating and moving chats within folders. Deleting a folder confirms permanent deletion of its chats.
- A conversational Pi profile with read-only exploration and diagnostic shell instructions, plus whole-extension opt-ins in Settings → General. Work retains the existing project workflow.
- Keyless Exa web search and page reading in both destinations, with visible rate-limit notices and cooldowns.

### Removed
- Remove the NativePi subagents, subscription usage, and throughput packages and subscription-limit settings. Third-party Pi extensions and local cost/token usage remain supported.

### Documentation
- Trim the README to a short pitch, install and development quick start, and links to the guides; move retired-package upgrade notes to `docs/upgrade.md`. Workspace screenshots remain the isolated-demo captures.

### Fixed
- Open saved chats at the latest user message and the start of its answer, keeping short exchanges together and preventing old jump-to-latest requests from overriding the opening position.
- Exclude skills from `/` composer suggestions; find them through the dedicated `$` prefix.
- Scale sidebar collapse thresholds with the current display’s available width, with navigation and project context available in sheets when the window is narrow.
- Collapse sidebars and the terminal dock when dragged past their minimum size to free workspace space.
- Keep the dithered background visible while a conversation loads, instead of covering it with a solid surface.
- Remove the empty gap above Pi-backed settings panels such as Behavior, label the usage chart's cost axis with round, distinguishable amounts, and explain an empty Focus list in the sidebar.
- Soften whole-line diff emphasis, give long chat titles more room in the header, fade the dithered plate in once drawn, and restore solid panels when the system asks for reduced transparency; ripple frames now redraw only the disturbed region.
- Restore semantic status, syntax, diff, chart, favorite, file, project, and provider colors while keeping NativePi surfaces, controls, and focus accents monochrome.
- Restore the quit-dialog save-order regression test after adding the workspace initialization guard, and match the host modifier key in shortcut tests.
- Prevent development reloads from saving an uninitialized workspace over the project list and chat organization; retire old store listeners and wait for pending saves before reloading state. Report unreadable state instead of silently resetting it.
- Reuse unchanged untracked-file line counts and session summaries, bound partial-staging diff reads, and virtualize diff rows to keep large projects and histories responsive.
- Normalize leftover Automatic service-tier values to Standard and prevent blank selected rows after an update.
- Load providers for new chats after opening a project without trust, and restore service tiers saved by the retired extension.

### Changed
- Reuse extracted project icons in the Work chat chooser, with readable interface-scaled typography, a responsive dialog layout, and a distinct option for general device work.
- Preload composer file and skill suggestions, reuse recent and in-flight prefix lookups, and cache prepared file paths for faster searching. Keep refreshed file results isolated between projects.
- Shorten the idle composer placeholder and include the file (`@`), skill (`$`), and command (`/`) search prefixes.
- Redesign the model picker with a narrow provider icon rail, favorites first, compact model rows, context details on hover, and arrow-key navigation from search. Limit its size on small viewports, reveal the selected model on opening, and present reasoning and speed as matching icon controls. Categories are favorites and individual providers, opening on the current provider.
- Add a theme-colored dithered workspace with layered translucent sidebars and terminals, plus cursor ripples that briefly disturb the background’s fixed dot grid. The scene is strongest on new chats and subdued behind conversations. Settings → Appearance offers three bundled high-resolution landscapes, a custom image, and a plain option; reduced motion keeps the background static.
- Match the Files pane reference with a plain heading, search/collapse/refresh/close toolbar, lighter rows, and colored folder icons from the existing file-icon theme; align heading height, spacing, and controls with the workspace chrome. Search lists matching project paths without expanding the directory tree.
- Consolidate the files pane into one larger Files heading with a tree icon and inline refresh/hide controls; remove repeated project labels and strengthen file rows with more spacing, weight, and clearer icons.
- Soften workspace chrome with fewer header, pane, selected-chat, and tool-card borders, plus a quieter idle composer and terminal toolbar. Use the sidebar project icon in the conversation breadcrumb.
- Deepen NativePi’s dark-mode surfaces toward near-black and dim text and primary controls while preserving subdued contrast and semantic colors.
- Lower the default NativePi theme’s text, border, control, and surface contrast in light and dark modes, with quieter status colors and stronger colors reserved for the system increased-contrast preference.
- Run the full CI checks before code pushes through an automatically installed Git hook.
- Soften the monochrome light theme with subdued gray surfaces, clarify selection, focus, settings, tool activity, and terminal hierarchy, and improve chart labels and series distinction. Preserve grayscale in NativePi while restoring syntax colors in other schemes’ diffs.
- Limit service tiers to Standard and Priority, defaulting new chats and previous Automatic/Flex choices to Standard.
- Place provider-aware service-tier controls beside reasoning in the composer model picker, with saved session choices and speed/cost descriptions; remove the visible reasoning label and shortcut hint.
- Remove reserved macOS traffic-light spacing in fullscreen and restore it when leaving fullscreen.
- Temporarily replace the website with an under-construction notice and redirect documentation links while content and screenshots are refreshed.
- Align control and menu sizes, strengthen page and detail hierarchy, and adapt Settings grids and workspace headers to their pane width. Keep long select labels clear of checkmarks, bound popovers, and correct scaled composer and terminal alignment.
- Use a monochrome NativePi palette across light and dark appearances, with consistent surface, text, border, status, chart, diff, and icon hierarchy.
- Unify desktop typography with a shared type scale, consistent dialog and settings headings, readable transcript tables and inline code, and aligned usage figures.
- Rebuild the file browser and dedicated diff viewer with bounded Git reads, explicit oversized-diff states, refresh, and stage/unstage actions; open files in the preferred external editor.
- Remove the project trust badge from workspace chrome and use panel-outline icons for terminal and right-sidebar controls.
- Simplify the terminal dock to a compact corner toolbar with side-by-side and stacked splits, new-terminal and close controls; repair macOS terminal helper permissions during setup and builds so shells can start.
- Refine the model picker with provider-grouped rows, compact provider filtering, and a reasoning dropdown; add Baseten, Meta, Typesafe, and Qwen individual China provider marks.
- Remove the composer context inspector, use a paperclip to attach images and local file mentions, and add workspace and branch switchers below the composer.
- Keep thread titles on one line, discover local project icons with initial fallbacks, show the current project branch, remove the Focus heading, and consolidate search, filtering, and creation into one sidebar toolbar.
- Give active thread cards a compact title/status line and a project/branch line with a restrained provider mark; keep compact finished threads at the bottom when space allows.
- Increase the compact wordmark and sidebar collapse icon together, preserving equal macOS spacing and vertical alignment.
- Give the macOS traffic lights, sidebar toggle, and wordmark equal spacing.
- Refine workspace chrome with a compact wordmark, consistent sidebar controls, a search-led toolbar, and a project/chat breadcrumb.
- Default the threads sidebar to 304px and persist resized widths in pixels, preventing it from expanding with large windows. Older percentage widths adopt the new default.
- Balance Settings proportions on large displays, use more of the content pane, and unify setting groups with aligned controls, quieter descriptions, and spacing that adapts to the pane width.
- Widen the Settings sidebar and replace its heading with a compact search field that filters pages by name, group, and description.
- Give Settings pages relevant sidebar icons, distinguish category headings with smaller uppercase labels and separators, and replace Back actions with a persistent top-right close button.
- Give Settings more screen space and group focused pages under Interface, Pi, and Application, with direct navigation to keyboard, terminal, general, and about controls.
- Simplify new chats to a heading and composer, guide unconnected users to Providers, reduce Settings to a smaller overlay with fixed navigation, and refine modal spacing and confirmation copy.
- Replace the onboarding panel with a simple project opener, enlarge shared buttons, and default new interface-scale preferences to 110%. Add Command/Ctrl +/− and 0 shortcuts for saved interface scaling.
- Refine popup, pane, hover, and icon motion; add brief feedback for run status, queued messages, attachments, and compact disclosures.
- Bundle Pi 1.5.2 and update maintained direct desktop, website, extension, and build dependencies to their latest stable versions.
- Polish pass: add a focus halo to the composer, key-cap shortcut hints with macOS glyphs, uppercase section labels in the sidebar, a cleaner search and project-picker input without the boxed focus ring, a full-width "Worked for" divider, label-style table and code-block headers, a hairline ring on your message bubbles, a jump-to-latest arrow pill, a richer welcome state, and a short staggered entrance for the welcome and new-chat screens that follows the reduced-motion setting.

### Fixed
- Keep the collapsed-sidebar toggle and NativePi wordmark aligned and sized consistently with the expanded sidebar, including macOS traffic-light alignment at different interface scales.
- Ignore clicks on the current sidebar thread instead of reloading its conversation and resetting its controls.
- Prevent the new-thread screen from flashing while switching between existing threads or loading another project's conversation.
- Keep per-thread Pi hosts in the background on macOS instead of showing separate `nativepi-pi-host` Dock apps.
- Align the macOS sidebar wordmark and collapse button with the native traffic lights, including at different interface scales.
- Show the NativePi wordmark only once across the sidebar and empty workspace headers.
- Apply motion preferences consistently to chart tooltips, terminal cursors, download progress, and extension working indicators.
- Avoid unnecessary desktop nightlies for website-only changes.
- Package releases from the exact validated commit and stop packaging when required checks fail or are canceled.
- Keep older session reads from overriding newer chat selection or turn state, save restored drafts and extension editor changes across chat switches, and save drafts before confirmed quit or update installation.
- Keep image preparation and retries attached to the right chat when creating or switching conversations.
- Preserve Pi settings edits and restart notices across overlapping saves, Settings navigation, and failed restarts.
- Keep model and reasoning controls aligned with Pi across chat navigation, retries, and failed restarts without clearing unrelated errors.
- Clear acknowledged send indicators during session refresh and prevent stopped sessions from restoring stale extension UI.
- Refresh file listings and Git diffs after changes, handle selected Git filenames literally, and recover controls after failed Git actions.
- Keep terminal attachments scoped to each connected client, preserve newer exit state after late startup or restart replies, and reconcile partially successful shell closures.
- Support provider login and terminal attachments over HTTP Local Access, and prevent canceled login attempts from restarting chats.
- Distinguish Pi's own session writes from outside edits, keep watching reloaded chats, and block stale edits until the chat is reloaded.
- Cancel stale access startup, keep newer link actions from being overwritten by status reads, contain malformed client frames, and reconnect slow browser clients instead of silently dropping events.
- Stop retrying permanently failed terminal-extension output pipes while retaining bounded recovery from temporary pressure.
- Validate subscription usage against its extension contract, report malformed replies, and keep valid quota readings visible when pacing is unavailable.
- Preserve working MCP tools after failed reconfiguration, reuse tool names when servers return, and prevent disposed subagents from overwriting current state.
- Retry unpublished extension versions after later successful main CI and validate publication eligibility before checking out package code.

## [1.17.0] - 2026-10-28

### Fixed
- Keep the selected thinking level when sending immediately after changing the control.
- Keep background chat thinking-level events from overwriting the active chat selection.
- Start Pi directly in a resumed conversation instead of loading a temporary session before switching to it.
- Reduce conversation stutter by throttling and deferring live rich-text rendering.

## [1.16.0] - 2026-10-25

### Fixed
- Apply the model pick to the same Pi process before sending, preventing an immediate Kiro selection from consuming the previous Codex account.

## [1.15.0] - 2026-10-10

### Added
- Choose Stable or Nightly updates in System settings, with automatic downloads and installation when the app quits on Windows and Linux, and manual downloads for unsigned macOS builds.
- Publish eligible nightlies after main passes CI and check daily for a stable release from the Unreleased changelog.
- Revert unstaged tracked-file changes and remove projects through the project controls.

### Changed
- Bundle Pi 1.1.0 and update the desktop, website, and extension dependencies.
- Refresh the marketing website, README, and guides for the current desktop and extension workflows.
- Refine workspace controls, source control review, and extension integrations.

### Fixed
- Open the project actions menu without a Base UI crash.
- Render Mermaid labels and local transcript images while keeping image access inside the project.
- Preserve update feeds for every supported platform and architecture.
- Build the terminal addon reliably for Linux releases with Bun's isolated dependencies.
- Publish Linux installers using the architecture filenames produced by the packager.

## [1.14.0] - 2026-08-14

### Added
- Use native macOS traffic lights and show a last-resort recovery screen when the renderer fails.

### Changed
- Move model, reasoning, context, branch, and queue controls onto focused composer surfaces.
- Reorganize Settings into task-oriented categories and simplify rarely used controls.
- Follow the open chat's folder, compact chat actions, and remove redundant session statistics.
- Use Local Access for browser testing and simplify project scripts, checks, builds, and packaging.
- Publish the ask-user and throughput extensions through the trusted-publisher package workflow.

### Fixed
- Adapt the workspace and navigation for phone and tablet widths.
- Polish workspace chrome and interaction details after design review.

## [1.13.0] - 2026-08-13

### Added
- Organize chats into focus and finished groups.
- Export a diagnostics archive from Settings.
- Showcase current desktop capabilities on the website.

### Changed
- Make New chat the primary sidebar action and start finished chats collapsed.

### Fixed
- Require explicit project trust before opening a workspace.
- Preserve chat and session state through concurrent writes, cancelled switches, and asynchronous navigation.
- Anchor Git paths at the repository root and honor the selected push remote.
- Serialize package changes and contain Pi process failures without leaving commands busy.
- Retire stale session watchers and bound remote terminal backpressure.
- Bundle and run package-manager tooling through Electron's Node runtime in packaged builds.
- Enable macOS update checks and publish distinct artifacts for every supported architecture.
- Address desktop interface audit findings.

### Performance
- Stream session history and search parsing.
- Skip offscreen transcript rendering and reuse transcript visibility tracking.

### Documentation
- Refresh product, design, website, contributor, package, and release documentation to match the current app.

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

[Unreleased]: https://github.com/nonlooped/nativepi/compare/v1.17.0...HEAD
[1.17.0]: https://github.com/nonlooped/nativepi/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/nonlooped/nativepi/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/nonlooped/nativepi/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/nonlooped/nativepi/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/nonlooped/nativepi/compare/v1.12.1...v1.13.0
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
