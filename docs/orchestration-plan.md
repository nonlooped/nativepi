# Subagents and thread orchestration implementation plan

Status: implemented; see [Using orchestration](orchestration.md).

Implementation spans the shared contracts, main coordinator/service/history,
private Pi bridge, host organization operations, and ordinary conversation UI.
The phase gates and verification matrix below remain the design and regression
reference. Focused fake-runtime, pinned-Pi, real-Git, session/state, and DOM
checks cover the implementation. Live provider calls and running-app visual
review are manual validation; neither is required by the automated suites nor
performed by starting the app unasked. Launch regressions additionally check
Electron-main ESM output with Node without launching the application; fresh
identity binding is exercised against pinned Pi RPC `--session-id`.

This plan implements NativePi's first complete orchestration feature: a thread's lead can assign work to delegates, communicate with them, and operate other threads through built-in Pi tools. Delegates use Pi's runtime, model catalog, authentication, extensions, tools, and session files. NativePi supplies coordination and the graphical workflow.

## 1. Product contract

The following decisions were agreed during the feature interview:

1. Each ordinary thread has a lead. Only leads spawn delegates; delegates cannot spawn delegates.
2. The lead selects a delegate's model from the user's available catalog, reasoning effort, supported service tier, task prompt, and tools. NativePi does not choose task-specific permission profiles or decide which working tools the lead should assign.
3. A delegate starts with no parent conversation history. Its task comes from the lead's prompt. Follow-ups retain that delegate's own conversation. Independent work, especially an independent review, should usually use a fresh delegate.
4. A delegate shares the lead's working directory by default. The lead can explicitly request a worktree instead.
5. Delegate conversations use the normal chat viewer. Users can inspect and stop them, but there is no composer for talking to a delegate.
6. Delegates can message their own lead. Progress messages, requests for a reply, and assignment completion have different meanings. A request for a reply makes a settled delegate wait for its lead; a final answer completes its assignment. The lead can follow up in either state.
7. A delegate result can resume a lead waiting for that work. A message from another thread enters an inbox; waking that thread is a separate, explicit action.
8. Leads can discover and message other thread leads, read older threads, and create, delete, stop, or finish threads. There is no thread-linking concept or prerequisite. Historical lookup is useful independently of orchestration.
9. Stop on a lead stops its running delegates and cancels pending automatic resumptions. Stopping one delegate leaves its lead and siblings alone.
10. Finishing a thread means marking it Finished. It preserves history, remains resumable, and refuses while that thread or its delegates are working. It does not stop work.
11. After a crash or restart, transcripts, relationships, and accepted pending messages survive. Interrupted work requires explicit resumption; NativePi does not automatically restart model or shell work.
12. The lead owns integration and cleanup of worktree work. Completion does not automatically merge changes or remove worktrees.

### Implementation defaults, distinguished from agreed requirements

Use these defaults unless implementation review identifies a reason to change them:

- Ship the orchestration tools in Work, including project-free Work. Preserve Chat's existing profile; do not let Chat acquire work or thread-mutation capabilities as a side effect. Historical lookup can be added to Chat separately without changing that profile.
- Fresh delegates load normal Pi configuration, applicable project instructions, skills, and extensions for their working directory. “No parent context” means no copied parent transcript, summary, attachments, draft, or automatically synthesized handoff. It does not mean an empty Pi system prompt.
- Reject unavailable models, unsupported reasoning levels, unavailable requested tiers, and unknown tools with actionable errors. Do not silently substitute settings. Omitted tier means the normal/default provider path; providers without selectable tiers still work normally, but reject an explicit Priority request. A tier expresses the provider option NativePi supports, not a guaranteed throughput or response time.
- Spawn returns promptly after durable setup and acceptance of the first task. Waiting is explicit. An unrelated idle lead is not automatically woken by a delegate simply because it exists.
- Follow-ups keep the delegate's original model, reasoning, tier, and tool selection. Choosing a different configuration creates a fresh delegate in the initial version; there is no extra reconfiguration workflow.
- Thread creation can create an idle thread or explicitly start one with an attributed task. It creates another lead, not a delegate. Its lifecycle is independent of the lead that created it.
- Deleting a lead does not implicitly delete delegate transcripts or worktrees. Stop its group first, delete the requested session through the existing protected path, and retain children with a “lead unavailable” relationship. Broader deletion is an explicit operation on each target.
- Discover standard Pi history with Pi's discovery API, plus configured/known custom session directories. Do not scan arbitrary filesystem locations. Thread mutation remains within the app's Work destination and Pi session ownership checks.
- Do not add product budgets, arbitrary concurrency caps, automatic model routing, automatic retries of assignments, or permission dialogs solely for this feature. Pi retains its own retry behavior. Report resource and startup failures honestly.

## 2. Existing implementation to extend

