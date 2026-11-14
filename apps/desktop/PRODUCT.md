# Product

## Platform

Windows, macOS, and Linux desktop (Electron)

## Users

NativePi serves two primary groups equally:

- Existing Pi users who want a polished desktop workflow without losing Pi's capabilities, sessions, configuration, or extensions.
- Developers who prefer a graphical coding-agent experience and do not want terminal knowledge to be a prerequisite.

Both groups use NativePi for local project work and general work on their devices. Basic workflows must remain approachable, while advanced Pi capabilities are available through progressive disclosure.

NativePi is optimized for its primary desktop workflow and expert users. Accessibility is not a product goal, differentiator, or release criterion, and it does not justify adding redundant controls or alternate interaction paths that compromise the intended interface.

## Product Purpose

NativePi is a free, open-source desktop interface for the Pi coding agent. It gives Pi a focused graphical workflow for projects, conversations, model controls, tool results, diffs, authentication, settings, and extensions.

Success means NativePi is useful as the daily desktop interface for Pi project work: users can open a local project, authenticate, start or resume conversations, direct agent runs, inspect results, and manage relevant Pi capabilities without needing Pi's terminal UI.

## Positioning

NativePi is a Pi-based desktop coding-agent interface. Pi supplies model execution, providers, authentication, configuration, tool execution, queues, compaction, and sessions. NativePi adds built-in tools, instructions, and graphical workflows through Pi APIs. Useful app capabilities do not need separately installable extensions or matching Pi CLI behavior. Third-party Pi extensions remain supported.

## Chat and Work

NativePi offers two independent destinations. Work supports project folders and general work without a project. Project-free Work chats use a dedicated NativePi-managed working directory with normal Pi tools, configuration, and extensions. The managed directory is not a pinned project; its ordinary Pi sessions appear alongside project chats and can be filtered with “No project”. Chat starts without a project picker, using an internal working directory only because Pi requires one. Its transcripts remain ordinary Pi session files. Existing project conversations stay in Work; conversations cannot be transferred between destinations.

Chat folders are NativePi-owned organization metadata, with unique colors and persistent collapsed state. Chats appear inside their folders, and unfiled chats appear outside them. Moving a chat changes only its folder membership. Deleting a folder permanently deletes its chats after explicit confirmation; failed deletions retain the folder and remaining memberships.

The built-in Chat profile disables built-in edit/write tools, enables read-only exploration, and supplies conversational instructions. The shell remains available for diagnostics and information gathering; instructions against changes are behavioral guidance, not a sandbox. Automatic extension discovery, skills, templates, and context-file discovery are disabled in Chat. Settings → Extensions can explicitly enable whole user extensions, including their full tools. The profile still instructs Pi to avoid work tasks. Settings changes affect newly started Pi processes; restart Pi to update existing processes.

Built-in web access supplies Exa-backed web search and page reading in both destinations. Requests go directly from the user's machine to Exa's hosted MCP endpoint. No search account, API key, payment, or NativePi server is required. Exa's anonymous service is rate-limited and externally operated: NativePi honors retry timing, suppresses immediate retries during a cooldown, and reports unavailability without interrupting ordinary chat.

## Operating Context

- NativePi is a Windows, macOS, or Linux desktop application used alongside local code projects, Git repositories, and the existing Pi CLI ecosystem. Its workspace can be shared temporarily to a browser on the local network or through a temporary public link.
- Users pin project folders; create, discover, import, and manage Pi sessions; inspect streamed messages and tool activity; and review Git state and diffs.
- Existing Pi credentials, configuration, sessions, packages, skills, prompts, and extensions remain in Pi's normal storage and remain usable by the Pi CLI.
- NativePi keeps one Pi process per active chat, so chats in the same project and different projects may run concurrently. Git, terminals, trust, and Pi follow the folder of the open chat; the sidebar project filter only changes which chats are listed.
- Starting a new Work chat always offers a project chooser with “No project”, pinned folders, and an option to open another folder.
- Conversations open directly from Pi session files without waiting for a Pi process to start. Drafts remain editable and are restored if a cold send fails.
- Narrow windows move the context pane into a sheet. On a phone, project navigation moves there too so the conversation and composer remain usable.

## Current Capabilities

- Optional next-message suggestions after successful turns, generated through Pi’s authenticated current model without changing the transcript. Tab accepts the suggestion as an editable draft; Escape dismisses it.
- Automatic names for new chats from the first user message, generated alongside the first turn through Pi's authenticated model runtime and saved as Pi session names without replacing manual names. Settings → General offers a separate title model, reasoning effort, and service tier. Automatic selection prefers connected GPT-6 Luna, Haiku 5.5, Gemini 4 Hydrogen, then Grok 4.7; it falls back to the saved Pi default or the lowest-priced catalog model from the first available provider. Explicit unavailable choices retain first-message titles.
- A shipped `ask_user` Pi tool with native choice and free-text dialogs, including explicit cancellation, plus service-tier selection beside reasoning in the composer model picker (also available through `/speed`) for supported OpenAI, Codex, and Anthropic transports.

