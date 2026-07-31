# Product

<!-- impeccable:product-schema 1 -->

## Platform

Windows desktop (Electron)

## Users

NativePi serves two primary groups equally:

- Existing Pi users who want a polished desktop workflow without losing Pi's capabilities, sessions, configuration, or extensions.
- Developers who prefer a graphical coding-agent experience and do not want terminal knowledge to be a prerequisite.

Both groups use NativePi while working in local project folders. Basic workflows must remain approachable, while advanced Pi capabilities are available through progressive disclosure.

## Product Purpose

NativePi is a free, open-source desktop interface for the Pi coding agent. It gives Pi a focused graphical workflow for projects, conversations, model controls, tool results, diffs, authentication, settings, and extensions.

Success means NativePi is useful as the daily desktop interface for Pi project work: users can open a local project, authenticate, start or resume conversations, direct agent runs, inspect results, and manage relevant Pi capabilities without needing Pi's terminal UI.

## Positioning

NativePi is a Pi-only desktop wrapper, not a separate agent harness. Pi remains the product core and source of truth for agent behavior, providers, models, authentication, tools, prompts, skills, extensions, queues, compaction, and sessions. NativePi presents those capabilities directly instead of creating parallel AI logic or a second conversation model.

## Operating Context

- NativePi is a Windows desktop application used alongside local code projects, Git repositories, and the existing Pi CLI ecosystem. Its workspace can be shared temporarily to browsers on the same local network.
- Users pin project folders; create, discover, import, and manage Pi sessions; inspect streamed messages and tool activity; and review Git state and diffs.
- Existing Pi credentials, configuration, sessions, packages, skills, prompts, and extensions remain in Pi's normal storage and remain usable by the Pi CLI.
- NativePi keeps one Pi process per active chat, so chats in the same project and different projects may run concurrently.
- Conversations open directly from Pi session files without waiting for a Pi process to start. Drafts remain editable and are restored if a cold send fails.
- Narrow windows move project navigation and project context into sheets so the conversation and composer remain usable.

## Current Capabilities

- Project and chat pinning, date-grouped chat discovery, filtering, title and transcript search, and direct opening in installed editors or Explorer.
- New, resume, rename, clone, fork, delete, import, HTML export, session-tree, statistics, and compaction workflows backed by Pi.
- Streaming text, thinking, tool activity, file-change summaries, rich diffs, retries, steering, follow-ups, queues, and abort controls.
- Images attached to a message by paste, drag and drop, or the file picker, resized by Pi before they are sent and shown in the transcript alongside the message they went with.
- Drag and drop as an entry point throughout the window: a folder dropped anywhere becomes a project, a Pi session file is imported as a chat, and files dropped on the composer attach as images or become `@` mentions of their path.
- Pi-backed model and thinking-level selection, favorite models, provider authentication, and project trust controls.
- Git status and working-tree diffs, clean-worktree branch switching or creation, and creation of worktrees that are added as NativePi projects.
- User- and project-scoped Pi package installation, update, removal, reload, and load-error display.
- Normal Pi extension UI requests plus optional graphical tool, entry, composer-widget, and context-panel contributions through `@nativepi/extension-api`.
- Pi's terminal extension UI, shown rather than skipped: a component an extension opens with `ctx.ui.custom()` appears as a dialog, component widgets, footers, and headers take their matching place in the window, working messages and spinners are drawn in NativePi's own type, and an extension's autocomplete provider offers its suggestions in the composer.
- Pi's own slash commands — extension commands, prompt templates, and skills — offered by name in the composer and run through Pi, including while a turn is in flight.
- Responsive project and context panes, fixed keyboard shortcuts, reduced-motion handling, and standard accessible desktop controls.
- Project-scoped integrated terminals with resizable splits that remain alive while hidden or while another project is active.
- A quit confirmation that names the agent turns, terminals, and connected browsers closing the window would end, so neither a run nor someone else's session is stopped by accident.
- A settings screen covering NativePi's own appearance and notification preferences, a user-scope editor for the Pi settings that mean something in a desktop window, a shortcut reference, and the paths to Pi's own files.
- On-demand, access-token-protected browser access to the same projects, chats, changes, and terminals, either on the local network or through a temporary public link the user creates in one click, while the desktop app remains open.
- Access the owner can account for: how many devices are connected and over which link, whether the public address still answers, a record of every link this window has copied or shown as a QR code, and explicit controls to replace the token or revoke access outright.
- Self-updating from the published GitHub release: a notification when a newer version exists, a download the user starts, and an install that stops the running work before it restarts the app.