| Area | Current code | Consequence for this feature |
| --- | --- | --- |
| Pi process creation and ownership | `apps/desktop/src/main/pi/client.ts`, `apps/desktop/src/main/ipc.ts` | Reuse Electron's fork and session binding, readiness, revision checks, retirement, and shutdown paths. |
| Pi host and built-in tools | `apps/desktop/src/main/pi/host/entry.ts`, `appTools.ts` | Add tools and attributed message delivery through Pi APIs. Do not implement another agent loop. |
| Child-to-main requests | `pi/host/artifacts.ts`, `pi/client.ts` | The fork already has a Node IPC channel. Add a typed orchestration namespace on that channel rather than embedding control messages in assistant text. |
| Models and speed | `main/chatTitleModels.ts`, `shared/pi-values.ts`, `shared/service-tier.ts`, `pi/host/serviceTier.ts` | Reuse runtime catalog data, supported thinking levels, and the installed service-tier support. Do not copy the title model's automatic selection/fallback policy. |
| Session discovery and history | `main/sessions.ts` | Extend the existing Pi-backed listing/search/read implementation with bounded, paginated agent-facing results. |
| Finished and Focus organization | `renderer/lib/store/chat.ts`, `main/state.ts`, `shared/rpc-schema.ts` | Today Finished is renderer-owned mutation of persisted UI data. Move affected organization mutations behind the host before tools can finish threads. |
| Desktop and browser transport | `shared/request-params.ts`, `shared/host-events.ts`, `preload/index.ts`, `main/localServer.ts`, `renderer/lib/rpc.ts` | Reuse the same validated host contracts and events for both clients. Coordination must not require a mounted desktop renderer. |
| Conversation UI | `renderer/App.tsx`, `components/Transcript.tsx`, `components/Sidebar.tsx`, `components/SessionMenu.tsx`, `renderer/lib/store/` | Reuse the viewer, streaming reducer, hydration, navigation, and right-click management patterns. |
| Git worktrees | `main/git.ts`, `components/WorktreeDialog.tsx` | Reuse the existing worktree helper. Extend its base-ref support where needed; do not introduce another Git orchestration subsystem. |

The checked-in dependency versions are Pi coding agent, Pi AI, and Pi TUI 1.5.2. The installed Pi APIs already include custom entries/messages, supported model discovery, tool loadouts, `agent_before_settle`, `agent_settled`, and global session discovery. No Pi upgrade is a prerequisite. Verify against the pinned package while implementing rather than relying on documentation for a newer version.

## 3. Architecture and module responsibilities

Keep one orchestration coordinator in Electron main. It owns only NativePi coordination: delegate relationships and assignment identifiers, wait subscriptions, message routing, cancellation generations, and projections reconstructed from Pi records. It does not own a second transcript, provider runtime, tool executor, or general Pi session model.

The alternative of placing the coordinator in the lead's Pi process makes peer routing, app restart, Stop, and cold-session delivery depend on the lifetime of a single lead. A coordinator in the renderer would also fail when switching clients or disconnecting browser access. Main already owns the relevant processes and is the smallest appropriate boundary.

### Proposed source layout

These are implementation locations, not requirements to create a module for every helper:

| File or area | Responsibility |
| --- | --- |
| `shared/orchestration.ts` | Versioned Zod schemas and inferred types for references, assignments, messages, snapshots, and fork IPC envelopes. |
| `main/orchestration/coordinator.ts` | Role-checked operations, assignment transitions, waits, delivery, stop/finish ordering, and recovery reconciliation. |
| `main/orchestration/records.ts` | Parse NativePi custom entries and build coordination projections. No file-writing implementation and no Pi transcript reducer. |
| `main/orchestration/history.ts` | Bounded agent-facing discovery/search/read over existing session services. Keep it usable without spawning delegates. |
| `main/pi/host/orchestration.ts` | Pi tool definitions, role instructions, local loadout initialization, custom-entry/message handling, and settled-run outcome reporting. |
| `main/pi/host/orchestrationChannel.ts` | Cancellable, request-correlated child IPC calls and incoming host operations. Keep this private to NativePi. |
| Existing `main/ipc.ts` and `main/pi/client.ts` | Wire the coordinator into actual session operations, validated child IPC, event forwarding, idle protection, and app shutdown. |
| `renderer/lib/store/orchestration.ts` | Zustand projection and actions for snapshots, delegate navigation, stop/resume, and inbox display. |
| Existing conversation components, with a small delegate summary/inbox component if useful | Present actual Pi chats and the additional coordination data. |

Give the coordinator a small adapter implemented next to existing runtime ownership code: create/reacquire a particular Pi session, perform a guarded session operation, stop a runtime, obtain history/organization data, and publish an event. Retain the revision and binding machinery behind that adapter. If extracting those operations into a runtime module is necessary, move only that cohesive boundary and preserve its regression coverage; do not refactor all of `ipc.ts` first.

Do not call renderer-oriented `invokeHostRequest()` with a fabricated desktop client from an agent tool. UI requests and agent requests should call the same internal operations, with their real caller identity and their own transport lifetimes.

## 4. Identity, state, and session ownership

### References and generations

- A thread reference resolves to a real Pi session header ID, owning working directory, and canonical session file. Do not use a display title or caller-supplied path alone as identity.
- Each delegate relationship records the lead session identity and the delegate's own session identity. Pi's `parentSession` header alone is insufficient: forks also have parents.
- Each assignment has an `assignmentId`. Every initial task or follow-up accepted after a completed assignment creates a new assignment; replies to a pending clarification continue the existing assignment.
- Every live execution carries the actual runtime/binding generation and the group's cancellation generation. Every wait, startup, delivery, and completion checks these before committing a live transition.
- Each accepted operation and message has a stable ID. Use the originating session, tool-call ID, and action to identify a retried tool invocation; transport request IDs only correlate wire replies.
- Resolve the actor from the bound Pi process in main. A tool may identify its target, but cannot claim to be another lead or supply its own trusted role.

### Three separate meanings of state

Do not put every status into Pi's existing running flag:

1. **Pi runtime state:** starting, running, settled, unavailable. Pi remains authoritative.
2. **Delegate assignment state:** preparing, running, waiting for lead, completed, stopped, failed, interrupted. This is NativePi coordination over a specific assignment.
3. **Thread organization:** Focus/Finished and pinned state. This remains NativePi UI metadata, independent of whether a particular model turn ended.

An ordinary final answer does not automatically mark the lead thread Finished. A completed delegate can remain available for follow-up without its process staying alive forever.

