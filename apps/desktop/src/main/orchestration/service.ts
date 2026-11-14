import { createHash } from "node:crypto";
import { OrchestrationCoordinator } from "./coordinator.ts";
import { OrchestrationError, orchestrationOperations, type ThreadReference, type Relationship, type OrchestrationRecord } from "../../shared/orchestration.ts";
import { readThread, searchThreads } from "./history.ts";

export interface ThreadServiceAdapter {
  discover(): Promise<ThreadReference[]>;
  allocate(cwd: string, title: string, initial?: Omit<Relationship, "delegate">): Promise<ThreadReference>;
  catalog(cwd: string, signal?: AbortSignal): Promise<unknown>;
  workRoot(): Promise<string>;
  workspace(ref: ThreadReference, branch: string, base?: string, beforeCreate?: (workspace: Relationship["workspace"]) => Promise<void>): Promise<Extract<Relationship["workspace"], { mode: "worktree" }>>;
  finish(ref: ThreadReference): Promise<void>;
  focus(ref: ThreadReference): Promise<void>;
  remove(ref: ThreadReference): Promise<void>;
  configuration(ref: ThreadReference, configuration: Relationship["configuration"], signal?: AbortSignal): Promise<void>;
  finished(file: string): Promise<boolean>;
}
export class OrchestrationService {
  private operations = new Map<string, Promise<unknown>>();
  constructor(readonly coordinator: OrchestrationCoordinator, private adapter: ThreadServiceAdapter) {}
  async discover(): Promise<ThreadReference[]> {
    const refs = await this.adapter.discover();
    // One unreadable/deleted historical session must not disable every chat's
    // role hydration. Isolate it, and publish one converged discovery snapshot.
    const hydrated = await Promise.allSettled(refs.map(ref => this.coordinator.hydrate(ref, false)));
    const available = refs.filter((_, index) => hydrated[index]?.status === "fulfilled");
    this.coordinator.reconcileDiscovery(new Set(available.map(ref => ref.id)));
    return available;
  }
  async invoke(actor: ThreadReference, name: string, raw: Record<string, unknown>, toolId: string, signal: AbortSignal): Promise<unknown> {
    if (!Object.hasOwn(orchestrationOperations, name)) throw new OrchestrationError("not_found", "Unknown orchestration operation");
    const action = name as keyof typeof orchestrationOperations;
    const params = orchestrationOperations[action].parse(raw);
    await this.coordinator.hydrate(actor);
    const state = this.coordinator.snapshot(actor.id);
    if ((state.relationship || state.roleUnavailable) && !["lead_message", "orchestration_catalog", "thread_list", "thread_search", "thread_read"].includes(action)) throw new OrchestrationError("wrong_role", "Delegates cannot manage threads or spawn delegates, including indirectly.");
    if (action === "lead_message") {
      const p = orchestrationOperations.lead_message.parse(params);
      return this.coordinator.report(actor.id, toolId, p.content, p.needsReply);
    }
    const refs = await this.discover();
    const target = (id: string, peer = true) => {
      const ref = refs.find(ref => ref.id === id);
      if (!ref) throw new OrchestrationError("not_found", "Work thread unavailable. Discover it again; do not fabricate a replacement.");
      if (peer && (this.coordinator.snapshot(id).relationship || this.coordinator.snapshot(id).roleUnavailable)) throw new OrchestrationError("wrong_role", "Use owned delegate operations for this target.");
      return ref;
    };
    if (action === "orchestration_catalog") {
      const p = orchestrationOperations.orchestration_catalog.parse(params);
      return this.adapter.catalog(p.cwd ?? actor.cwd, signal);
    }
    if (action === "delegate_spawn" || action === "thread_create") {
      const key = createHash("sha256").update(`${actor.id}:${toolId}`).digest("hex");
      const existing = this.operations.get(key);
      if (existing) return existing;
      const recorded = this.coordinator.operation(actor.id, key);
      if (recorded) return { ...recorded, recovered: true, note: "Inspect this accepted operation. Recovery never re-executes it." };
      const group = this.coordinator.signal(actor.id);
      const active = AbortSignal.any([signal, group]);
      active.throwIfAborted();
      const release = this.coordinator.protect(actor.id);
      const run = (async () => {
        const record = (data: Omit<Extract<OrchestrationRecord, { kind: "operation" }>, "version" | "sessionId" | "operationId" | "kind">) => this.coordinator.persist(actor.id, { version: 1, sessionId: actor.id, operationId: key, kind: "operation", ...data });
        // Intent is durable before Git/process/session allocation. A partial
        // intent is inspectable and is never automatically retried on restart.
        await record({ action, status: "allocated", reason: "Preparing allocation" });
        let ref: ThreadReference | undefined, workspace: Relationship["workspace"] | undefined;
        try {
          if (action === "delegate_spawn") {
            const p = orchestrationOperations.delegate_spawn.parse(params);
            const sourceToolCallId = toolId.startsWith("delegate_spawn:") ? toolId.slice("delegate_spawn:".length) : toolId;
            workspace = p.workspace?.mode === "worktree" ? await this.adapter.workspace(actor, p.workspace.branch ?? `nativepi-${key.slice(0, 12)}`, p.workspace.base, async prepared => {
              active.throwIfAborted(); workspace = prepared;
              await record({ action, status: "allocated", workspace: prepared });
              active.throwIfAborted();
            }) : { mode: "shared", path: actor.cwd };
            await record({ action, status: "allocated", workspace });
            active.throwIfAborted();
            ref = await this.adapter.allocate(workspace.path, p.label, { operationId: key, sourceToolCallId, lead: actor, label: p.label, configuration: p.configuration, workspace });
            await record({ action, status: "allocated", workspace, ref });
            const relationship: Relationship = { operationId: key, sourceToolCallId, lead: actor, delegate: ref, label: p.label, configuration: p.configuration, workspace };
            // Persist role even if Stop arrived during allocation. The orphaned
            // transcript must never acquire a user composer.
            await this.coordinator.hydrate(ref);
            active.throwIfAborted();
            await this.coordinator.persist(ref.id, { version: 1, sessionId: ref.id, operationId: key, kind: "relationship", relationship });
            active.throwIfAborted();
            await this.coordinator.register(relationship);
            await this.coordinator.assign(actor.id, ref.id, `${key}:task`, p.task);
          } else {
            const p = orchestrationOperations.thread_create.parse(params);
            if (p.start && !p.prompt) throw new OrchestrationError("unsupported_configuration", "start:true requires a prompt");
            ref = await this.adapter.allocate(p.cwd ?? await this.adapter.workRoot(), p.title);
            await record({ action, status: "allocated", ref });
            await this.coordinator.hydrate(ref);
            active.throwIfAborted();
            await this.adapter.configuration(ref, p.configuration, active);
            if (p.start) {
              const message = await this.coordinator.send(actor.id, ref.id, `${key}:task`, p.prompt!);
              active.throwIfAborted();
              await this.coordinator.wake(ref.id, [message.id], active);
              await this.adapter.focus(ref);
            }
          }
          await record({ action, status: "accepted", ref, workspace });
          return { ref, workspace, accepted: true, note: workspace?.mode === "worktree" ? "Committed base only; dirty files/dependencies are not copied. Lead owns integration and cleanup; worktree retained." : undefined };
        } catch (error) {
          if (ref && action === "delegate_spawn") await this.coordinator.stop(ref.id).catch(() => {});
          await record({ action, status: "failed", ref, workspace, reason: error instanceof Error ? error.message.slice(0, 4000) : "Startup failed" }).catch(() => {});
          throw error;
        }
      })();
      this.operations.set(key, run);
      try { return await run; } finally { this.operations.delete(key); release(); }
    }
    if (action === "delegate_message") {
      const p = orchestrationOperations.delegate_message.parse(params);
      return this.coordinator.assign(actor.id, p.delegateId, toolId, p.content, p);
    }
    if (action === "delegate_inspect") {
      const p = orchestrationOperations.delegate_inspect.parse(params);
      return this.coordinator.snapshot(actor.id).delegates.filter(child => !p.delegateIds || p.delegateIds.includes(child.ref.id));
    }
    if (action === "delegate_wait") {
      const p = orchestrationOperations.delegate_wait.parse(params);
      await this.coordinator.persist(actor.id, { version: 1, sessionId: actor.id, operationId: toolId, kind: "intent", action: "wait", target: p.delegateIds.join(",").slice(0, 500) });
      const result = await this.coordinator.wait(actor.id, p.delegateIds, p.all ?? true, signal, p.timeout, p.assignmentIds);
      if (!signal.aborted && !this.coordinator.signal(actor.id).aborted) await this.coordinator.persist(actor.id, { version: 1, sessionId: actor.id, operationId: toolId, kind: "intent", action: "wait-resolved" });
      await this.coordinator.noteRead(actor.id, result.flatMap(child => child.reports.map(message => message.id)));
      return result;
    }
    if (action === "delegate_stop") {
      const p = orchestrationOperations.delegate_stop.parse(params);
      if (!this.coordinator.snapshot(actor.id).delegates.some(child => child.ref.id === p.delegateId)) throw new OrchestrationError("not_owner", "Delegate does not belong to you");
      await this.coordinator.stop(p.delegateId); return { stopped: p.delegateId };
    }
    if (action === "thread_list") {
      const p = orchestrationOperations.thread_list.parse(params), cursor = p.cursor ?? 0, limit = p.limit ?? 25;
      const leads = [];
      for (const ref of refs) if (!this.coordinator.snapshot(ref.id).relationship && !this.coordinator.snapshot(ref.id).roleUnavailable && (!p.cwd || ref.cwd === p.cwd) && (!p.state || (await this.adapter.finished(ref.file)) === (p.state === "finished"))) leads.push(ref);
      return { threads: leads.slice(cursor, cursor + limit).map(ref => { const snapshot = this.coordinator.snapshot(ref.id); return { ref, running: snapshot.running, busy: snapshot.busy, delegates: snapshot.delegates, inboxCount: snapshot.inbox.length, unreadCount: snapshot.inbox.filter(message => !snapshot.readMessageIds.includes(message.id)).length, pendingDeliveryCount: snapshot.pendingDelivery.length }; }), nextCursor: cursor + limit < leads.length ? cursor + limit : null };
    }
    if (action === "thread_read") {
      const p = orchestrationOperations.thread_read.parse(params);
      return readThread(target(p.threadId, false), p);
    }
    if (action === "thread_search") {
      const p = orchestrationOperations.thread_search.parse(params);
      return searchThreads(refs.filter(ref => !p.cwd || ref.cwd === p.cwd), p.query, p.cursor, p.limit);
    }
    if (action === "thread_inbox") {
      const p = orchestrationOperations.thread_inbox.parse(params), cursor = p.cursor ?? 0, limit = p.limit ?? 25;
      const reconciliation = await this.coordinator.reconcileDeliveries(actor.id);
      const current = this.coordinator.snapshot(actor.id);
      await this.coordinator.noteRead(actor.id, current.inbox.slice(cursor, cursor + limit).map(message => message.id));
      return { inbox: current.inbox.slice(cursor, cursor + limit), pendingDelivery: current.pendingDelivery, reconciliation, nextCursor: cursor + limit < current.inbox.length ? cursor + limit : null };
    }
    if (action === "thread_message") {
      const p = orchestrationOperations.thread_message.parse(params);
      const recipient = target(p.threadId);
      try { const message = await this.coordinator.send(actor.id, recipient.id, toolId, p.content); return { message, stage: "delivered-to-inbox", executed: false }; }
      catch (error) { if (!this.coordinator.snapshot(actor.id).pendingDelivery.some(message => message.operationId === toolId)) throw error; return { code: "delivery_pending", pending: this.coordinator.snapshot(actor.id).pendingDelivery, error: error instanceof Error ? error.message : String(error) }; }
    }
    if (action === "thread_wake") {
      const p = orchestrationOperations.thread_wake.parse(params), ref = target(p.threadId);
      await this.coordinator.wake(ref.id, p.messageIds, signal); await this.adapter.focus(ref); return { accepted: true };
    }
    const p = orchestrationOperations.thread_stop.parse(params), ref = target(p.threadId);
    if (action === "thread_stop") { await this.coordinator.stop(ref.id); return { stopped: ref }; }
    if (action === "thread_finish") {
      if (this.coordinator.busy(ref.id)) throw new OrchestrationError("busy", "Group is running, queued or waiting for an answer. Finish does not Stop work.");
      await this.adapter.finish(ref); return { finished: ref };
    }
    if (actor.id === ref.id) throw new OrchestrationError("wrong_role", "Cannot delete yourself");
    await this.coordinator.stop(ref.id); await this.adapter.remove(ref); this.coordinator.forget(ref.id);
    return { deleted: ref };
  }
}
