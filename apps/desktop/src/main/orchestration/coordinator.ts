import { randomUUID } from "node:crypto";
import { OrchestrationError, orchestrationMessageSchema, orchestrationRecordSchema, type Assignment, type OrchestrationMessage, type OrchestrationRecord, type Relationship, type ThreadReference } from "../../shared/orchestration.ts";
import { assignmentBusy, projectOrchestration } from "./records.ts";

export interface OrchestrationAdapter {
  read(ref: ThreadReference): Promise<readonly unknown[]>;
  /** Must use the owning Pi writer and existing session revision/write lease. */
  append(ref: ThreadReference, record: OrchestrationRecord, signal?: AbortSignal): Promise<void>;
  /** Resolves on durable acceptance, never on model completion. */
  dispatch(ref: ThreadReference, message: OrchestrationMessage, signal: AbortSignal): Promise<void | { supplied: boolean }>;
  fence?(ref: ThreadReference): void;
  stop(ref: ThreadReference): Promise<void>;
  running(ref: ThreadReference): boolean;
  configure?(ref: ThreadReference, relationship: Relationship, signal?: AbortSignal): Promise<void>;
  trace?(operationId: string, sessionId: string, kind: string, state?: string): void;
  publish(): void;
}
type Projection = ReturnType<typeof projectOrchestration>;
interface Thread { available: boolean; ref: ThreadReference; projection: Projection; controller: AbortController; fenced: boolean }
interface Waiter { lead: string; ids: string[]; assignments: (string | undefined)[]; all: boolean; resolve: () => void }

/** Coordination only: Pi owns execution, context and every durable transcript. */
export class OrchestrationCoordinator {
  private threads = new Map<string, Thread>();
  private queues = new Map<string, Promise<unknown>>();
  private waits = new Set<Waiter>();
  private pending = new Map<string, number>();
  private stopping = new Map<string, Promise<void>>();
  private deliveries = new Map<string, Promise<OrchestrationMessage>>();
  constructor(private adapter: OrchestrationAdapter, private stopPersistenceTimeout = 1000) {}