| Assignment transition | Trigger and result |
| --- | --- |
| Preparing → Running | Correct session/configuration recorded and the first task accepted. |
| Running → Waiting for lead | A reply-request message exists for this assignment and Pi settles successfully without an accepted reply continuing it. Trailing assistant text is not completion. |
| Running → Completed | Pi settles successfully with a final answer and no unresolved reply request or queued continuation for this assignment. |
| Waiting for lead → Running | The lead submits a correlated reply. Preserve the same assignment and the delegate's own context. |
| Completed → Running | The lead gives follow-up work; allocate a new assignment ID and retain delegate context. |
| Stopped/Failed/Interrupted → Running | The lead explicitly requests resumption with a new execution attempt. Preserve transcript/context, but never replay old tool calls or automatically restart cancelled siblings. |
| Preparing/Running/Waiting → Stopped | Explicit Stop fences future dispatch and aborts/cancels current work. |
| Preparing/Running → Failed | Startup/configuration failure, or Pi exhausts its own retries and settles with an error. Preserve the actual error and any partial transcript. |
| Unfinished state → Interrupted | An unexpected process death or app/runtime restart prevents reliable continuation. No automatic rerun. |

Do not call a length-limited, errored, aborted, or missing final answer successful completion. Report a recoverable failed/interrupted outcome with the actual stop reason. An explicit resume is a new execution attempt, not a replay of prior tool calls.

## 5. Durable records without another conversation store

Persist coordination facts as versioned NativePi custom entries in Pi session files, written by their owning Pi process through Pi APIs. Attributed agent-to-agent content enters context as Pi custom messages. Do not persist a coordination database or put messages/tasks into `state.json`.

Use one namespaced custom entry family, for example `nativepi-orchestration`, with a discriminated `kind`. The schema should cover:

- Session role and verified lead/delegate relationship, scoped to actual Pi session IDs.
- Spawn intent, allocated child session, accepted assignment/configuration, and startup outcome.
- Assignment transitions and references to the assistant entry containing its result.
- Durable message envelope/outbox intent, recipient receipt, and consumption/delivery acknowledgment.
- Wait registration/cancellation, group Stop, interruption, and explicit resume.

Record only coordination data. Refer to existing assistant/tool entries for full results and usage instead of storing copies of entire transcripts. A message envelope may retain its own bounded content because that content is necessary to deliver an accepted message.

The shared schemas should make these minimum fields explicit:

- **Relationship:** schema version, operation/relationship ID, lead and delegate session references, label, workspace mode/path, optional worktree branch/base, and accepted configuration.
- **Assignment:** assignment ID, delegate reference, originating task message ID, execution attempt, state, pending question IDs, optional final assistant-entry reference, and the actual error/stop reason.
- **Message:** schema version, message/operation IDs, source and destination references, kind (task, follow-up, progress, reply request, reply, result, or peer message), optional assignment/reply-to references, timestamp, and bounded content. Main derives source/role from the process rather than trusting claimed envelope fields.
- **Live snapshot:** host sequence/revision, session reference, role/lead reference, actual runtime state, current assignment summaries, group activity, and inbox counts. Runtime handles, AbortControllers, and pending Promise callbacks never enter persisted schemas.

For replies, require a question reference when more than one question is pending; an uncorrelated follow-up cannot accidentally resolve a different question. Unknown schema versions remain preserved in Pi history but are not executed or adopted as valid live ownership.

`state.json` continues to hold NativePi UI metadata such as thread organization and collapsed delegate groups. In-memory maps and optional invalidatable caches are projections, not durable authorities.

### Delivery protocol and recovery guarantees

There is no atomic transaction across two session files. Design for acknowledged, deduplicated delivery rather than claiming exactly-once model execution:

1. Append the sender's durable message intent before reporting acceptance.
2. Resolve the recipient and check the current binding and cancellation generation.
3. Append an inbox receipt containing the same `messageId` in the recipient session before acknowledging delivery.
4. When actually supplying the message to a model, use an attributed custom message whose details contain that ID. Check existing receipts/custom messages before repeating an append.
5. Record delivery/consumption acknowledgment. If a reply is lost, a retry can reconcile against the recipient's existing record.

Distinguish accepted, delivered-to-inbox, supplied-to-model, and response-completed. None implies the next. If the recipient is externally changed or unavailable, preserve the accepted sender record and return/show pending or failed delivery rather than silently dropping the message.

On restart, read relevant Pi records without starting models. Reconcile partial spawn/delivery records, preserve inbox contents, cancel live wait subscriptions, and project unfinished work as Interrupted. Do not replay an ambiguous spawn, shell operation, wake, or assignment. Pending delivery can be reconciled as inbox data; executing pending work requires explicit resumption. If the receiving session already contains a durable completion but its notification was lost, show that completion without rerunning it.

Use Pi's session writer and NativePi's existing write lease, binding generation, revision observation, and external-change checks for all app-originated appends. Do not open the same file in a second writer just because the destination process is idle. Serialization is per session; never hold one session's mutation lease while awaiting another session's model turn or an inter-thread reply. This also prevents two leads messaging each other from deadlocking.

### Forks, clones, compaction, and external tools

- Compaction must not lose the relationship or inbox projection; reconstruct from custom records rather than from the current model-context summary alone.
- History navigation never re-executes recorded orchestration effects. A record copied into a new Pi session is historical unless its embedded session identity matches the real session and it is explicitly initialized for that session.
- App clone/fork creates a new independent lead by default. Do not inherit live delegate ownership, wait subscriptions, cancellation generations, or pending wakes. Keep old orchestration entries as readable history.
- Opening a delegate session through the Pi CLI remains possible. NativePi's no-composer behavior is an app workflow, not a security sandbox around the file or CLI.
- External session changes use existing reload/conflict handling. An external change must not be acknowledged as a successful app-owned write by a stale completion callback.
- A missing lead or child becomes an unavailable reference, never a reason to fabricate a replacement session or erase surviving history.

## 6. Built-in tool contracts

Tool names below are proposed public names. Finalize the names and descriptions together before implementation so prompts, schema tests, and UI rendering agree. All operations return structured details alongside concise text; errors include a stable code and an actionable explanation.

