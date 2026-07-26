# NativePi Plan

## 1. What We Are Building

NativePi is a free, open-source desktop interface for the
[Pi coding agent](https://github.com/earendil-works/pi).

It should feel like a smaller, Pi-only version of T3Code:

- Projects and chats in a sidebar.
- A polished chat transcript.
- A persistent composer.
- Model and thinking controls.
- Rich tool results and diffs.
- Graphical settings and authentication.
- Full support for normal Pi extensions.
- An optional graphical API for extensions that want native NativePi UI.

NativePi is only a wrapper. Pi owns the agent, tools, providers, models,
extensions, prompts, skills, compaction, queues, and sessions. NativePi renders
those capabilities and gives users a desktop workflow around them.

The application is:

- MIT licensed.
- Local-only.
- Windows-first.
- Dark-only for version 1.
- Single-window.
- Pi-only.
- Built for both Pi users and people who do not like terminals.

macOS and Linux can be added later. We will not initially purchase code-signing
certificates or platform developer accounts.

## 2. Product Principles

### Pi Is the Product Core

NativePi must not become another harness.

It will not add:

- Its own agent loop.
- Its own AI requests.
- Its own built-in tools.
- Provider-specific logic.
- Custom system prompts.
- Checkpoints or hidden Git commits.
- Support for other coding agents.

If Pi already does something, NativePi should call Pi and display the result
instead of implementing a second version.

### Simple Before Clever

The previous attempt failed because too much infrastructure was built around a
fairly simple application. This version follows these rules:

1. Start with one direct implementation of each feature.
2. Do not create a reusable abstraction until it has at least two real users.
3. Keep code in the desktop app unless it must be published separately.
4. Do not add a database, event-sourcing layer, service container, worker
   framework, repository layer, or internal plugin system.
5. Use Pi's public data and events directly instead of creating a large parallel
   domain model.
6. Add caching, virtualization, batching, and worker eviction only after a
   measured problem appears.
7. Prefer readable feature code over architectural purity.
8. A small amount of duplication is better than a premature framework.
9. Tests protect fragile boundaries and important flows; they do not need to
   cover every component or implementation detail.
10. Shipping a useful version is more important than preparing for hypothetical
    scale.

### Progressive Disclosure

The basic path should be understandable without Pi or terminal knowledge:

1. Open NativePi.
2. Log in to a provider.
3. Open a project folder.
4. Create a chat.
5. Select a model.
6. Send a message.

Advanced Pi features remain available in settings, session menus, extension
management, and contextual controls without crowding the basic flow.

## 3. Scope

### Version 1 Includes

- Pinned project folders.
- Pi session discovery and chat history.
- New, resume, rename, fork, clone, and session-tree flows.
- Text prompts, images, and file references.
- Streaming responses and thinking.
- Tool calls and tool results.
- Steering and follow-up messages.
- Queue state and abort controls.
- Model and thinking-level controls.
- Token, cost, cache, and context information from Pi.
- Compaction and retry controls.
- Pi-backed provider authentication.
- Shared Pi credentials and configuration.
- Read-only Git status and diffs.
- Pi package and extension management.
- Native dialogs for serializable extension UI requests.
- Optional rich React UI supplied by extensions.
- Fixed keyboard shortcuts.
- In-app GitHub release checks and installer download.

### Version 1 Does Not Include

- Other agent harnesses.
- Remote projects or SSH launching.
- A browser client or network server.
- Checkpoints.
- Git staging, commits, merges, or rollback.
- A full terminal emulator.
- Cloud sync or collaboration.
- An extension marketplace.
- Configurable keybindings.
- Multiple windows.
- A light theme.
- Product accounts or paid features.
- NativePi telemetry.

## 4. Technology

| Area | Choice |
| --- | --- |
| Desktop framework | Electron |
| Main/preload runtime | Node (Electron) |
| Package manager | Bun |
| UI | React 19.2 |
| Development and builds | electron-vite / Vite+ / Vite |
| Packaging | electron-builder |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui |
| State | Zustand |
| Boundary validation | Zod 4 |
| License | MIT |

Use Node and Electron APIs in the main process. Prefer maintained packages over
hand-rolled desktop behavior (dialogs, shell, window chrome, packaging).

### shadcn Baseline

Initialize shadcn with preset `b1wXDkDqCm`.

The preset uses:

- Mira style.
- Zinc colors.
- Phosphor icons.
- Nunito Sans body text.
- Raleway headings.
- Default radius.
- Subtle menu accents.

The official shadcn skill and CLI should guide component installation and usage.
Use existing shadcn components and chat primitives before creating custom ones.
Keep the result visually distinct from T3Code even though the workflow is
similar.

## 5. Repository

Use a Bun workspace with only two packages:

```text
nativepi/
|-- apps/
|   `-- desktop/
|       |-- src/
|       |   |-- main/          # Electron main: window, IPC, Pi
|       |   |-- preload/       # contextBridge API
|       |   |-- renderer/      # React application
|       |   `-- shared/        # Types across the main↔renderer boundary
|       |-- electron.vite.config.ts
|       `-- package.json
|-- packages/
|   `-- extension-api/         # Public @nativepi/extension-api
|-- package.json
|-- bun.lock
`-- PLAN.md
```

Do not split protocol, UI, sessions, Git, auth, persistence, or runtime into
separate packages. They can be normal folders inside the desktop app.

The extension API is separate only because third-party extension authors need to
install and import it.

## 6. Simple Architecture

```text
React renderer
    |
    | Electron IPC (preload contextBridge)
    v
Electron main (Node)
    |
    | Pi JSON RPC over stdin/stdout
    v
Bundled Pi process (Node via ELECTRON_RUN_AS_NODE)
```

The React renderer displays the application. The Electron main process handles
desktop access, files, Git, updates, and Pi processes. Pi performs all agent
work.

Do not introduce a local HTTP server, WebSocket server, internal event bus, or
custom orchestration engine.

### Pi Distribution

Bundle a pinned version of `@earendil-works/pi-coding-agent` with NativePi.

- Do not require a global Pi installation.
- Run the bundled Pi with Node (Electron's binary under `ELECTRON_RUN_AS_NODE`).
- Continue using the normal `~/.pi/agent` directory.
- Show the bundled Pi version in settings.
- Update Pi when NativePi updates to a newly tested version.

### Pi Sessions

Run Pi in its official RPC mode.

The host needs one small Pi client that:

- Starts Pi in a project directory.
- Writes JSON commands to stdin.
- Reads LF-delimited JSON responses and events from stdout.
- Matches responses to request IDs.
- Sends validated events to React.
- Stops Pi when NativePi exits.

Use Zod to validate messages entering from Pi and untrusted external data. Do
not build a large schema system around internal function calls.

### Pi Process Lifetime

Start a project's Pi process when the user first needs it. Once started, keep it
alive for the rest of the NativePi session.

This intentionally avoids a configurable pool, LRU eviction, warm-process
manager, or memory-pressure policy. If keeping many processes alive becomes a
real memory problem, add a simple idle timeout later.

Only one agent may run per project directory. Different projects may run at the
same time.

## 7. Fast Chat Switching

Opening a chat must not wait for Pi to start.

NativePi reads the Pi session JSONL file directly to display its transcript. Pi
starts in the background only when the chat needs to run or mutate.

For a cold chat:

1. Show the transcript immediately from the session file.
2. Restore the draft immediately.
3. Keep the composer editable.
4. Start Pi in the background.
5. If the user presses Send, show the message as waiting.
6. Submit it when Pi is ready.
7. If startup fails, restore the text to the composer and show the error.

The waiting message is UI state only until Pi accepts it. Do not write it into
the session JSONL manually.

No durable transcript cache or session database is needed. Parse the selected
file when it is opened and keep the result in memory while NativePi is running.

## 8. State and Persistence

Pi owns all durable agent state in `~/.pi/agent`, including:

- Authentication.
- Models.
- Settings.
- Sessions.
- Extensions and packages.
- Skills and prompt templates.

NativePi stores one small JSON file in its application-data directory containing:

- Pinned projects.
- Project order and display names.
- Last selected project and chat.
- Window and pane state.
- Per-chat drafts and unsent attachments.
- NativePi-only preferences.
- Last update check.

Write the file through a temporary file and rename it so a crash is less likely
to leave broken JSON. Do not add migrations beyond a simple version number and a
small compatibility function when the shape changes.

Use Zustand for React state. Organize stores by actual UI concerns rather than
trying to model all of Pi:

- Projects and chats.
- Selected transcript.
- Active Pi runs.
- Drafts and pending messages.
- Settings and dialogs.
- Graphical extension registrations.

## 9. Interface

### Layout

Use a T3Code-like workflow with NativePi's own shadcn styling:

```text
+----------------+----------------------------+----------------+
| Projects       | Conversation               | Context        |
| Chats          | Messages                   | Git changes    |
| New chat       | Thinking and tools         | Diffs          |
|                |                            | Session info   |
|                +----------------------------+                |
|                | Composer and model controls|                |
+----------------+----------------------------+----------------+
```

The context pane is collapsible. On narrow windows it becomes a sheet or tab so
the conversation remains usable.

### Sidebar

The sidebar provides:

- Pinned projects.
- Chats belonging to the selected project.
- New chat.
- Rename, fork, clone, and delete/remove actions where Pi supports them.
- Add and remove project folders.
- Simple filtering when the session list is long.

### Transcript

Render:

- User messages.
- Assistant text.
- Collapsible thinking.
- Tool start, progress, result, and error states.
- Inline edit and write diffs.
- Bash output.
- Retry and compaction notices.
- Extension-provided renderers.
- A readable JSON/text fallback for unknown custom entries.

Use shadcn's chat primitives for message rows, scrolling, attachments, markers,
and jump-to-latest behavior.

### Composer

The composer supports:

- Multi-line input.
- Text and image messages.
- File references.
- Skills, templates, and extension commands.
- Model selection.
- Thinking-level selection.
- Send, steer, follow-up, and abort.
- Pending cold-start messages.
- Extension add-ons and widgets.

The composer remains usable while Pi starts.

### Keyboard Shortcuts

Provide a small fixed shortcut set for common actions:

- New chat.
- Switch project or chat through the visible switcher controls.
- Send, steer, and follow up.
- Abort.
- Select a model.
- Cycle thinking level.
- Toggle thinking/tool detail.
- Toggle the context pane.
- Open settings.

Show shortcuts in tooltips and menu labels. Do not build keybinding
configuration in version 1.

## 10. Authentication and Onboarding

Users must be able to authenticate without using Pi's terminal UI.

NativePi should use Pi's exported authentication and model APIs for flows missing
from RPC.

Requirements:

- Detect credentials already created by the Pi CLI.
- Support Pi's API-key and subscription/OAuth methods.
- Store credentials only where Pi normally stores them.
- Refresh available models after login or logout.
- Never store keys in Zustand persistence or NativePi's JSON file.
- Show project-trust prompts through a normal NativePi dialog.

Keep onboarding short. Do not build tutorials, sample projects, guided tours, or
provider-specific educational content for version 1.

## 11. Pi Feature Support

NativePi should eventually expose the relevant public Pi workflow, but it does
not all need to be implemented before the first usable build.

Build in this order:

1. Prompt, stream, tools, abort, model, and resume.
2. Steering, follow-ups, queues, thinking levels, and usage stats.
3. New, rename, fork, clone, and session tree.
4. Compaction, retries, import, and export.
5. Less common settings and extension-specific states.

Pi remains authoritative throughout. The UI can expose a smaller initial subset
without inventing replacement behavior.

## 12. Git and Diffs

Git support is read-only apart from choosing where work happens.

Include:

- Repository detection.
- Current branch.
- Dirty state.
- Changed-file list.
- Working-tree diff.
- Rich rendering of Pi edit and write results.
- Switching to a branch, or creating one, in the current checkout.
- Adding a worktree for a branch, opened as its own NativePi project.

Do not include staging, commits, merges, rebases, hidden snapshots, discard, or
rollback. Nothing NativePi does may rewrite history or move work the user has
not committed.

Run simple Git commands from the Electron main process and return their output.
Do not create a Git service framework or persistent repository model.

## 13. Terminal Scope

There is no full terminal emulator.

Support Pi's one-shot user bash command through RPC, including streamed output
and cancellation. Persistent PTYs, terminal tabs, profiles, and shell session
restoration are out of scope.

## 14. Extensions

### Normal Pi Extensions

Normal Pi extensions run inside Pi without changes. NativePi displays their tool
calls, messages, errors, and commands using Pi's normal events.

Serializable UI requests receive native NativePi views:

- Select.
- Confirm.
- Text input.
- Multi-line editor.
- Notification.
- Status text.
- Text widgets.
- Composer text updates.

Arbitrary Pi TUI components cannot be translated directly into React.

### Graphical Extension API

An extension can provide optional NativePi UI through its package manifest:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "nativepi": {
    "renderer": "./src/nativepi.tsx"
  }
}
```

NativePi uses `Bun.build` to compile the renderer as browser code and loads it in
the renderer. React and `@nativepi/extension-api` are provided by NativePi.

The public API offers controlled slots for:

- Tool renderers.
- Custom message and entry renderers.
- Composer add-ons.
- Autocomplete providers.
- Widgets above or below the composer.
- Sidebar or bottom panels.
- Status/footer contributions.
- Current session and dark-theme information.

Extensions cannot replace the core composer, transcript, sidebar, or routing.

Keep the loader straightforward:

1. Find the manifest entry.
2. Run `Bun.build`.
3. Load the output.
4. Register its components.
5. Show a readable error if build or loading fails.

Do not initially add build generations, dependency graph tracking, transactional
reloads, persistent build caches, capability probing, or sandbox claims. Add a
simple cache later only if extension rebuild time is noticeably poor.

Graphical components should have React error boundaries so one broken renderer
does not remove the whole chat.

### Trust

Extensions are trusted code, just as they are in Pi. NativePi should say this
clearly before installation. The Pi process provides useful crash separation,
but neither Pi extensions nor graphical extension code are a security sandbox.

## 15. Extension Manager

Provide a small UI over Pi's package operations:

- List installed packages and loose extensions.
- Show global or project scope.
- Show load errors.
- Install npm or Git sources.
- Enable or disable resources.
- Remove packages.
- Update packages.
- Reload extensions.

Do not build search, ratings, discovery, curation, or a separate marketplace.

## 16. Concurrent Session Changes

The Pi CLI and NativePi can both access the same session file. They should not
actively write to the same chat at the same time.

Use a simple safety check:

- Remember the session file's modification state while NativePi is using it.
- Watch for changes that did not come from NativePi's Pi process.
- If one appears, stop sending new commands to that chat.
- Preserve the user's draft.
- Offer Reload and Duplicate.

Do not create a custom lock-file protocol. If reliable write attribution becomes
too difficult, use a conservative modification-time check before each mutation
and document the limitation.

## 17. Updates

Publish Windows releases on GitHub.

NativePi should:

1. Check the latest GitHub release occasionally.
2. Show that an update is available.
3. Download the Windows installer after user confirmation.
4. Close running Pi processes and save drafts.
5. Exit NativePi.
6. Launch the downloaded setup program.

The installer will initially be unsigned, so documentation must explain Windows
SmartScreen warnings.

Do not build release channels, background patching, rollback, or a separate
update service for version 1.

## 18. Privacy and Diagnostics

NativePi collects no telemetry.

For development and bug reports, keep simple local logs containing:

- App, Electron, and Pi versions.
- Pi process startup and exit errors.
- Invalid RPC messages.
- Extension build/load errors.
- Update errors.

Do not log credentials, prompts, assistant messages, or tool output by default.
A simple "Open Logs" or "Copy Diagnostics" action is enough. Do not build a
large observability or crash-reporting system.

## 19. Testing Approach

NativePi does not need exhaustive test coverage or strict test-driven
development.

Write tests where mistakes are difficult to notice manually or could lose user
work:

- Pi JSONL framing across stream chunks.
- Basic Zod validation for Pi and IPC boundaries.
- Session JSONL parsing.
- Draft persistence.
- Cold-send behavior.
- One-run-per-project enforcement.
- Graphical extension build and registration.

Keep one end-to-end smoke flow using the bundled Pi:

1. Start NativePi or the host in test mode.
2. Open a temporary project.
3. Start Pi.
4. Send a deterministic test prompt or use a fake provider.
5. Confirm that streaming events reach the UI layer.
6. Shut down cleanly.

Before releases, use a short manual checklist:

- Fresh onboarding and login.
- Existing Pi login detection.
- Open project and create chat.
- Resume existing chat.
- Stream a response and tool call.
- Steer, follow up, and abort.
- Switch projects while one is running.
- Load a normal extension.
- Load a graphical extension.
- View a working-tree diff.
- Download and launch an update installer.

Do not set a coverage target. Do not snapshot every component. Do not mock the
entire Pi protocol. Add regression tests when real bugs are fixed.

## 20. Implementation Phases

### Phase 1: Prove the Stack

- Create the Bun workspace.
- Launch an Electron window with React and electron-vite.
- Apply the shadcn preset.
- Spawn pinned Pi in RPC mode with Node.
- Send one prompt and display streamed text.
- Verify a normal Pi extension can load.
- Verify Windows packaging.

This phase is disposable. Its goal is to prove the choices before building the
real interface.

### Phase 2: Build the Useful Core

- Project folders and chat sidebar.
- Session JSONL reading.
- Chat transcript.
- Composer.
- Model and thinking controls.
- Tool results.
- Abort.
- Draft persistence.
- Cold-start message queueing.

At the end of this phase, NativePi should already be useful for daily work.

### Phase 3: Make It Friendly to New Users

- First-run onboarding.
- Existing Pi auth detection.
- Pi-backed provider login.
- Project trust prompts.
- Clear empty and error states.
- Basic settings.

### Phase 4: Add Pi Session Features

- Steering and follow-ups.
- Queue display.
- New, resume, rename, fork, and clone.
- Session tree.
- Compaction, retries, stats, import, and export.

Implement these as direct UI calls to Pi, one feature at a time.

### Phase 5: Add Diffs and Extensions

- Read-only Git pane.
- Rich edit/write diffs.
- Native extension dialogs.
- Thin extension manager.
- `@nativepi/extension-api`.
- Manifest-declared graphical renderers.
- React error boundaries for extension UI.

### Phase 6: Release

- Fix the bugs found through real use.
- Add only the regression tests those bugs justify.
- Check keyboard and basic accessibility.
- Add local diagnostics.
- Add GitHub update checking and installer launch.
- Publish the unsigned Windows installer and MIT license.

## 21. First Release Checklist

The first release is ready when:

- It starts reliably on a clean Windows machine.
- It does not require a separate Pi installation.
- Existing Pi authentication and sessions appear in NativePi.
- A new user can authenticate without opening a terminal.
- Users can open projects and switch chats without waiting for Pi startup.
- Text, thinking, tool calls, and errors render correctly.
- Sending, steering, follow-up, and abort work.
- Model and thinking controls work.
- Sessions remain readable by the Pi CLI.
- Normal Pi extensions still run.
- At least one example graphical extension works.
- Read-only Git changes and diffs work.
- Drafts survive an app restart.
- Concurrent external session changes fail conservatively.
- No telemetry is sent.
- The installer and update flow are documented honestly as unsigned.

## 22. Later, Only If Needed

The following are valid future improvements, but they should be driven by real
usage rather than built in advance:

- Stopping idle Pi processes to reduce memory.
- Streaming-event batching if the renderer becomes slow.
- Transcript virtualization for genuinely large sessions.
- A rebuildable session index if direct JSONL reading becomes slow.
- Persistent graphical extension build caching.
- Stronger graphical extension isolation.
- Multiple windows.
- Configurable shortcuts.
- macOS and Linux packaging.
- Signed installers and automatic update improvements.

None of these should influence the initial architecture beyond avoiding an
obvious dead end.
