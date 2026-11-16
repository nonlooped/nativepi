# Scheduled and event-triggered Work

Settings → Automations creates explicit persistent automation intent.
NativePi must remain running; there is no background daemon or remote execution.
Each accepted run gets a fresh ordinary Pi Work session, configured through the
same Pi host as manual work. Third-party extensions remain available when selected.
No manual conversation or interrupted run is resumed automatically.

Choose a pinned project or No project, shared folder or a new retained Git
worktree, exact provider/model, reasoning, service tier and allowed tool names.
Pi validates the configuration before dispatch; unsupported settings fail without
substitution. Worktrees start from the committed local base, without copying dirty
files or installing dependencies. Users own integration and cleanup. Tools have
normal local permissions; this is not a sandbox. External review/check content is
identified as untrusted in the dispatched prompt.

Once uses an absolute ISO instant. Daily and weekly use an IANA timezone and wall
clock minute. DST gaps skip that day's missing time; repeated minutes run once.
The host checks time every 15 seconds. Deadlines over five minutes old are recorded
as skipped and advanced to the next future slot, with no catch-up burst.

GitHub watches explicitly authorize one owner/repository and PR number or head
branch through the user's authenticated `gh`. Every two minutes, a bounded 30-second
repository-host command reads the PR head, checks and submitted reviews. The first
successful response establishes a baseline without edits. New failed check
revisions and submitted review feedback carry the exact PR URL, head commit,
check details and review commit/body into the transcript and run journal. This is
PR-based CI watching, not watching arbitrary branch workflow runs without a PR.
Reconnect compares against the persisted baseline, coalescing new events into one
run. Consumed events are written before dispatch; no automatic retry follows a
failed, interrupted or skipped dispatch. Old review history is bounded to prevent
unbounded journal growth. Editing the watched target establishes a new baseline.

One automation runs at a time. Busy project writers cause a recorded skip instead
of queued work; manual sends and Git mutations are rejected while the automation
owns their workspace, retaining the renderer draft. Pause, edit and delete stop
active work first. Stop fences preparation and the owned Pi group, including any
delegates. Run now is an explicit one-off even when paused. Three consecutive
poll/dispatch/model failures pause future dispatch until explicitly enabled again.

The journal distinguishes preparation, dispatch, failure, skip, stop, interruption,
and a turn needing review. A Pi result is never labeled task success. Open the
linked ordinary transcript to inspect the work, tools, validation, partial edits,
and clarification requests. Restart marks unfinished runs Interrupted and never
replays them. The local journal retains up to 1,000 outcomes; Pi transcripts and
retained worktrees are not deleted when an automation is removed.