Use a shared error vocabulary such as `not_found`, `wrong_role`, `not_owner`, `unsupported_configuration`, `unavailable_tool`, `busy`, `stopped`, `external_session_change`, `delivery_pending`, `startup_failed`, and `interrupted`. Preserve relevant session/message/assignment references in the result. “Pending delivery” is an accepted operation with incomplete delivery, not an instruction to blindly resend with a new message ID.

### Catalog and delegates

| Tool | Inputs | Behavior |
| --- | --- | --- |
| `orchestration_catalog` | Optional target working directory and model/tool filters | Returns Pi-available provider/model IDs, supported reasoning and tiers, and available tool names/descriptions/exposure. No credential material. |
| `delegate_spawn` | Label, task prompt, explicit provider/model, reasoning, requested tier (default if omitted), tool selection, workspace choice | Creates a fresh child Pi session, records its relationship/configuration, starts one assignment, and returns delegate/session/assignment references and actual cwd. |
| `delegate_message` | Delegate ID, content, optional reply-to message ID, explicit resume flag when required | Replies to a waiting delegate or gives follow-up work. A busy delegate receives a Pi follow-up rather than concurrent execution. A stopped/failed/interrupted delegate requires `resume: true`; an ordinary message cannot silently undo Stop. Return whether the message is queued or accepted for execution. |
| `delegate_inspect` | Optional delegate IDs, bounded transcript options/cursor | Returns only this lead's delegates, assignment states, pending questions, result references, errors, configuration, and workspace. Transcript reads reuse Pi history. |
| `delegate_wait` | Delegate/assignment IDs, any/all completion condition, optional timeout | Waits for a relevant change without polling. A question needing the lead, failure, Stop, or interruption also breaks the wait even when waiting for all completions. |
| `delegate_stop` | Delegate ID | Stops that delegate's active/queued assignment work and prevents stale automatic continuation. Keeps history and workspace. |
| `lead_message` | Content and `needsReply` boolean, optionally reply correlation | Delegate-only. Sends progress or requests an answer from its own lead. Caller cannot choose another lead. |

Spawn configuration is local to the child. Never change the lead's model, global Pi defaults, favorites, speed, or active tool set when configuring a delegate. Validate using the child runtime after its providers/extensions activate, since a worktree or other cwd may have a different inventory. Preflight in the lead is useful but not authoritative for the child's environment.

Apply the lead's chosen Pi tool loadout, including third-party tools, using Pi's supported APIs. Report actual declared/callable exposure; `setActiveTools()` is not a filesystem permission system, and Pi's codemode/MCP exposure can make tools callable beyond the directly declared set. Do not advertise stronger restrictions than Pi provides, introduce hand-built tool execution, or add app-selected read-only profiles. Only the agreed orchestration topology is structural: app delegate-spawn and thread-management requests require a lead actor even if attempted indirectly through another tool. Every delegate receives the own-lead communication primitive as part of its orchestration protocol.

Validate selected tools after extension startup and on runtime reconstruction/reload. If a chosen tool disappears, report the mismatch and keep the assignment stopped rather than widening or silently replacing its configuration. Extensions remain trusted code and retain their normal UI, provider registration, tools, and execution behavior.

### Thread history and management

| Tool | Inputs | Behavior |
| --- | --- | --- |
| `thread_list` | Scope/cwd, optional state filter, cursor | Discover ordinary Work threads, including cold and Finished threads. Include actual running/group state and unread inbox counts. No linking step. |
| `thread_search` | Query, scope/cwd, cursor | Search titles and user/assistant transcript text. Return bounded excerpts, thread/session references, and matched entry references where available. |
| `thread_read` | Thread ID, branch/entry range, cursor, content options | Read bounded historical context without booting a Pi process or waking the lead. Preserve attribution and disclose branch boundaries/truncation. |
| `thread_create` | Title, project directory or No project, explicit model/reasoning/tier, optional prompt and explicit start | Create a normal independent lead session. Do not steal a project's unsent draft or switch the user's selection. Starting requires an explicit start request with content. |
| `thread_message` | Target thread ID, content | Durably enqueue an attributed message in that lead's inbox. Never implicitly start, steer, or queue another model turn. |
| `thread_inbox` | Optional message IDs/cursor | Read the calling lead's own pending messages and delivery state without starting additional work. |
| `thread_wake` | Target thread ID and selected pending message IDs | Explicitly supply selected inbox content and request a turn. If busy, use Pi follow-up semantics; do not interrupt an executing tool. |
| `thread_stop` | Target thread ID | Stop that lead and its delegates, including pending startup/wait/automatic-resume work. |
| `thread_finish` | Target thread ID | Host-owned Mark finished operation. Refuse while group work or accepted queued continuations remain. Preserve transcript and workspace. |
| `thread_delete` | Target thread ID | Stop/fence its group, use existing protected session deletion, and remove the requested thread's UI metadata after success. Preserve unrelated and child transcripts/worktrees. |

Thread references may identify any discoverable Work lead; no ownership grant or relationship graph is required to operate a peer. A lead created by `thread_create` is a peer, not a child covered by its creator's Stop cascade. Delegate operations require actual ownership by the current lead. Thread-list/search should distinguish delegates as children rather than offer them as peer leads.

Reject self-delete and deleting an ancestor through a delegate, rather than killing the caller before it can return a meaningful result. Finishing any currently running target, including the caller, fails the same busy check; there is no hidden deferred Finish. Do not add a new blanket confirmation workflow to agent thread tools. Existing user-facing deletion confirmations remain intact.

Inbox arrival alone does not enter an in-flight model call. Pending messages can be read explicitly, selected by `thread_wake`, or supplied on the recipient's next ordinary user-started turn without creating an additional turn. Preserve message IDs so manual inbox reads and subsequent contextual delivery do not duplicate content unintentionally. A wake can return a Finished thread to Focus as part of explicit resumption; arrival alone cannot.