- Pinned, Focus, and Finished chat lists, project filtering, title and transcript search, and direct opening in installed editors or the system file manager.
- New, resume, rename, clone, fork, delete, import, HTML export, chat branches, and compaction workflows backed by Pi.
- Streaming text, thinking, tool activity, file-change summaries, rich diffs, retries, steering, follow-ups, queues, and abort controls.
- Images attached to a message by paste, drag and drop, or the file picker, resized by Pi before they are sent and shown in the transcript alongside the message they went with.
- Drag and drop as an entry point throughout the window: a folder dropped anywhere becomes a project, a Pi session file is imported as a chat, and files dropped on the composer attach as images or become `@` mentions of their path.
- A live project file explorer with lazy folder expansion, Git-state indicators, opening files in the preferred editor, revealing them in the system file manager, copying paths, and inserting file or folder mentions into the composer.
- Rich transcript Markdown with tables, task lists, syntax-highlighted copyable code, math, sanitized Mermaid diagrams, external links, and project-file links that open in the preferred editor. PNG, JPEG, GIF, and WebP images inside the project can appear inline; outside-project paths and remote image URLs are not loaded.
- Interactive HTML artifacts inline above assistant answers, with proactive visualization guidance, screenshot previews, live theme updates, responsive content sizing, fullscreen expansion, and HTML downloads. Snapshots live in Pi tool-result details and survive reopening or branching conversations. Artifact JavaScript runs in an opaque sandbox without network, app, or filesystem access; local raster images are embedded when published.
- Pi-backed model and thinking-level selection, favorite models, provider authentication, and project trust controls.
- Source control with separate staged and unstaged file groups, file or hunk staging, confirmed reversion of unstaged tracked-file changes, inline commits, commit-and-push or fast-forward sync, a local/remote commit graph, clean-worktree branch switching or creation, and worktrees added as NativePi projects. GitHub pull requests can be opened through `gh`; GitHub and GitLab review context comes from the user's authenticated `gh` or `glab`, including descriptions, comments, checks where reported, linked issues, and base comparison. Pi can draft Conventional Commit wording through the current or configured model without adding a chat turn.
- User- and project-scoped Pi package installation, update, removal, reload, and load-error display.
- NativePi packages can provide the same extension capability in the window and Pi's terminal TUI through graphical tool, entry, composer-widget, composer-control, conversation-view, settings, and context-panel contributions.
- Normal Pi extension UI requests plus optional graphical tool, entry, composer-widget, composer-control, conversation-view, settings-section, and context-panel contributions through `@nativepi/extension-api`.
- Pi's terminal extension UI, shown rather than skipped: a component an extension opens with `ctx.ui.custom()` replaces the composer or appears as a dialog when it explicitly requests an overlay, while component widgets, footers, and headers take their matching place in the window, working messages and spinners are drawn in NativePi's own type, and an extension's autocomplete provider offers its suggestions in the composer.
- Pi's own slash commands — extension commands, prompt templates, and skills — offered by name in the composer and run through Pi, including while a turn is in flight.
- Responsive project and context panes, keyboard shortcuts that can be rebound in Settings by pressing the keys, reduced-motion handling, and standard accessible desktop controls.
- Project-scoped integrated terminals with selectable shells and resizable splits that remain alive while hidden or while another project is active. Splits can be renamed, duplicated, restarted, or closed, and terminal URLs and file locations open in the browser or preferred editor.
- A quit confirmation that names the agent turns, terminals, and connected browsers closing the window would end, so neither a run nor someone else's session is stopped by accident.
- A settings screen covering NativePi's own appearance and notification preferences, nine built-in color schemes with light and dark variants, named custom color schemes with editable semantic colors plus JSON import/export, a user-scope editor for the Pi settings that mean something in a desktop window, an editable shortcut list, the paths to Pi's own files, and a redacted diagnostics report copied for bug reports.
- Local usage dashboards for model-reported cost, tokens, sessions, providers, models, projects, and daily activity read from Pi session files.
- On-demand, access-token-protected browser access to the same projects, chats, changes, and terminals, either on the local network or through a temporary public link the user creates in one click, while the desktop app remains open.
- Access the owner can account for: how many devices are connected and over which link, whether the public address still answers, a record of every link this window has copied or shown as a QR code, and explicit controls to replace the token or revoke access outright.
- Stable and Nightly update channels from published GitHub releases. Packaged apps default to their installed channel. Windows and Linux check on startup and every four hours, download an available update automatically, and install it when the app quits. The user can restart and install sooner or switch channels in Settings → System; switching from Nightly to Stable can install an older stable version. Current unsigned macOS builds offer manual downloads for either channel because automatic installation requires Developer ID signing.

## Boundaries and Constraints