## Boundaries and Constraints

- NativePi's host is currently Windows-only, single-window, and dark-only. Browser access requires an explicitly started server, the access token in the link, and the running desktop app. Remote Access is a throwaway Cloudflare quick tunnel created for one session and closed after twelve hours; NativePi does not operate a hosting service, register a permanent address, or hold an account of any kind.
- NativePi does not own an agent loop, make its own LLM requests, add agent tools, or support other harnesses.
- Pi session files are the durable conversation source of truth. NativePi persists only pinned projects and chats, the last project and chat, text drafts, favorite models, pane state, and its own interface preferences.
- Agent configuration is Pi's. NativePi reads and writes it through Pi's own settings manager at user scope, so a change made here is a change the Pi command line sees; NativePi never writes Pi's configuration format itself, and exposes only the settings that have meaning in a desktop window. Project-scope overrides remain the Pi command line's business.
- Authentication is Pi-backed. Credentials are never stored in NativePi renderer persistence or its state file.
- Git mutation is deliberately narrow: branch checkout and creation require a clean worktree, and worktrees may be added. NativePi does not stage, commit, merge, rebase, discard changes, create checkpoints, roll back work, or rewrite history.
- Normal Pi extensions run unchanged. Optional graphical extensions contribute only through controlled NativePi UI slots and are trusted code, not sandboxed code.
- Terminal extension components are drawn by Pi and displayed, not reimplemented: NativePi runs the component in the Pi process and shows what it draws, so it looks as its author wrote it rather than as NativePi would have styled it. Two parts of Pi's terminal UI have no equivalent here and keep Pi's documented no-op: raw terminal input, and replacing the input editor, which in this window is the composer.
- NativePi has no cloud sync, collaboration, remote projects, SSH launching, configurable keybindings, product accounts, paid features, or telemetry.
- NativePi is MIT licensed. GitHub publishes Windows installers, currently without code signing, so SmartScreen warnings are expected.

## Brand Commitments

- The product name is NativePi.
- Product language should be direct, calm, and understandable without assuming Pi or terminal expertise.
- The product should feel focused and capable rather than hiding advanced behavior or overwhelming the basic path.
- Pi must be named accurately as the agent that owns and performs agent work.

## Evidence on Hand

- `src/` is the source of truth for implemented behavior; this document records the durable product boundary rather than a speculative roadmap.
- `package.json`, `electron.vite.config.ts`, and `components.json` record the current runtime, build stack, dependencies, and shadcn baseline.
- `DESIGN.md` records the incumbent visual system and responsive desktop layout.
- No testimonials, customer logos, usage benchmarks, pricing claims, press coverage, or commercial proof assets are available and future work must not fabricate them.

## Product Principles

1. Pi is the product core: call Pi and present its result instead of rebuilding its behavior.
2. Serve new and experienced users together: make the basic path obvious and reveal advanced Pi capabilities progressively.
3. Protect local work: keep Pi sessions authoritative, preserve drafts, and fail conservatively around external session changes.
4. Prefer direct, understandable behavior over speculative infrastructure or hidden automation.
5. Keep user trust explicit through local-only operation, no telemetry, honest extension trust boundaries, and narrowly scoped Git operations.

## Accessibility & Inclusion

Core workflows must be operable with the keyboard and use standard accessible desktop controls, including visible focus treatment, semantic labels, and appropriate dialog, menu, field, and sheet behavior. Product copy must not require prior familiarity with Pi's terminal interface.
