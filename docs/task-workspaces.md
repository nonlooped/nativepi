# Managed task workspaces

Start a Work chat, choose a project, and explicitly select **Use checkout**
for shared work or **New worktree** for an independent task. Isolation creates
an ordinary Git branch and worktree beside the repository. Enter the starting
base (`HEAD`, a local branch, or an already fetched `origin/main`). NativePi resolves
it to a commit before creation. It does not fetch, stash, copy dirty changes or
rewrite history. Non-Git folders and No project still support ordinary chats.

The **Workspaces** button beside the branch switcher reopens the same inventory.
Git's real worktree list supplies discoverability, including externally created
worktrees. Existing folders can host chats without being adopted or removed.
New delegate and automation worktrees are registered here with their owner type;
shared/read-only work remains shared. A registry entry describes a folder, not a
new conversation or execution runtime. Chats continue to use real Pi sessions.

## Prepare, run and check

**Project actions** saves a local setup, foreground run, and check command per
repository. Review and save the commands, select a managed worktree, then explicitly
authorize execution. This consent executes your shell with your existing environment;
it is not a sandbox and does not grant Pi project trust. Each new worktree still
passes through the existing project trust flow when starting Pi. No scripts are
loaded from repository content or executed automatically on creation or restart.
An empty setup action marks a workspace ready without installing anything.

Dependencies, generated configuration, databases and services belong in the
project's own commands. NativePi does not guess a package manager, copy dependency
trees or symlink them between tasks. Output is bounded to the last 64 KB and may
contain secrets printed by your commands; do not print credentials. The latest
completed output and status are stored locally with the lifecycle metadata.
Failed actions retain their folder and show output/error. **Prepare / retry** runs
setup again; make setup idempotent. **Stop action** terminates the owned process
group (Windows uses taskkill's process tree). Normal app shutdown stops owned
actions. After an unexpected shutdown, unfinished actions show Interrupted and
never resume automatically. Inspect surviving processes and filesystem state
before retrying. Setup and retirement fence conflicting NativePi agent/editor/
terminal operations; unrelated workspaces remain available.

Ignored-file preparation is opt-in for each execution. Expand the local environment
section and enter exact relative ignored file paths, one per line. This can copy
secrets: nothing is selected by default or inferred from patterns. Only regular
ignored source files within the primary checkout are accepted. Source symlinks,
traversal, `.git`, escaping destination parents and existing destination files
are refused. Destination parent folders must already exist. A partial copy or
failed setup is retained for inspection; retry never overwrites files.

Each action receives `PORT` and `NATIVEPI_WORKSPACE_PORT`. NativePi selects an
available loopback port, avoids other registered workspace assignments, and
rechecks availability when running an action. Configure your server to honor
one of those variables. These are advisory assignments, not socket reservations:
an external process can claim a port between checking and server startup. The
next retry selects another available port. Commands must keep services in the
foreground; detached daemons and externally launched services are not tracked.

## Review, handoff and retirement

Start/resume the normal Pi chat in the workspace. Use existing Source control,
terminal, browser and PR handoff surfaces to run the task, inspect diffs, commit,
and push. NativePi does not automatically integrate or delete task branches.

**Retire…** performs a preflight and reports blockers. Folder removal requires an
explicit confirmation and repeats the checks immediately before `git worktree
remove`, without force. Active agents/automations, live NativePi terminals,
unsaved editors in any open NativePi window, running/interrupted actions, dirty/untracked/**ignored** files,
and commits not reachable from local remote-tracking refs prevent removal.
Dependency installations and local environment files therefore require deliberate
manual preservation/removal first. Branches and native Pi transcripts are retained.
Primary and unmanaged checkouts are never offered for managed removal.
External editors, Git commands and detached services cannot be fenced by NativePi;
close them and verify remote state before retiring. No background garbage collection,
branch deletion, prune, force removal, stash, rebase or history rewrite is used.

## Developer integration

`TaskWorkspaces` owns versioned, Zod-validated `task-workspaces.json` under app user
data: folder intent, base commit, owner type, action status/output, ports and project
recipes only. Atomic serialized writes protect host-local concurrent updates.
Unreadable/corrupt metadata fails closed rather than overwriting it. This does not
modify Pi credentials, settings, extensions or session records. The existing
`gitAddWorktree` allocation path remains the Git implementation. Delegate and
automation adapters register successful allocations but do not automatically run
recipes or copy files. Their existing session ownership and scheduling stay intact.
Future background-host/workspace changes should call this small registry surface,
retain explicit action consent, and use the preparation fence rather than creating
another task/session model. External worktrees remain discoverable without adoption.

The interaction was informed by primary [Conductor script documentation](https://www.conductor.build/docs/reference/scripts),
[Conductor's first workspace guide](https://www.conductor.build/docs/first-workspace),
and [ADE's task/worktree/chat/PR workflow](https://ade-app.dev/). NativePi retains
its own Pi-only runtime, explicit local execution and conservative cleanup boundaries.