  async hydrate(ref: ThreadReference, notify = true): Promise<void> {
    const known = this.threads.get(ref.id);
    if (known) { if (known.ref.file !== ref.file || known.ref.cwd !== ref.cwd) throw new OrchestrationError("external_session_change", "Duplicate Pi session identity at another path. Resolve the conflicting copies."); const changed = known.ref.title !== ref.title || !known.available; known.ref = ref; known.available = true; if (changed && notify) this.changed(); return; }
    const projection = projectOrchestration(ref.id, await this.adapter.read(ref), true);
    if (!this.threads.has(ref.id)) { this.threads.set(ref.id, { available: true, ref, projection, controller: new AbortController(), fenced: projection.relationship ? !projection.assignment || ["interrupted", "failed", "stopped"].includes(projection.assignment.state) : true }); if (notify) this.changed(); }
  }
  reconcileDiscovery(available: Set<string>): void {
    for (const thread of this.threads.values()) thread.available = available.has(thread.ref.id);
    this.changed();
  }
  private thread(id: string): Thread {
    const value = this.threads.get(id);
    if (!value) throw new OrchestrationError("not_found", "Discover or open this thread before operating on it.");
    return value;
  }
  private lead(id: string): Thread {
    const value = this.thread(id);
    if (value.projection.unavailableRole || value.projection.relationship) throw new OrchestrationError("wrong_role", "Only Work leads can manage threads or delegates.");
    return value;
  }
  private owned(leadId: string, delegateId: string): Thread {
    this.lead(leadId);
    const child = this.thread(delegateId);
    if (child.projection.relationship?.lead.id !== leadId) throw new OrchestrationError("not_owner", "This delegate belongs to another lead.");
    return child;
  }
  private serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(id) ?? Promise.resolve()).catch(() => {}).then(action);
    this.queues.set(id, next);
    void next.finally(() => { if (this.queues.get(id) === next) { this.queues.delete(id); this.changed(); } }).catch(() => {});
    return next;
  }
  private async record(thread: Thread, record: OrchestrationRecord, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const parsed = orchestrationRecordSchema.parse(record);
    if (parsed.sessionId !== thread.ref.id) throw new Error("Record identity mismatch");
    await this.adapter.append(thread.ref, parsed, signal);
    signal?.throwIfAborted();
    this.adapter.trace?.(parsed.operationId, thread.ref.id, parsed.kind, parsed.kind === "assignment" ? parsed.assignment.state : parsed.kind === "message" ? parsed.stage : undefined);
    // Projection updates happen only after the writer acknowledges persistence.
    const p = thread.projection;
    p.operations.add(parsed.operationId);
    if (parsed.kind === "operation") p.results.set(parsed.operationId, parsed);
    if (parsed.kind === "relationship" && parsed.relationship.delegate.id === thread.ref.id) p.relationship = parsed.relationship;
    if (parsed.kind === "assignment") { p.assignment = parsed.assignment; p.assignments.set(parsed.assignment.id, parsed.assignment); }
    if (parsed.kind === "message") {
      const m = parsed.message;
      if (parsed.stage === "read") p.readMessages.add(m.id);
      if (parsed.stage === "outbox") p.outbox.set(m.id, m);
      if (parsed.stage === "inbox" && !p.consumed.has(m.id)) p.inbox.set(m.id, m);
      if (parsed.stage === "consumed") { p.inbox.delete(m.id); p.consumed.add(m.id); }
      if (parsed.stage === "acknowledged") p.outbox.delete(m.id);
    }
    this.changed();
  }
  private changed(): void {
    this.adapter.publish();
    for (const waiter of [...this.waits]) {
      const states = waiter.ids.map((id, index) => { const t = this.thread(id); const p = t.projection; const assignmentId = waiter.assignments[index]; return t.fenced && t.controller.signal.aborted ? "stopped" : (assignmentId ? p.assignments.get(assignmentId) : p.assignment)?.state; });
      const question = waiter.ids.some((id, index) => {
        const p = this.thread(id).projection;
        const assignment = waiter.assignments[index] ? p.assignments.get(waiter.assignments[index]!) : p.assignment;
        return assignment?.questions.some(messageId => this.thread(waiter.lead).projection.inbox.has(messageId));
      });
      const terminal = (state: typeof states[number]) => !!state && ["completed", "failed", "stopped", "interrupted"].includes(state);
      if (question || states.includes("waiting") || states.some(state => state === "failed" || state === "stopped" || state === "interrupted") || (waiter.all ? states.every(terminal) : states.some(terminal))) waiter.resolve();
    }
  }
  private startupError(t: Thread): string | undefined {
    const relationship = t.projection.relationship;
    const startup = relationship && this.threads.get(relationship.lead.id)?.projection.results.get(relationship.operationId);
    return !t.projection.assignment && startup?.status === "failed" ? startup.reason ?? "Delegate startup failed" : undefined;
  }
  private status(t: Thread): Assignment["state"] | undefined {
    if (this.startupError(t)) return "failed";
    return t.projection.assignment?.state ?? (t.projection.relationship ? t.fenced ? t.controller.signal.aborted ? "stopped" : "interrupted" : "preparing" : undefined);
  }
  snapshot(id: string) {
    const t = this.thread(id);
    return { startupError: this.startupError(t), status: this.status(t), available: t.available, readMessageIds: [...t.projection.readMessages], roleUnavailable: t.projection.unavailableRole, reports: [...(this.threads.get(t.projection.relationship?.lead.id ?? "")?.projection.inbox.values() ?? [])].filter(message => message.source.id === id && message.kind !== "peer" && message.assignmentId === t.projection.assignment?.id).slice(-25), busy: this.busy(id), ref: t.ref, relationship: t.projection.relationship, assignment: t.projection.assignment, inbox: [...t.projection.inbox.values()], pendingDelivery: [...t.projection.outbox.values()], running: this.adapter.running(t.ref), delegates: [...this.threads.values()].filter(child => child.projection.relationship?.lead.id === id).map(child => ({ startupError: this.startupError(child), status: this.status(child), available: child.available, ref: child.ref, relationship: child.projection.relationship, assignment: child.projection.assignment, running: this.adapter.running(child.ref) })) };
  }
  /** Install the relationship before any task is accepted; no parent context is used. */
  async register(relationship: Relationship): Promise<void> {
    if (relationship.lead.id === relationship.delegate.id) throw new OrchestrationError("wrong_role", "A lead cannot be its own delegate.");
    const lead = this.lead(relationship.lead.id);
    if (lead.fenced) throw new OrchestrationError("stopped", "Resume the lead explicitly before spawning.");
    const signal = lead.controller.signal;
    await this.hydrate(relationship.delegate);
    signal.throwIfAborted();
    const child = this.thread(relationship.delegate.id);
    if (child.projection.relationship && child.projection.relationship.operationId !== relationship.operationId) throw new OrchestrationError("not_owner", "Delegate already has an owning relationship.");
    await this.serial(child.ref.id, async () => {
      signal.throwIfAborted();
      await this.record(child, { version: 1, sessionId: child.ref.id, operationId: relationship.operationId, kind: "relationship", relationship });
      signal.throwIfAborted();
      child.fenced = false;
    });
    await this.serial(lead.ref.id, () => this.record(lead, { version: 1, sessionId: lead.ref.id, operationId: relationship.operationId, kind: "relationship", relationship }));
  }
  protect(id: string): () => void {
    this.pending.set(id, (this.pending.get(id) ?? 0) + 1); this.changed();
    return () => { this.pending.set(id, Math.max(0, (this.pending.get(id) ?? 1) - 1)); this.changed(); };
  }
  async noteRead(id: string, messageIds: string[]): Promise<void> {
    const t = this.thread(id);
    await this.serial(id, async () => {
      for (const messageId of messageIds) {
        const message = t.projection.inbox.get(messageId);
        if (message && !t.projection.readMessages.has(messageId)) await this.messageRecord(t, message, "read");
      }
    });
  }
  confirmSupplied(id: string, messageId: string): void {
    const t = this.thread(id); t.projection.inbox.delete(messageId); t.projection.consumed.add(messageId); this.changed();
  }
  references(): ThreadReference[] { return [...this.threads.values()].map(t => t.ref); }
  signal(id: string): AbortSignal { return this.thread(id).controller.signal; }
  operation(id: string, operationId: string) { return this.thread(id).projection.results.get(operationId); }
  async persist(id: string, record: OrchestrationRecord): Promise<void> { await this.serial(id, () => this.record(this.thread(id), record)); }
  async interrupted(id: string, reason: string): Promise<void> {
    const t = this.thread(id);
    t.fenced = true; t.controller.abort(); this.releaseWaits(id);
    if (assignmentBusy(t.projection.assignment)) t.projection.assignment = { ...t.projection.assignment!, state: "interrupted", reason };
    if (t.projection.assignment) t.projection.assignments.set(t.projection.assignment.id, t.projection.assignment);
    this.changed();
  }
  fence(id: string): void { const t = this.thread(id); t.fenced = true; t.controller.abort(); this.adapter.fence?.(t.ref); this.releaseWaits(id); }
  forget(id: string): void { this.releaseWaits(id); this.threads.delete(id); this.changed(); }
  resumeLead(id: string): void {
    const lead = this.lead(id);
    if (lead.fenced) lead.controller = new AbortController();
    lead.fenced = false;
  }
  private messageRecord(thread: Thread, message: OrchestrationMessage, stage: "outbox" | "inbox" | "consumed" | "acknowledged" | "read") {
    return this.record(thread, { version: 1, sessionId: thread.ref.id, operationId: message.operationId, kind: "message", message, stage });
  }
  /** Inbox delivery never invokes dispatch. Cross-session leases are never nested. */
  async send(sourceId: string, destinationId: string, operationId: string, content: string, kind: OrchestrationMessage["kind"] = "peer", assignmentId?: string, replyTo?: string): Promise<OrchestrationMessage> {
    const source = this.thread(sourceId), destination = this.thread(destinationId);
    if (kind === "peer") { this.lead(sourceId); this.lead(destinationId); }
    const key = `${sourceId}:${operationId}`;
    const inflight = this.deliveries.get(key);
    if (inflight) return inflight;
    const task = (async () => {
      // The operation-derived ID remains stable across lost acknowledgments/restarts.
      const message = orchestrationMessageSchema.parse({ id: key, operationId, source: source.ref, destination: destination.ref, kind, assignmentId, replyTo, timestamp: new Date().toISOString(), content });
      const prior = source.projection.outbox.get(key) ?? destination.projection.inbox.get(key);
      if (destination.projection.consumed.has(key)) {
        if (source.projection.outbox.has(key)) await this.serial(sourceId, () => this.messageRecord(source, prior ?? message, "acknowledged"));
        return prior ?? message;
      }
      const accepted = prior ?? message;
      await this.serial(sourceId, async () => { if (!source.projection.outbox.has(key)) await this.messageRecord(source, accepted, "outbox"); });
      await this.serial(destinationId, async () => { if (!destination.projection.inbox.has(key) && !destination.projection.consumed.has(key)) await this.messageRecord(destination, accepted, "inbox"); });
      await this.serial(sourceId, () => this.messageRecord(source, accepted, "acknowledged"));
      return accepted;
    })();
    this.deliveries.set(key, task);
    try { return await task; } finally { this.deliveries.delete(key); }
  }
  async reconcileDeliveries(id: string): Promise<{ messageId: string; delivered: boolean }[]> {
    const sender = this.thread(id);
    const results = [];
    for (const message of [...sender.projection.outbox.values()]) {
      try {
        await this.send(id, message.destination.id, message.operationId, message.content, message.kind, message.assignmentId, message.replyTo);
        results.push({ messageId: message.id, delivered: true });
      } catch { results.push({ messageId: message.id, delivered: false }); }
    }
    return results;
  }
  async assign(leadId: string, delegateId: string, operationId: string, content: string, options: { resume?: boolean; replyTo?: string } = {}): Promise<Assignment> {
    const lead = this.lead(leadId), child = this.owned(leadId, delegateId);
    if (lead.fenced) throw new OrchestrationError("stopped", "Lead is stopped; explicit resumption is required.");
    if (((child.fenced && child.projection.assignment?.state !== "completed") || ["failed", "interrupted", "stopped"].includes(child.projection.assignment?.state ?? "")) && !options.resume) throw new OrchestrationError("stopped", "Use resume to start a new execution attempt.");
    const groupSignal = lead.controller.signal;
    const generation = child.projection.generation;
    return this.serial(delegateId, async () => {
      groupSignal.throwIfAborted();
      if (child.projection.generation !== generation || this.stopping.has(delegateId)) throw new OrchestrationError("stopped", "Assignment cancelled by Stop; resume with a new instruction.");
      let previous = child.projection.assignment;
      if (previous?.taskMessageId === `${leadId}:${operationId}`) return previous;
      if (child.projection.operations.has(operationId)) throw new OrchestrationError("interrupted", "This operation has already been recorded. Inspect its state; do not replay it.");
      const pendingQuestions = previous && assignmentBusy(previous) ? previous.questions : [];
      if (pendingQuestions.length && !options.replyTo && pendingQuestions.length > 1) throw new OrchestrationError("busy", "Specify which pending question this reply answers.");
      const replyTo = options.replyTo ?? pendingQuestions[0];
      if (replyTo && !pendingQuestions.includes(replyTo)) throw new OrchestrationError("not_found", "Question is no longer pending.");
      if (child.fenced || options.resume) { child.controller = new AbortController(); child.fenced = false; }
      const signal = AbortSignal.any([groupSignal, child.controller.signal]);
      const message = orchestrationMessageSchema.parse({ id: `${leadId}:${operationId}`, operationId, source: lead.ref, destination: child.ref, kind: replyTo ? "reply" : previous ? "follow-up" : "task", assignmentId: previous && assignmentBusy(previous) ? previous.id : randomUUID(), replyTo, timestamp: new Date().toISOString(), content });
      const assignment: Assignment = { id: message.assignmentId!, delegate: child.ref, taskMessageId: message.id, attempt: (previous?.attempt ?? 0) + (options.resume ? 1 : previous ? 0 : 1), state: "preparing", questions: replyTo ? pendingQuestions.filter(id => id !== replyTo) : [] };
      await this.record(child, { version: 1, sessionId: delegateId, operationId, kind: "assignment", assignment });
      try {
        signal.throwIfAborted();
        // The source intent precedes acceptance in the recipient. These are
        // short Pi appends; no session write lease spans another model run.
        await this.serial(leadId, () => this.messageRecord(lead, message, "outbox"));
        if (child.projection.relationship) await this.adapter.configure?.(child.ref, child.projection.relationship, signal);
        signal.throwIfAborted();
        await this.messageRecord(child, message, "inbox");
        await this.serial(leadId, () => this.messageRecord(lead, message, "acknowledged"));
        signal.throwIfAborted();
        assignment.state = "running";
        await this.record(child, { version: 1, sessionId: delegateId, operationId, kind: "assignment", assignment });
        signal.throwIfAborted();
        const delivery = await this.adapter.dispatch(child.ref, message, signal);
        signal.throwIfAborted();
        if (!delivery || delivery.supplied) await this.messageRecord(child, message, "consumed");
      } catch (error) {
        if (!signal.aborted) await this.record(child, { version: 1, sessionId: delegateId, operationId, kind: "assignment", assignment: { ...assignment, state: "failed", reason: error instanceof Error ? error.message.slice(0, 4000) : "Dispatch failed" } });
        throw error;
      }
      previous = child.projection.assignment;
      return previous ?? assignment;
    });
  }
  async report(delegateId: string, operationId: string, content: string, needsReply: boolean): Promise<OrchestrationMessage> {
    const child = this.thread(delegateId), relationship = child.projection.relationship;
    if (!relationship) throw new OrchestrationError("wrong_role", "Only delegates can message their own lead.");
    const assignment = child.projection.assignment;
    if (!assignment || !assignmentBusy(assignment)) throw new OrchestrationError("stopped", "No active assignment.");
    const messageId = `${delegateId}:${operationId}`;
    if (needsReply) await this.serial(delegateId, async () => {
      const latest = child.projection.assignment;
      if (latest?.id !== assignment.id || child.fenced) throw new OrchestrationError("stopped", "Assignment stopped.");
      await this.record(child, { version: 1, sessionId: delegateId, operationId, kind: "assignment", assignment: { ...latest, questions: [...new Set([...latest.questions, messageId])] } });
    });
    const message = await this.send(delegateId, relationship.lead.id, operationId, content, needsReply ? "question" : "progress", assignment.id);
    return message;
  }
  async wake(id: string, messageIds: string[], signal: AbortSignal): Promise<void> {
    const target = this.lead(id);
    if (!messageIds.length || new Set(messageIds).size !== messageIds.length) throw new OrchestrationError("not_found", "Select unique pending messages to wake with.");
    for (const messageId of messageIds) if (!target.projection.inbox.has(messageId)) throw new OrchestrationError("not_found", "Selected inbox message is no longer pending.");
    signal.throwIfAborted();
    if (target.fenced) this.resumeLead(id);
    const active = target.controller.signal;
    await this.serial(id, async () => {
      for (const messageId of messageIds) {
        signal.throwIfAborted(); active.throwIfAborted();
        const message = target.projection.inbox.get(messageId);
        if (!message) throw new OrchestrationError("not_found", "Selected inbox message is no longer pending.");
        const delivery = await this.adapter.dispatch(target.ref, message, AbortSignal.any([signal, active]));
        active.throwIfAborted();
        if (!delivery || delivery.supplied) await this.messageRecord(target, message, "consumed");
      }
    });
  }
  async settled(delegateId: string, outcome: { assignmentId: string; attempt: number; taskMessageId?: string; reason?: string; aborted: boolean; resultEntry?: string; stopReason?: string }): Promise<void> {
    const child = this.thread(delegateId);
    const signal = child.controller.signal;
    await this.serial(delegateId, async () => {
      const assignment = child.projection.assignment;
      if (!assignment || (outcome.taskMessageId && assignment.taskMessageId !== outcome.taskMessageId) || assignment.id !== outcome.assignmentId || assignment.attempt !== outcome.attempt || child.fenced || signal.aborted || assignment.state !== "running") return;
      const success = !outcome.aborted && outcome.stopReason === "stop" && !!outcome.resultEntry;
      const state = success ? assignment.questions.length ? "waiting" : "completed" : "failed";
      await this.record(child, { version: 1, sessionId: delegateId, operationId: randomUUID(), kind: "assignment", assignment: { ...assignment, state, resultEntry: outcome.resultEntry, reason: success ? undefined : outcome.reason?.slice(0, 4000) ?? outcome.stopReason ?? "Missing final answer" } });
    });
  }
  wait(leadId: string, ids: string[], all: boolean, signal: AbortSignal, timeout = 60000, assignmentIds?: Record<string, string>): Promise<ReturnType<OrchestrationCoordinator["snapshot"]>[]> {
    this.lead(leadId);
    if (!ids.length) throw new OrchestrationError("not_found", "Select at least one delegate.");
    for (const id of ids) {
      const child = this.owned(leadId, id);
      if (assignmentIds?.[id] && !child.projection.assignments.has(assignmentIds[id])) throw new OrchestrationError("not_found", "Assignment does not belong to this delegate");
    }
    const assignments = ids.map(id => assignmentIds?.[id] ?? this.thread(id).projection.assignment?.id);
    return new Promise(resolve => {
      let timer: ReturnType<typeof setTimeout>;
      const waiter: Waiter = { lead: leadId, ids, assignments, all, resolve: () => { clearTimeout(timer); this.waits.delete(waiter); signal.removeEventListener("abort", waiter.resolve); resolve(ids.map((id, index) => { const snapshot = this.snapshot(id); const assignmentId = assignments[index]; const assignment = assignmentId ? this.thread(id).projection.assignments.get(assignmentId) : snapshot.assignment; return { ...snapshot, assignment, reports: [...this.thread(leadId).projection.inbox.values()].filter(message => message.source.id === id && message.assignmentId === assignment?.id).slice(-25) }; })); } };
      this.waits.add(waiter);
      timer = setTimeout(waiter.resolve, Math.min(Math.max(timeout, 0), 3600000));
      signal.addEventListener("abort", waiter.resolve, { once: true });
      if (signal.aborted || this.thread(leadId).fenced) waiter.resolve();
      else this.changed();
    });
  }
  waiting(leadId: string): boolean { return [...this.waits].some(waiter => waiter.lead === leadId); }
  releaseWaits(leadId: string): void { for (const waiter of [...this.waits]) if (waiter.lead === leadId) waiter.resolve(); }
  stop(id: string): Promise<void> {
    if (!this.threads.has(id)) return Promise.reject(new OrchestrationError("not_found", "Thread unavailable"));
    const current = this.stopping.get(id);
    if (current) return current;
    const t = this.thread(id);
    const ids = t.projection.relationship ? [id] : [id, ...this.references().filter(ref => this.thread(ref.id).projection.relationship?.lead.id === id).map(ref => ref.id)];
    const task = this.stopGroup(id);
    for (const member of ids) if (!this.stopping.has(member)) this.stopping.set(member, task);
    void task.finally(() => { for (const member of ids) if (this.stopping.get(member) === task) this.stopping.delete(member); }).catch(() => {});
    return task;
  }
  private async stopGroup(id: string): Promise<void> {
    const target = this.thread(id);
    const group = target.projection.relationship ? [target] : [target, ...[...this.threads.values()].filter(t => t.projection.relationship?.lead.id === id)];
    // Synchronous fence before the first await, including preparing children.
    for (const t of group) { t.fenced = true; t.controller.abort(); t.projection.generation++; this.adapter.fence?.(t.ref); this.releaseWaits(t.ref.id); }
    this.changed();
    const results = await Promise.allSettled(group.map(async t => {
      const pending = this.stopping.get(t.ref.id);
      if (pending) { await pending; return; }
      // Persist through the still-owning writer, then always stop actual work.
      // Adapter append must fail locally for an unavailable writer, never start
      // a process just to record Stop.
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([this.serial(t.ref.id, async () => {
        const operationId = randomUUID();
        await this.record(t, { version: 1, sessionId: t.ref.id, operationId, kind: "stop", generation: t.projection.generation }, controller.signal);
        if (assignmentBusy(t.projection.assignment) || t.projection.assignment?.state === "interrupted") await this.record(t, { version: 1, sessionId: t.ref.id, operationId, kind: "assignment", assignment: { ...t.projection.assignment!, state: "stopped" } }, controller.signal);
      }), new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new OrchestrationError("interrupted", "Stop persistence timed out; terminating Pi."));
        }, this.stopPersistenceTimeout);
      })]); } catch (error) {
        await this.interrupted(t.ref.id, "Stop could not be persisted; explicit resumption required.");
        throw error;
      } finally { clearTimeout(timer); controller.abort(); await this.adapter.stop(t.ref); }
    }));
    this.changed();
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(r => r.reason), "Some group members could not be stopped or recorded.");
  }
  busy(id: string): boolean {
    const t = this.thread(id);
    return (this.pending.get(id) ?? 0) > 0 || this.adapter.running(t.ref) || assignmentBusy(t.projection.assignment) || this.queues.has(id) || [...this.waits].some(w => w.lead === id) || [...this.threads.values()].some(child => child.projection.relationship?.lead.id === id && this.busy(child.ref.id));
  }
}