## 7. Pi host bridge and initialization

1. Extend the existing fork IPC channel with distinct, Zod-validated orchestration request/reply/cancel envelopes. Keep it separate from the artifact namespace and normal Pi stdout RPC. Unknown or malformed messages cannot reach arbitrary host methods.
2. Add a request router in `PiProcess` that forwards only orchestration operations to the coordinator. Account for these pending requests in idle-reclamation protection, and reject/cancel them on channel close or process exit.
3. Add narrow main-to-child operations for initialization, appending orchestration entries, injecting attributed messages, obtaining active catalog/loadout information, and arming/disarming assignment observation. Verify the currently bound session identity on each operation.
4. Use a distinct launch ID and Pi's `--session-id` support for each new agent-created session. The existing `new:<projectDir>` draft key must remain reserved for the user's draft: two simultaneous spawns and an unsent composer must create three distinct sessions.
5. Install role/bootstrap information before the first model turn. Persist it in the session, validate it on each rebind, and configure the child through existing Pi model/thinking/service-tier APIs before accepting its task.
6. Register lead tools and delegate tools through `appTools.ts`. Add role-specific instructions about fresh context, progress/questions, completion, follow-ups, waiting, and worktree integration. Use Pi's supported prompt sections/guidelines where practical; avoid replacing the whole system prompt for every update.
7. Deliver agent-authored work as attributed custom messages through Pi's `sendCustomMessage`/extension `sendMessage` mechanisms. It must not pretend to be a human message or accidentally invoke slash commands, skills, or prompt-template expansion.
8. Set a delegate's label through Pi session naming. Avoid extra automatic naming/suggestion model calls for a delegate that has no composer. Ordinary lead naming/suggestions remain as they are.

Transport acknowledgment must mean the operation was accepted/persisted, not that a whole model turn completed. Do not hold a per-session mutation queue waiting for `sendCustomMessage(..., { triggerTurn: true })` to finish a turn; assignment completion comes from later Pi lifecycle events. Verify the pinned API's promise timing with a focused integration test.

Do not put orchestration operations under the fixed extension-call/frame timeout. A `delegate_wait` is intentionally long-lived and cancellable; catalog/history requests can have normal bounded request lifetimes. Node remains event-driven; no synchronous blocking or filesystem polling loop is needed.

## 8. Waiting, outcomes, and stop ordering

### A complete delegation cycle

1. Lead calls spawn. Main records the intent, allocates a unique child session, configures it, persists the relationship, and starts the attributed assignment.
2. The lead can spawn siblings or continue other work. Spawn never blocks until the child's final answer.
3. Lead calls `delegate_wait`. Register the subscription and check the current assignment state/sequence together so a result arriving during registration cannot be missed. A cached current result returns immediately.
4. Delegate progress is visible in its transcript and the lead's inspection data. Progress alone does not create extra lead turns.
5. If the delegate requests a reply, retain that request and classify its next successful settled outcome as Waiting for lead. The question breaks a lead wait even if the lead asked to wait for all children to complete.
6. The lead answers through `delegate_message`, correlated to the pending question. If the reply arrives before the delegate fully settles, queue it safely in Pi and suppress a stale Waiting/Completed transition.
7. When Pi emits `agent_settled`, inspect its actual outcome, final assistant-entry reference, assignment ID, pending questions, and queued work. Record and route the correct result.
8. Resolve the existing wait tool, letting Pi naturally continue the lead. Do not also inject a second prompt to wake the same lead. If it was not waiting, retain the result as pending coordination data for inspection/the next ordinary turn; do not invent a wake permission.

Use `agent_settled` as the authoritative idle boundary. `message_end` may only finish one message; `agent_end` may precede retries, compaction, or queued follow-ups. An aborted settled event is not a successful result. `agent_before_settle` may help persist local outcome markers, but must not launch another independent model loop.

The initial wait implementation can keep the Pi tool call pending while subscribing to coordinator events. No duplicate scheduler is necessary. A new user instruction to the lead cancels/releases that wait so the user can steer it without waiting for a child; this does not stop children unless the user presses Stop. Timeouts return current state without manufacturing failure or scheduling a later surprise wake. Multiple wait subscriptions and duplicate delivery of the same completion must not create multiple lead turns.

### Stop as a dispatch fence

Perform these steps in order:

1. In main, advance the target group's cancellation generation and block new spawns/dispatch immediately.
2. Persist the Stop record where possible. Preserve the in-memory fence even if the record write fails, and report that failure.
3. Cancel wait subscriptions, pending startup/configuration, pending automatic result delivery, and accepted queued assignment continuations belonging to the group.
4. Abort the actual Pi runs. Verify how the pinned Pi version clears queued steering/follow-up messages; if abort leaves runnable queue state, clear it through supported APIs or retire that host after abort so a later turn cannot execute stale work.
5. Observe abort/settled or process exit and publish the stopped result. Repeated Stop is idempotent. Report a target that fails to stop; do not claim it stopped merely because an abort command was written.

Every late callback rechecks the generation. This covers Stop during worktree creation, between child process allocation and binding, while a delegate completes, and while an explicit peer wake is being accepted. Never hold an app-wide lock while waiting for models to finish. On explicit resumption, allocate a fresh active execution generation; old notifications stay historical and cannot reactivate it.

Finishing uses the same host-owned group state to check active work, including preparing children, pending waits, queued dispatch, Pi retry/compaction, and relevant extension activity. Completed/stopped/failed/interrupted assignments are not running work; an unresolved Waiting for lead assignment still needs attention and prevents Finish until answered or stopped. Stop and Finish stay separate.

## 9. Workspaces and worktrees

