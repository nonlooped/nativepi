# Local code review

Source Control → **Review changes** starts an independent Pi conversation. The
normal scope is all uncommitted changes: the combined HEAD-to-worktree diff plus
untracked files. Advanced scopes are staged changes, a selected file (combined
staged and unstaged changes), and committed branch changes from the merge base
of an explicit base ref to HEAD. Branch scope excludes uncommitted changes.

The last run's model, reasoning, speed and shell permission are saved per
canonical checkout. Model/authentication configuration remains Pi-owned. Priority
uses the existing service-tier channel and rejects unsupported providers. A
reviewer has Pi read, grep, find and ls tools. Editing tools, automatic extension
loading and NativePi app-tool injection are disabled **for this reviewer only**;
normal Work sessions retain third-party extension support. These read tools are
not a repository filesystem sandbox. Project trust is required to start a run.

Shell checks are opt-in. Shell is unsandboxed and can modify files or access the
network; the instruction to avoid edits is behavioral guidance. Commands, tool
output and known exit status come from actual Pi tool events, not model-written
claims. Unknown exits remain unknown. The ordinary Pi conversation contains the
full tool evidence. The independent reviewer can read existing image evidence;
with shell permission it can invoke available native/browser tooling. The app
does not claim a visual check occurred just because a review completed.

Existing cached repository-host context (PR description, comments and checks
when available) is included as context. Its freshness is the existing repo-host
cache's responsibility; it is not newly executed local evidence. There is no
new CI poller, account, infrastructure or telemetry.

## Results and verification

A host job survives renderer navigation. Only one review runs per canonical
checkout. Stop aborts the owned Pi process; restart leaves incomplete jobs
interrupted and never replays them. Running, completed with findings, completed
without findings, failed and interrupted are distinct from not reviewed.
Completion is neither passing checks nor human acceptance.

Each job retains its exact bounded patches, content fingerprints, skipped-file
reasons and Pi session reference. Inputs are limited to 100 files, 80,000
characters per diff and 240,000 characters total; oversized/binary/unsupported
inputs are skipped, not silently truncated into reviewable inputs. Command
summaries retain the final 16,000 characters; full tool output belongs to Pi.
The last 50 jobs and 100 legacy per-file session references are retained.

Input changes are shown separately from current finding anchors. Findings keep
the original numbered code and hunk evidence. An anchor remains current only
when the exact numbered range matches a current staged or unstaged diff. Moving
identical code into the index transfers that anchor; unrelated HEAD changes do
not invalidate it. The app conservatively keeps shifted or missing anchors stale
rather than guessing a relocation. Identical file/side/code/body feedback reuses
the original finding and preserves its state. Earlier concerns never disappear
or resolve merely because a later generic review returns no findings.

Findings default to **This file**, with **All files** available explicitly.
Selecting another file's finding opens its diff; current selected ranges are
highlighted. **View original diff** shows retained hunk evidence when current
code no longer contains the anchor. Original evidence is not presented as current
code. Branch findings may only have a current anchor once the code is also part
of a current working/index diff; their original hunks remain inspectable.

**Request fixes** requires a target Work chat and prepares an editable draft.
The person sends it. **Verify fixes** starts a fresh independent run with the
selected issue IDs and original concerns. Every named issue must receive one
fixed/persists/uncertain verdict with fresh evidence; malformed or incomplete
output fails the run. Verification retains current file fingerprints, including
when no diff remains. Verdicts remain in run history and never change human
acceptance automatically. File fingerprints and captured patches mark evidence
stale after subsequent changes. Repository reads during a run use live files,
not an isolated snapshot; inspect the transcript and re-run after concurrent edits.

## Host and integration boundaries

`reviewJobs`, `reviewStart` and `reviewStop` are small HostRequests shared by
Electron and Local Access. Renderers refresh these snapshots; no renderer owns
execution. `reviewList`, `reviewSnapshot` and `reviewUpdate` manage findings.
Review metadata is NativePi UI data; Pi JSONL files remain transcript authority.
No config/auth/session file formats are rewritten. Metadata updates retain
optimistic external-write checks and compare again before atomic replacement;
this is not a cross-process lock against arbitrary external writers.

Reviewer results merge against latest finding metadata using immutable captured
patches, so unrelated finding-state changes do not discard completed results.
External conflicts fail visibly and retain Pi evidence instead of blindly
replacing another writer. Multi-file persistence is per file, not an atomic
repository transaction: a failure can leave partial findings, with the run marked
failed and its Pi transcript retained.

PR #102's extension lifecycle should preserve the reviewer-specific tool profile;
#103's managed workspace selection must pass the actual checkout cwd; #104's
independent host should own the ReviewJobs instance and shutdown lifecycle.
These interfaces do not depend on any of those unmerged PRs. No PR is merged here.

Design reference: OpenAI's [Code review documentation](https://learn.chatgpt.com/docs/code-review)
for explicit review scopes, independent review conversations and separation of
review feedback from staging and human acceptance.