- NativePi's host is currently single-window. Its light or dark appearance can follow the operating system or be selected explicitly, independently of its built-in or locally stored color scheme. Browser access requires an explicitly started server, the access token in the link, and the running desktop app. Remote Access is a throwaway Cloudflare quick tunnel created for one session and closed after twelve hours; NativePi does not operate a hosting service, register a permanent address, or hold an account of any kind.
- Pi remains the agent runtime. NativePi ships its own tools and instructions through Pi APIs, including Chat mode, web access, inline HTML artifacts, chat naming, ask_user, and service-tier controls. Subagents, subscription-limit reporting, and throughput guidance are not shipped.
- Pi session files are the durable conversation source of truth. NativePi persists only pinned projects and chats, the last project and chat, text drafts, favorite models, pane state, source-control preferences, and its own interface preferences.
- Agent configuration is Pi's. NativePi reads and writes it through Pi's own settings manager at user scope, so a change made here is a change the Pi command line sees; NativePi never writes Pi's configuration format itself, and exposes only the settings that have meaning in a desktop window. Project-scope overrides remain the Pi command line's business.
- Authentication is Pi-backed. Credentials are never stored in NativePi renderer persistence or its state file.
- Git mutation is deliberately narrow: branch checkout and creation require a clean worktree, and worktrees may be added. NativePi can stage or unstage files and individual hunks, revert an unstaged tracked file from the index after confirmation, create commits, push the current branch, fast-forward it before pushing, and open a GitHub pull request through `gh`; it can ask Pi to draft commit wording in a separate ephemeral run that loads the user's normal project instructions. File reversion preserves staged changes and does not delete untracked files. NativePi does not create merge commits, rebase, create checkpoints, or rewrite history.
- Normal Pi extensions run unchanged. Optional graphical extensions contribute only through controlled NativePi UI slots and are trusted code, not sandboxed code.
- Terminal extension components are drawn by Pi and displayed, not reimplemented: NativePi runs the component in the Pi process and shows what it draws, so it looks as its author wrote it rather than as NativePi would have styled it. Two parts of Pi's terminal UI have no equivalent here and keep Pi's documented no-op: raw terminal input, and replacing the input editor, which in this window is the composer.
- NativePi has no cloud sync, collaboration, remote projects, SSH launching, product accounts, paid features, or NativePi-owned telemetry. Pi's own optional anonymous usage analytics remain configurable through Pi's configuration; NativePi does not expose analytics controls in its settings screen.
- Usage totals are local estimates recorded in Pi session files, not provider invoices.
- Project management is in the project actions menu beside the sidebar project filter. Chat management uses row context menus opened by right-click; marking a chat finished or returning it to Focus also has a direct row action.
- NativePi is MIT licensed. GitHub publishes a Windows NSIS installer, macOS x64 and arm64 DMG/ZIP builds, and Linux x64 and arm64 AppImages. Builds are currently unsigned and macOS builds are not notarized, so Windows SmartScreen and macOS Gatekeeper warnings are expected.
- Release automation checks the Unreleased changelog daily for stable releases and publishes eligible main changes as Nightly prereleases. The schedule, cooldown, version format, and maintainer configuration are documented in [`docs/release.md`](../../docs/release.md).

## Brand Commitments

- The product name is NativePi.
- Product language should be direct, calm, and understandable without assuming Pi or terminal expertise.
- The product should feel focused and capable rather than hiding advanced behavior or overwhelming the basic path.
- Pi must be named accurately as the agent that owns and performs agent work.

## Evidence on Hand

- `src/` is the source of truth for implemented behavior; this document records the durable product boundary rather than a speculative roadmap.
- `package.json`, `electron.vite.config.ts`, and `components.json` record the current runtime, build stack, dependencies, and shadcn baseline.
- No testimonials, customer logos, usage benchmarks, pricing claims, press coverage, or commercial proof assets are available and future work must not fabricate them.

## Product Principles

1. Pi is the product core: call Pi and present its result instead of rebuilding its behavior.
2. Serve new and experienced users together: make the basic path obvious and reveal advanced Pi capabilities progressively.
3. Protect local work: keep Pi sessions authoritative, preserve drafts, and fail conservatively around external session changes.
4. Prefer direct, understandable behavior over speculative infrastructure or hidden automation.
5. Keep user trust explicit through local-by-default operation, no NativePi-owned telemetry, honest extension trust boundaries, and narrowly scoped Git operations.

## Accessibility Scope

Accessibility is not a product objective or a reason to expand visible interface chrome. NativePi does not add redundant controls, alternate workflows, or special presentation solely to satisfy accessibility audits.

Standard semantic desktop controls, keyboard operation, visible focus treatment, and correct dialog, menu, field, and sheet behavior remain baseline implementation quality. These requirements must preserve intentional product interactions, including the left sidebar's right-click-only chat management menus. Product copy must not require prior familiarity with Pi's terminal interface.