- Shared mode uses the lead's actual cwd, including when that lead is already in a worktree. It does not use the sidebar project filter.
- Worktree mode is explicit in spawn. Validate a Git repository before allocating a child model turn. Project-free Work can use shared mode; worktree mode fails clearly unless its actual cwd is a repository.
- Accept an explicit base ref. If omitted, capture the lead cwd's current HEAD at spawn acceptance and use that exact commit. Capture the resolved commit in the spawn record to avoid a later branch switch changing the base.
- Reuse `gitAddWorktree()` and extend its base-ref argument if needed without changing the existing UI's behavior. Use Git argument arrays and the established cross-platform path conventions. Report existing-branch, checked-out-branch, invalid-ref, and path-allocation failures.
- A worktree contains committed content at the chosen base. It does not carry the lead's uncommitted changes, dependency directory, ignored files, environment file, or running services. Return this fact with the actual path/base so the lead can arrange prerequisites explicitly.
- Start Pi in the returned worktree path, with normal Pi project trust resolution. Do not silently write a new trust decision, bypass existing trust behavior, or copy authentication/configuration files.
- Persist the worktree path, branch, repository identity, and base commit in the relationship record. Discover the child under the lead even if its cwd is not a pinned project. Do not automatically pin it or switch the user's project.
- A Stop or startup failure may leave a created worktree. Record and surface it for the lead; never force-remove it as rollback. Completion, deletion, and finishing do not merge or remove it.
- The final result can include branch/path and changed-file/test information from the delegate. The lead reviews and integrates through its available normal tools. NativePi adds no automatic merge, rebase, checkpoint, or history rewrite.

## 10. Host-owned organization and thread operations

Move affected chat organization changes through host operations before exposing agent tools. These include Mark finished, Return to focus, pinning interactions, deletion cleanup, and any Focus operation that rewrites those same fields.

Add an atomic queued update helper to `main/state.ts` that transforms the latest state inside its existing save queue. Do not read a state snapshot, mutate it elsewhere, and later overwrite a newer save. Add validated host requests/events with organization snapshots or patches and monotonically increasing revisions so desktop and Local Access clients converge.

Change renderer actions to call these operations and apply returned/pushed state. Existing whole-state renderer saves must preserve the host's current organization fields inside the same queue; otherwise an old renderer snapshot can undo an agent's Finish. Migrate existing stored organization values without changing their meaning or duplicating them into Pi transcripts. Do not turn all app state into a new persistence framework.

Thread creation/deletion/stop must not depend on the selected chat, a mounted composer, or a browser client connection. On deletion, clean up the requested session's last-selection references, drafts, pinned/Focus/Finished entries, and folder membership after successful deletion; failed deletion retains them. Broadcast the result to all viewers. Preserve current read/write conflicts, path/project validation, terminal independence, and trust behavior.

## 11. Conversation and navigation design

Use the existing chat viewer rather than introducing a separate orchestration dashboard as the primary workflow.

### Leads

- Show compact delegate activity beneath the parent thread in the sidebar and at the original spawn call in its transcript. Keep these rows visible outside collapsed tool logs; later turns and follow-ups update the original row without moving it above the composer. The normal thread remains the navigation anchor.
- Each delegate item shows label, actual status, model/effort/tier on inspection, and workspace distinction when useful. Selecting it opens its real transcript.
- Lead-side messages/results identify the delegate and assignment. Questions must be distinguishable from progress and completed results. Full tool output/thinking stays in the delegate chat unless explicitly read.
- Surface pending peer messages in a small inbox view with sender, time, delivery state, and an explicit action to resume with selected messages. Reading a message alone does not start work.
- Show Stop whenever group work exists, including when the lead itself is currently settled but a child is running. Do not derive the only Stop control from the active conversation's `running` boolean.

### Delegates

- Reuse transcript streaming, tool rendering, Markdown, artifacts, branch/history reading, context inspection, file views, and Source Control for the delegate's actual working directory.
- Use a compact, non-editable version of the composer surface for static model/status and a way back to the lead. Keep an individual Stop control while work is active. There is no editable composer, send action, attachment target, suggestion acceptance, slash-command input, or user model/speed mutation control for the delegate.
- Apply the restriction to shortcuts, drag/drop, store submission actions, and host submission requests, not just a hidden component. A forged browser request must not send a user prompt to a delegate. Legitimate owning-lead dispatch is a separate operation.
- A cold or newly selected delegate must resolve its role before rendering input controls. During metadata hydration, do not briefly expose a lead composer.
- Preserve third-party transcript/tool rendering and normal extension UI. Do not promise that trusted extensions cannot open their own input dialogs; the no-composer requirement does not create an extension sandbox or an app policy overriding the lead's tool choices.
- Keep orphaned/missing-reference delegate chats viewable with honest status. Their role does not silently become a lead with a composer.

### Navigation and polish

- Update sidebar selectors/navigation to avoid duplicating a delegate as an independent ordinary lead row, while keeping search results and direct transcript navigation usable.
- Parent/child navigation works across different cwd/project scopes without repinning folders. The active delegate cwd drives Files, Source Control, terminal targeting, and context display.
- Match current shadcn/base-ui primitives, Phosphor icons, semantic theme tokens, and light/dark/custom schemes. Avoid a new agent-card design system. Respect narrow-window sheets and existing reduced-motion behavior.
- Follow create → review → enhance → polish → repeat: first establish the transcript/parent hierarchy, review realistic parallel activity, refine questions/error/Stop states, then polish spacing and transitions. Read the relevant UI/motion skills when implementing those changes.
- Include empty, many-delegate, long-label, failed, waiting, interrupted, deleted-parent, stale-reference, and cold-load states. These are layout requirements, not a reason to add redundant controls.

## 12. App lifecycle, Local Access, usage, and diagnostics

