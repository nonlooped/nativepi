# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

NativePi serves two primary groups equally:

- Existing Pi users who want a polished desktop workflow without losing Pi's capabilities, sessions, configuration, or extensions.
- Developers who prefer a graphical coding-agent experience and do not want terminal knowledge to be a prerequisite.

Both groups use NativePi while working in local project folders. Basic workflows must remain approachable, while advanced Pi capabilities are available through progressive disclosure.

## Product Purpose

NativePi is a free, open-source desktop interface for the Pi coding agent. It gives Pi a focused graphical workflow for projects, conversations, model controls, tool results, diffs, authentication, settings, and extensions.

Success means NativePi is useful enough to be the daily desktop interface for Pi project work: users can open a local project, authenticate, start or resume conversations, direct agent runs, inspect results, and manage relevant Pi capabilities without needing Pi's terminal UI.

## Positioning

NativePi is a Pi-only desktop wrapper, not a separate agent harness. Pi remains the product core and source of truth for agent behavior, providers, models, authentication, tools, prompts, skills, extensions, queues, compaction, and sessions. NativePi presents those capabilities directly instead of creating parallel AI logic or a second conversation model.

## Operating Context

- NativePi is a local, single-window Windows desktop application used alongside local code projects, Git repositories, and the existing Pi CLI ecosystem.
- Users pin project folders, discover or create Pi sessions, converse with Pi, inspect streaming messages and tool activity, and review read-only Git state and diffs.
- Existing Pi credentials, configuration, sessions, packages, skills, prompts, and extensions remain in Pi's normal storage and remain usable by the Pi CLI.
- A project can have one active Pi agent run at a time. Different projects may run concurrently.
- Conversations must open from Pi session files without waiting for a Pi process to start, and drafts must remain safe through cold starts and failures.

## Capabilities and Constraints

- Windows-first for version 1; macOS and Linux may be added later.
- Local-only, single-window, and dark-only for version 1.
- Pi-only. NativePi does not own an agent loop, make its own LLM requests, add agent tools, or support other harnesses.
- Pi session files are the durable conversation source of truth. NativePi stores only its own small set of UI state, including pinned projects, selections, pane state, drafts, pending attachments, preferences, and update-check state.
- Authentication is Pi-backed. Credentials must never be stored in NativePi renderer persistence.
- Git functionality is read-only. NativePi does not stage, commit, switch branches, create worktrees or checkpoints, discard changes, or perform rollback.
- Normal Pi extensions run unchanged. Optional graphical extensions may contribute only through controlled NativePi UI slots and are trusted code, not sandboxed code.
- No cloud sync, collaboration, remote projects, SSH launching, terminal emulator, configurable keybindings, product accounts, paid features, or telemetry in version 1.
- NativePi is MIT licensed and initially distributed without paid code-signing certificates; unsigned installer warnings must be explained honestly.

## Brand Commitments

- The product name is NativePi.
- Product language should be direct, calm, and understandable without assuming Pi or terminal expertise.
- The product should feel focused and capable rather than hiding advanced behavior or overwhelming the basic path.
- Pi must be named accurately as the agent that owns and performs agent work.

## Evidence on Hand

- `PLAN.md` is the authoritative product plan and scope record.
- The working desktop implementation in `src/` demonstrates project and session navigation, chat composition and transcripts, provider authentication, settings, trust prompts, read-only Git context, diffs, and extension management.
- `components.json` records the installed shadcn preset and component baseline.
- No testimonials, customer logos, usage benchmarks, pricing claims, press coverage, or commercial proof assets are available and future work must not fabricate them.

## Product Principles

1. Pi is the product core: call Pi and present its result instead of rebuilding its behavior.
2. Serve new and experienced users together: make the basic path obvious and reveal advanced Pi capabilities progressively.
3. Protect local work: keep Pi sessions authoritative, preserve drafts, and fail conservatively around external session changes.
4. Prefer direct, understandable behavior over speculative infrastructure or hidden automation.
5. Keep user trust explicit through local-only operation, no telemetry, honest extension trust boundaries, and read-only Git integration.

## Accessibility & Inclusion

Core workflows must be operable with the keyboard and use standard accessible desktop controls, including visible focus treatment, semantic labels, and appropriate dialog, menu, field, and sheet behavior. Product copy must not require prior familiarity with Pi's terminal interface.
