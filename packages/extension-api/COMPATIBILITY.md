# Compatibility and lifecycle

This matrix describes the source in this branch, using Pi coding-agent / pi-tui
**1.5.2**, React **19.3**, renderer contract **1**, package version **1.0.0**.
It is not a promise that all third-party extensions work. Package version stays
unchanged pending the maintainer's release workflow.

| Surface | Contract | Verification / limits |
| --- | --- | --- |
| Ordinary Pi entry | Unchanged `pi.extensions` | Pi’s actual loader loads the unchanged upstream hello example and activity package; registration and graphical compilation are tested. No third-party package catalog certification. |
| Graphical entry | Optional `nativepi.renderer`, `apiVersion: 1` | Compilation, malformed definitions, duplicate IDs, unsupported capabilities, trust and imported-file edits tested. |
| Channel | Shared synchronous schemas; JSON only | Registration replacement, disposal, rejected active reload, stale async results, bad payloads and listener isolation tested. |
| Split panes | Pane-owned channels, actions and event subscriptions | Selection invalidation and reload tested in DOM. Saved handles cannot target the next conversation. Full multi-pane native interaction still needs manual verification. |
| Delegate composer | Read-only | `context.composer?.writable` reports availability; draft insertion checks current role. Graphical code is trusted and this is not a permission sandbox. |
| Settings and panels | Follow owning pane's selection | Session data belongs in Pi. Effects must clean up when unmounted. Settings is not a global extension process. |
| Tools | Call arguments and final result | Tool arguments update during assistant streaming. `progress` exposes the latest transient `tool_execution_update` text/details; independent concurrent-tool cleanup and malformed updates are tested. Do not describe progress as a completed result. |
| Local Access | Same browser-safe bundle and schema contract | No renderer credentials or privileged transport in persistence. Network browser interaction remains a manual verification item; clipboard and external-link behavior use the client. |
| Theme / scale | Host primitives and semantic CSS variables | Avoid hardcoded colors, fixed pixel font sizes, and dynamically invented Tailwind classes. Native visual inspection is required for extension-specific layouts. |
| Terminal UI | NativePi Pi TUI bridge | Existing supported custom components/widgets/header/footer are retained. Raw terminal input and editor replacement retain Pi's no-op; no universal terminal parity claim. |

## Lifecycle rules

A renderer context belongs to a pane selection and loaded renderer, not global
focus. Channel calls and all actions reject stale handles. Calls already sent
may have executed; rejection cannot undo their effects. Reacquire handles from
the current context. Keep external effects in React effects and return cleanup.
A subscription is also automatically removed when its view binding ends.

On the Pi side, `connect()` replaces the package's method table atomically.
Call its idempotent `dispose()` during `session_shutdown`. A superseded
connection cannot emit events or remove a newer connection's methods. A pending
method result is rejected after registration replacement or disposal. This is
not cancellation of the handler: extensions must stop their own background work
using Pi's lifecycle and abort facilities.

Do not open timers, sockets or watchers at module scope. Start session resources
in `session_start`, close them in `session_shutdown`, and keep cleanup idempotent.
NativePi deduplicates concurrent identical renderer imports and bounds its source
cache to 50 entries. Browsers retain evaluated ESM modules until document reload;
revoking Blob URLs does not unload their code. During extended development, reload
the window to reclaim browser module memory. Hot edits are discovered on extension
reload, not by a filesystem watcher.

## Additive negotiation and migration

Existing version-1 definitions without `requires` still load. New bundles can
write `requires: ["scoped-handles", "host-dispose", "tool-progress"]` to demand this lifecycle.
Unknown requirements fail before mounting with an update/downgrade instruction.
Older strict version-1 hosts reject the new `requires` field; remove it only if
the renderer can safely run with their old behavior. `hostCapabilities` is
informational for optional feature selection; do not derive requirements from
what happens to be installed. It does not negotiate an extension's private
protocol: ship both halves from the same package and keep their schemas shared.

For an existing v1 package, keep the Pi entry and `apiVersion: 1`. Add shutdown
cleanup, remove module-scope resources, and stop retaining context handles across
chat changes. Use `context.composer?.writable` when offering draft insertion.
The 0.x migration is in README. This additive contract requires an API package
release before external packages can depend on it; no package version bump or
npm publication is included here.

## Author workflow and recovery

Use the [activity example](examples/activity/README.md) as a local Pi package.
Install/update/remove through Pi package facilities or NativePi Settings → Tools
& extensions → Packages; there is no separate registry. A graphical load error
leaves the ordinary Pi entry independent. Fix the source or compatible package
version, finish running turns, and use **Reload extensions**. Native macOS
inspection verified an unsupported requirement, source correction, reload and
error removal using an isolated Pi agent directory and desktop profile. Compilation failures
are retryable. Render exceptions use the existing per-contribution boundary.

Inspect a new chat, an existing session, a second pane, a delegate, light/dark and
custom themes, interface scale, Settings, and an authenticated Local Access
client before distributing. Test reload while idle, rejected reload while busy,
removed methods, malformed data, and delayed initial reads racing live events.
Do not put secrets in renderer state, browser storage or shared protocol events.
Extensions run as trusted code with the user's privileges; slots are not isolation.

## Primary sources consulted

- [Pi extensions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md): session lifecycle, UI modes, trusted code and ordinary package entries.
- [VS Code extension API](https://code.visualstudio.com/api/references/vscode-api#ExtensionContext): disposable resources as an author lifecycle convention.

The installed Pi 1.5.2 types and NativePi bridge are the compatibility baseline;
upstream main documentation is research, not evidence that newer Pi versions
have been tested. Context7 lookup was unavailable due to its service quota.

## Integration with independent app work

This change uses the existing pane store, selection version and runtime epoch;
it adds no background host or workspace transport. Host integrations must keep
those invalidation signals when replacing a Pi process and must forward Pi tool
execution updates to the owning conversation. Progress is an optional transient
conversation field, never part of persisted NativePi UI metadata. Pane release
clears renderer ownership to release subscriptions. A future host refactor should
retain the opaque registration identity check rather than routing solely by the
package name. No unmerged workspace, review or graphical-extension changes are
required by this branch.