- Protect starting delegates, outstanding orchestration requests, and waits from idle reclamation. Settled completed delegates may be reclaimed and reconstructed from their own Pi sessions for follow-up.
- Register delegate runtimes in the existing process/session lifecycle rather than an unrelated background-process registry. Quit confirmation and power-save protection must count actual running work without counting a waiting lead plus its group twice accidentally.
- Stop dispatch before app shutdown or Pi/project restart; cancel waits and pending wakes, then use the established process disposal and credential-flush paths. Do not start processes just to write shutdown notices. A missing terminal record is recoverable as Interrupted on next launch.
- Verify that main-process death and IPC/stdin disconnection abort/dispose the Pi child through its existing lifecycle. Add a narrow disconnect hook if necessary; do not leave delegates intentionally running without their host. Already-performed filesystem or external effects are not rolled back, and detached processes created by arbitrary tools are not a new NativePi sandboxing responsibility.
- Restarting a project must include owned delegates running in separate worktree directories. Restarting a delegate's own cwd must update that delegate's owning lead projection. Use relationship membership as well as cwd equality.
- Desktop and Local Access use the same host requests, schemas, snapshots, and event sequencing. Disconnecting a viewer does not cancel accepted agent work. Reconnecting hydrates from authoritative state before accepting incremental events.
- Read usage from actual Pi assistant/usage records. Include delegate sessions in existing usage reporting and identify their actual cwd/model. Any parent-group total must be a derived view that does not double-count child costs in overall totals.
- Add redacted diagnostics for operation IDs, state transitions, runtime exit reasons, pending-delivery counts, and session conflicts. Avoid logging task prompts, message content, secrets, or full project instructions. No NativePi telemetry is introduced.

## 13. Implementation sequence and completion gates

Each phase should leave reviewable, focused behavior. The complete feature includes all phases; the first vertical slice is not the final delivery.

### Phase 1 — Contracts and Pi integration proof

- Define the schemas, references, role checks, operation IDs, assignment outcomes, and error codes in `shared/orchestration.ts`.
- Finalize tool names/arguments and document the defaults from section 1 in tool descriptions/instructions where relevant.
- Prove against pinned Pi: unique `--session-id` startup, custom message acceptance/persistence timing, settled outcome classification, tool-loadout restoration/exposure, and abort/queue behavior.
- Establish role hydration and clone/fork identity rules before a delegate transcript can be opened with input controls.

Gate: focused tests prove fresh distinct sessions and distinguish accepted messages from finished model turns; no Pi dependency upgrade or competing executor is needed.

### Phase 2 — Shared runtime operations and host organization

- Expose the narrow guarded session adapter from existing runtime ownership code.
- Add host-owned organization operations and renderer synchronization, including stale whole-state-save handling.
- Add named-session allocation independent of the project's draft runtime. Preserve existing session-change, external-write, and idle-retirement behavior.

Gate: agent-capable callers can allocate/mutate a specific session and finish an idle thread without depending on renderer selection; a stale UI save cannot reverse Finish.

### Phase 3 — Durable coordinator and private bridge

- Implement versioned records/projections, actor binding, message IDs, per-session serialization, spawn intents, wait subscriptions, and cancellation fences.
- Add cancellable child/main IPC and narrow guarded host-to-child operations.
- Implement no-execution recovery for partial spawn/delivery and interrupted assignments.

Gate: failure injection between record writes and acknowledgments preserves inspectable state; no ambiguous operation is automatically rerun after restart.

### Phase 4 — Complete shared-directory delegation cycle

- Register catalog, spawn, inspect, message, wait, stop, and own-lead messaging tools.
- Configure children from their own runtime catalog and selected tools before first work; add role instructions and attributed tasks.
- Implement successful results, question/reply flow, sibling concurrency, follow-up assignments, errors, and Stop during startup/completion.

Gate: spawn → progress/question → lead reply → completion → one lead continuation works with real Pi event shapes and focused fake-runtime failure tests. Fresh delegates contain no copied parent conversation.

### Phase 5 — Delegate transcript workflow

- Add relationship/status snapshots to host contracts and the Zustand slice.
- Add discoverable parent/child navigation, open the ordinary delegate transcript, remove all user-composer entry points, and provide group/individual Stop.
- Keep opening/history usable cold and from Local Access; handle actual delegate cwd and unavailable parents.

Gate: users can follow concurrent delegates in the normal viewer, cannot submit user prompts to them through UI/store/host paths, and can stop group work even when the lead is settled.

### Phase 6 — Worktree delegation

- Add explicit workspace choice/base-ref semantics, using the existing Git helper and recorded resolved base.
- Support worktree-specific Pi trust/configuration/catalog and parent/child navigation across cwd boundaries.
- Surface retained worktrees on failure/Stop and ownership of integration; add no automatic cleanup or merge.

Gate: worktree work starts in the requested checkout, does not copy dirty parent changes, and survives failed startup without destructive rollback.

### Phase 7 — Independent history tools

- Add scoped/paginated discovery, search, and transcript reading over Pi services, including older/cold/Finished sessions and known custom storage.
- Preserve match/entry/branch attribution and bounded output; do not start Pi processes for reads.
- Reuse these operations from thread tools without adding an orchestration requirement to history lookup.

Gate: a lead can find relevant historical context without a parent/peer relationship or waking another thread.

### Phase 8 — Cross-thread messaging and management

- Add independent lead creation, durable inbox/message delivery, explicit wake, group Stop, Finish, and protected deletion.
- Add unread/inbox UI and attribution. Reconcile unavailable recipients and message acknowledgment loss.
- Ensure agent-created leads are independent peers; stopping their creator does not cascade into them.

Gate: two arbitrary Work leads can discover and message each other; inbox delivery alone never starts work; explicit wake starts/queues only the requested work; management is reflected in every connected client.

### Phase 9 — Lifecycle hardening, design review, and documentation

