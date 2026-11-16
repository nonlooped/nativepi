# Local background host

NativePi starts two independently owned Electron processes. The desktop owns its
window, preload bridge and updater. The background host owns **all** Pi processes,
queues, delegates, automation polling, terminal PTYs, browser WebContents and
computer-use requests. It uses the existing `ipc.ts` handlers and Pi RPC entry;
it is not another agent runtime. Pi session files remain authoritative.

Opening the desktop connects to a compatible host or starts one automatically.
Closing the window, quitting the desktop, or a renderer crash disconnects only
that client and its subscriptions. Reopen the desktop to read Pi history and the
current streaming message, queues and pending extension questions. Stop remains
available on the reconnected conversation. Sent requests are never retried after
a disconnect: an acknowledgement may have been lost. Inspect the current chat
before submitting again. After a transport failure, use **Try again** to reconnect
and reconcile; it reloads the document, with the normal unsaved-editor warning.

**Settings → General → Background service** shows status, starts the host,
explicitly stops all its work, and controls start at login. Stop requires a
confirmation. Closing the desktop is not Stop. Starting the desktop again starts
a stopped host, but does not resume interrupted Pi turns.

## Guarantees and limits

| Event | Result |
| --- | --- |
| Window closes, desktop quits or renderer reloads/crashes | Host, Pi work, terminals and enabled Local Access stay alive. Client subscriptions are released. |
| Compatible desktop restarts | Reattaches to the existing host. Application version may differ; wire protocol must match. No prompt replay. |
| Incompatible desktop opens | Refuses agent operations; leaves old host running. A disconnected-state control can explicitly stop the incompatible host before starting the new one. |
| Installing/replacing the app | Stop the host first. Automatic installer execution on desktop quit is disabled. Downloads continue while the desktop is open. Installation currently defers for every running host, even if idle or protocol-compatible, because files and native modules belong to the installed bundle. |
| Host crashes or machine restarts | In-flight work is interrupted. Pi's IPC-disconnect handler aborts/disposes its sessions when possible. The next desktop launch starts a host; it does not replay prompts. Automation recovery follows its existing journal and explicit interruption rules. |
| Machine sleeps or powers off | A local host cannot execute while asleep/off. Timers cannot provide always-online scheduling. |

The host is an Electron background **user-session process**, not a privileged OS
system daemon. Browser tools keep their Electron WebContents in that process;
opening a browser tool window does not require the desktop client. Computer use
still needs a logged-in graphical desktop and the existing OS permissions. It
cannot operate an absent/locked graphical session by pretending to be headless.
PTY shells remain alive detached; terminal UI attachments are client leases.
Dictation capture needs an open client microphone; native dialogs may be shown
by the host without a parent window. Completion notifications currently belong
to the desktop renderer and are not delivered while that UI is closed.

## Ownership and transport

The host uses the original Electron user-data directory and its single-instance
lock. Desktop Chromium data and its separate lock live in `desktop-client/`.
NativePi-owned state, automations and reviews stay at their original host paths;
Pi credentials, configuration, extensions and sessions keep their existing paths.
A second host launch loses the Electron lock before importing the runtime module.
A stale discovery file after a crash does not own a lock or trigger prompt replay.

`background/host.json` contains protocol, app version, PID, ephemeral loopback port
and a random access token. The directory is created with POSIX mode 0700 and file
0600; Windows inherits the user's profile ACL. Do not copy this file into bug
reports. The dedicated `/host` WebSocket binds **127.0.0.1 only**, requires token
and protocol authentication, limits frame size, validates messages with Zod and
runs every operation through `validateHostRequest` again. Its token is never
sent to the renderer. Slow event consumers disconnect rather than accumulating
unbounded socket buffers. Local Access retains its separate opt-in server,
tokens, network/tunnel controls and browser policy; revoking it cannot disconnect
the private desktop transport. No cloud, relay, product account or public bind
is needed for the host.

`SERVICE_PROTOCOL` in `shared/background-service.ts` is a compatibility contract,
not the app version. Increment it when request/event semantics become
incompatible. Authentication permits a mismatched protocol to issue **Stop only**;
normal calls fail. Keep this small administrative envelope compatible. A live
host is never automatically killed or replaced on version mismatch.

Live transcript hydration fences file revision, Pi runtime identity and event
revision, then includes only transient display state (current message, run/queue,
retry, compaction, status/widgets and unanswered questions). It stores no second
transcript. Concurrent writes outside an active turn still return retry; existing
external-session-write guards are unchanged. Graphical extension surfaces use
Pi's existing TUI resync operation.

## Start at login

This is optional and available only in installed builds; installing the app does
not enable it. The host always starts on demand independently of this preference.

- Windows uses Electron's per-user login-item registration with the service args.
- macOS writes a per-user `~/Library/LaunchAgents/dev.nativepi.background.plist`
  with RunAtLoad. It needs no paid signing identity or privileged installation.
- Linux writes `$XDG_CONFIG_HOME/autostart/nativepi.desktop` (default `~/.config`).
  AppImages launch via the original APPIMAGE path so the host owns its mount.

Enabling takes effect at the next graphical login. Disabling removes the next-login
registration and leaves current work running. No automatic crash respawn is
registered, so an explicit stop stays stopped for the current login. Moving or
removing the installed executable requires disabling/re-enabling this option.
OS startup approval, packaged Windows/Linux and actual logout/login remain
platform verification requirements; a development launch cannot verify them.

## Integration boundaries

Independent task-workspace, graphical-extension and review work should keep using
`HostRequests`, `HostEvents`, `HostClient` leases and `invokeHostRequest`. Do not
import `ipc.ts` into the desktop client or allocate Pi from a window lifecycle.
Keep window controls and update installation on the desktop side. New event types
must update the existing schemas; breaking semantic changes bump the protocol.
New UI resources need a host owner or an honest unavailable state while detached.
No unmerged companion worktree APIs are required by this implementation.

## Focused lifecycle verification

After `bun run --cwd apps/desktop build`, run:

```sh
bun apps/desktop/scripts/check-background-service.ts
# Or pass a locally packaged application executable:
bun apps/desktop/scripts/check-background-service.ts /path/to/NativePi/executable
```

This starts real Electron hosts and real Pi against a temporary loopback streaming
model fixture, with isolated NativePi/Pi directories. It checks the host startup
lock, streaming detach/reattach, PTY survival, cancellation, host crash recovery,
no prompt replay and incompatible protocol refusal/explicit stop. It makes no
provider calls and removes its temporary data. It needs a graphical user session;
it does not replace native close/reopen UI inspection, OS login testing, or a
Windows/Linux installer upgrade test.
