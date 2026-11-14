# Work delegates and thread orchestration

A normal Work conversation is a lead. It can use built-in Pi tools to assign
fresh delegates, read history, and operate other Work leads. Chat keeps its
existing profile. These are app-shipped tools, not an extension to install.

## Assigning work

Ask a lead to inspect `orchestration_catalog`, then use `delegate_spawn` with a
label, a self-contained task, and an explicit `configuration`:

```json
{
  "label": "Review session writes",
  "task": "Review the changed session-writing code. Report concrete findings and verification. Do not edit files.",
  "configuration": {
    "provider": "provider-from-catalog",
    "model": "model-from-catalog",
    "reasoning": "off",
    "tools": ["read"]
  },
  "workspace": { "mode": "shared" }
}
```

Use catalog-supported reasoning and optionally `tier: "priority"`. Omitted tier
uses the provider's normal path. Invalid/unavailable models, reasoning, tiers,
and tools fail rather than silently falling back. Configuration is checked in
the delegate's own environment after its normal extensions activate, and is
restored on cold follow-up. A configuration failure is recorded as Failed, with
the task intent retained; opening the transcript does not retry that work. It never changes the lead's or Pi's global defaults.
Tool selection is Pi's exposure mechanism, not a filesystem security sandbox;
trusted extensions and codemode/MCP retain their normal behavior.

Fresh context contains only the task and normal Pi/project instructions,
skills, configuration, and extensions. NativePi copies no parent transcript,
summary, images, attachments, or draft. Follow-ups retain the delegate's own
context. A fresh independent review should use a fresh delegate.

`delegate_spawn` returns acceptance, not a finished answer. Use
`delegate_inspect` to inspect state and `delegate_wait` to subscribe to any/all
selected delegates without polling. A clarification, failure, Stop, or
interruption also releases a wait. Resolving the tool is the only continuation;
NativePi does not schedule a second lead turn. New user instructions release a
lead's wait without stopping its children.

Delegates use `lead_message` for progress or `needsReply: true` for questions.
The recipient is always their own lead. Progress is not completion. Reply with
`delegate_message`; use `replyTo` when multiple questions are pending. A
successful final answer without an unresolved question completes the
assignment. Aborted, errored, length-limited, or missing answers do not count as
success. Completed delegates accept follow-up assignments with the same
configuration. Stopped, failed, or interrupted delegates require `resume: true`
and a new explicit instruction; old tool calls are never replayed.

## Inspecting and stopping

Delegate rows appear beneath their lead and in its activity area. Selecting a
row opens its real Pi transcript. The footer shows actual assignment status,
model/effort/tier, worktree branch where applicable, and a way back to its lead.
An unavailable/deleted lead does not turn a delegate into an ordinary chat.
Unavailable session files disable input; one unreadable history file does not
block healthy threads.

Delegates have no user composer, attachments, suggestions, slash-command
input, or user model/speed controls. Store and host checks also reject forged
submissions. Trusted extensions can still display their own ordinary UI; this
restriction does not create an extension sandbox. Clones/forks have fresh Pi
identities and become independent leads, without adopting historical ownership.

**Stop group** remains available when a lead is idle but owns active work.
Stopping a lead fences pending dispatch and stops its owned delegates, waits,
startup, and queued continuations. Stopping one delegate leaves siblings alone.
Independent peers, including leads it created, are not children in this cascade.
**Finish** only marks an idle group Finished; it refuses running, queued, or
waiting-for-lead work. It never means Stop. History stays resumable.

## Worktrees

Choose `workspace: { "mode": "worktree", "branch": "review", "base": "main" }`
explicitly. Omit `base` to capture the current HEAD commit at spawn acceptance.
NativePi records the resolved base and planned checkout path before Git creates
the worktree, using its existing Git helper. A Stop or crash during creation can
therefore retain a discoverable workspace intent without rerunning creation.
Dirty parent changes, ignored files, dependency directories, environment files,
and services are not copied. Trust/configuration/catalog resolution uses the
actual worktree. NativePi never writes a trust decision automatically.

Worktrees are retained on completion, failure, and Stop. The lead owns review,
integration, prerequisites, and cleanup. There is no automatic merge, rebase,
checkpoint, removal, or history rewrite. Files, Source Control, and terminals
follow the inspected delegate's actual cwd without pinning it as a project.

## History and independent leads

`thread_list`, `thread_search`, and `thread_read` discover/read real Pi history,
including cold and Finished sessions, without starting a model or historical
session process. Discovery uses Pi's normal directories and known custom
storage from opened/pinned/Finished sessions. It does not scan arbitrary paths.
Reads are paginated, bounded, and retain entry IDs and parent/branch attribution;
images are omitted, with tools/thinking included only when requested.

`thread_create` creates an independent named lead. Omitted cwd means No project.
It starts work only with `start: true` and a prompt. It does not switch selection
or consume a user's unsent draft. `thread_message` delivers durable attributed
content to any discovered Work lead's inbox. No linking step is needed and
arrival never wakes, steers, or queues a model turn. `thread_inbox` reads the
calling lead's inbox and reconciles its accepted pending deliveries without
waking recipients. `thread_wake` explicitly supplies selected message IDs;
busy recipients use Pi follow-up semantics. The UI offers the same explicit
resume action. Pending content can also enter the next ordinary user-started
turn, with message IDs/read receipts preventing accidental re-delivery.

`thread_stop`, `thread_finish`, and `thread_delete` operate arbitrary discovered
Work leads. Self-delete is rejected. Deletion stops/fences the group and deletes
only the requested Pi session through ownership/conflict checks. Successful
deletion cleans its UI references; failures retain them. Child transcripts and
worktrees survive with an unavailable-lead relationship.

## Persistence and recovery

Pi owns models, tools, execution, and transcripts. NativePi stores versioned
coordination facts and attributed custom messages in the owning Pi sessions,
using the same write leases, binding checks, and external-change protection as
ordinary app operations. NativePi's state file contains only UI organization;
queued host transforms and increasing revisions prevent stale desktop/browser
saves from undoing Finish or pinning changes. Finish rechecks group activity
inside that queue; a busy refusal is not a failed disk save.

Sender intent precedes inbox receipt and acknowledgment. Accepted, delivered,
supplied-to-model, and completed are distinct. Partial delivery remains pending
and inspectable; do not blindly resend with a new ID. Duplicate transport
requests reuse their operation ID. Unknown/corrupt records remain in Pi history
and are not executed. Copied records do not confer ownership on new sessions.

After restart, accepted content, relationships, workspaces, and durable outcomes
remain available. Unfinished assignments project as Interrupted. Nothing
implicitly restarts models or shell work. Explicitly resume with a new
instruction. A partial spawn/wake is never automatically rerun.

All delegate runtimes use the existing Pi lifecycle. Pending requests/waits and
active groups are protected from reclamation; completed hosts can be reclaimed.
Project restart includes owned worktree delegates. IPC/host loss aborts/disposes
the child and settles credential writes. Usage comes from real Pi assistant
entries, with delegate cwd/model attribution and no parent-group double count.
Diagnostics record operation IDs and transitions, not prompts or message text.