- Finish restart/recovery, reclamation, quit/power-save, extension surfaces, usage attribution, and diagnostics.
- Review and refine real UI states in light/dark/custom themes and narrow layouts using the running app's Local Access only when app/browser testing is requested. Do not start the app or a dev server unasked.
- Update `apps/desktop/PRODUCT.md`, user/developer documentation as appropriate, and `CHANGELOG.md` under Unreleased when implementation actually ships. Keep this plan clearly distinguished from current capabilities.
- Prepare a feature PR for the noticeable UI/large unified change. Use the before-and-after skill with available captures at that point, keeping personal captures/reports outside the repository as required by `AGENTS.md`. Do not bump app/package versions, tag a release, or publish an extension package as part of this feature.

Gate: focused behavior checks pass, gaps are documented honestly, and the entire agreed workflow—not only spawn—is reviewable.

## 14. Focused verification matrix

Test observable behavior through the coordinator/runtime/host interfaces. Use fake Pi processes and temporary real Pi sessions for deterministic races and durable-format checks; use pinned-package integration fixtures for actual Pi lifecycle/message semantics. Live provider calls are optional manual validation, never a requirement for the normal test suite.

| Area | Required cases |
| --- | --- |
| Context and configuration | Parent transcript/summary/images/draft absent; normal project instructions retained; exact child model/effort/tier selected; non-tier providers use their normal path and reject Priority; lead/global defaults unchanged; unavailable provider/tool rejected; extension-provided model/tool works. |
| Allocation | Two concurrent same-cwd spawns and an existing unsent draft stay distinct; failed/duplicate tool transport does not create another child; startup cancelled before first prompt cannot run later. |
| Role and tool protocol | Delegate cannot spawn/manage/message another lead even through indirect app tool invocation; own-lead identity is host-derived; actual selected Pi exposure is reported; no misleading read-only guarantee. |
| Results | Progress is not completion; requested reply breaks an all-results wait; early reply cannot cause stale waiting/completion; retry/compaction/follow-up after `agent_end` does not finish early; abort/error/length/missing final answer is not success. |
| Wait and Stop | Result arriving during wait registration is observed; wait resolves once; no second wake; user instruction releases wait; individual Stop preserves siblings; group Stop catches startup and late callbacks; Pi queued messages do not survive Stop as runnable work; explicit resume starts a new attempt without replaying old tools or cancelled siblings. |
| Durability | Crash before/after sender intent, recipient receipt, contextual delivery, acknowledgment, child allocation, and completion notification; pending content survives; no automatic work restart; ambiguous work is surfaced; corrupt/unknown record versions fail locally without damaging unrelated Pi fields. |
| External writers and branches | Existing session-write conflict checks cover metadata/message append; stale callbacks cannot bless another writer; compaction retains discovery; fork/clone/history navigation never replays effects or adopts old child ownership. |
| Peer tools | Arbitrary discovered Work leads can communicate without links; historical reads boot no process; messages do not wake/steer; explicit wake respects busy queues/Stop; self-delete rejected; failed delete retains UI metadata; child history/worktrees survive parent deletion. |
| Organization | Busy-group Finish rejected; idle Finish/Return to focus consistent; stale desktop/browser state saves cannot undo host changes; delete cleanup broadcasts; existing organization migrates without loss. |
| Worktrees | Non-repository, invalid base, branch/path collision, checked-out branch, dirty parent, cwd already a worktree, trust resolution, startup failure after creation, Stop, and removed worktree; no auto merge/removal. |
| UI and transport | Delegate transcript cold load/live streaming; no composer flash, keyboard send, paste/drop attach, suggestion acceptance, or forged user submit; parent navigation uses correct cwd; group Stop present with idle lead; browser reconnect and out-of-order snapshots converge. |
| Lifecycle and usage | Reclamation protects pending waits/requests and active children; completed cold child can receive follow-up; project/global restart covers worktree children; host death/disconnection disposes children; quit counts correctly; actual Pi usage is not double-counted. |

Use focused commands for changed areas, for example:

```sh
bun test apps/desktop/src/main/orchestration/coordinator.test.ts
bun test apps/desktop/src/main/orchestration/records.test.ts
bun test apps/desktop/src/main/orchestration/history.test.ts
bun test apps/desktop/src/main/pi/host/orchestration.test.ts
bun test apps/desktop/src/main/runtime.test.ts
bun test apps/desktop/src/main/state.test.ts
bun test apps/desktop/src/main/sessions.test.ts
bun test apps/desktop/src/main/git.test.ts
bun run --cwd apps/desktop test:dom src/renderer/components/DelegateConversation.dom.test.tsx
bun run --cwd apps/desktop typecheck
```

These include planned test paths; create/co-locate tests with the implementation. Select existing suites only when their boundary changes, and add focused DOM cases to existing suites where appropriate rather than creating rendering-only tests. Do not run project-wide tests/builds/quality suites or watch hosted CI unless requested. Publishing follows the repository's existing pre-push/release conventions.

## 15. Final acceptance scenario

From a normal Work lead, choose two available models with explicit reasoning, supported tiers, and tool selections. Start one fresh delegate in the shared directory and one in a new worktree. Inspect both ordinary chat transcripts without any user composer. Have one delegate report progress, request clarification, receive the lead's answer, and finish. Have the other finish with its branch/path and verification. The lead continues once per resolved wait with correctly attributed questions/results, then decides how to review and integrate the work. No result creates a duplicate continuation.

Separately, find an older thread through history tools, send a message to an unrelated cold lead without starting it, explicitly wake that lead, and observe its own independent delegates and management actions. Stop a lead during child startup and confirm that no late callback restarts work. Restart the app with unfinished tasks and pending messages: history, relationships, workspaces, and accepted content remain visible, while model execution stays stopped until explicitly resumed. Finish an idle thread from an agent tool and observe the same Finished state in desktop and browser access.

The feature is complete when these workflows, their meaningful failure cases, and the normal Pi extension/session boundaries all hold. A successful spawn alone is not completion of the feature.
