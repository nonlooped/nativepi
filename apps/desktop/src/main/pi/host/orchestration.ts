import type { AgentSession, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { z } from "zod";
import { ORCHESTRATION_ENTRY, delegateConfigurationSchema, orchestrationHostSchema, orchestrationMessageSchema, orchestrationRecordSchema, orchestrationOperations, orchestrationErrorCodes, type OrchestrationAction, type Assignment } from "../../../shared/orchestration.ts";
import { projectOrchestration } from "../../orchestration/records.ts";
import { serviceTiers, SERVICE_TIER_ENTRY } from "./serviceTier.ts";

const descriptions: Record<OrchestrationAction, string> = {
  orchestration_catalog: "Inspect available Pi models, reasoning levels, supported service tiers and tools in the target cwd. No credentials. Tool exposure is not a filesystem sandbox.",
  delegate_spawn: "Assign a fresh Pi delegate only your task plus its normal project instructions; no parent conversation is copied. Choose exact configuration from the catalog. Shared cwd is default; explicit worktree starts from committed base (default current HEAD), without dirty files or dependencies. Worktrees are retained; you own review, integration and cleanup. Returns acceptance, not completion. Delegates cannot delegate.",
  delegate_message: "Reply to your delegate's pending question or assign follow-up work in its own context. Use replyTo for multiple questions. Busy work queues through Pi. Stopped/failed/interrupted work requires resume:true. Configuration stays fixed; use a fresh delegate to change it.",
  delegate_inspect: "Inspect your delegates, assignment state, pending questions, result entry references, errors, configuration and actual workspace. Read full transcripts with thread_read.",
  delegate_wait: "Wait without polling for any/all selected assignments. Questions, errors, Stop and interruption break all-results waits too. Resolving this tool is the sole lead continuation; it schedules no extra wake. Timeout returns current state. A new user instruction releases the wait.",
  delegate_stop: "Stop one owned delegate and its queued work; retain its transcript/worktree and leave siblings running.",
  lead_message: "Delegate only: send progress or request a reply from your own lead. Progress is not assignment completion. needsReply:true asks a question; a final successful answer otherwise completes the assignment. You cannot choose another recipient.",
  thread_list: "Discover arbitrary Work leads, including cold and Finished threads, actual group state and inbox counts. No linking step. Cursor is an offset.",
  thread_search: "Search historical Work titles and user/assistant text without starting a model. Return bounded excerpts and entry/branch attribution.",
  thread_read: "Read bounded Pi history without starting a process. Includes entry/parent IDs and branch boundaries; optional leafId restricts ancestry. Tools and thinking are omitted unless requested.",
  thread_create: "Create an independent Work lead, never a child of the creator. cwd omitted means No project. Start only with start:true and prompt. Choose exact model/reasoning/tier/tools. Does not select the thread or consume the user's draft.",
  thread_message: "Durably deliver an attributed message to any discovered Work lead's inbox. This never wakes, steers or queues a model turn. Inspect delivery state; do not blindly resend a pending message.",
  thread_inbox: "Read your own pending inbox and delivery state without executing work.",
  thread_wake: "Explicitly supply selected pending inbox messages and request work in that Work lead. Busy leads use Pi follow-up semantics. Inbox arrival alone never starts execution.",
  thread_stop: "Fence new dispatch and Stop this Work lead's entire owned group, including starting delegates, waits and queued work. Independent peers are unaffected. Retain history and worktrees.",
  thread_finish: "Mark an idle Work group Finished through host organization. Refuse running, waiting or queued work. Does not Stop; history remains resumable.",
  thread_delete: "Stop/fence a Work group and delete only the requested lead through protected session deletion. Cannot delete yourself. Preserve child transcripts/worktrees and keep UI metadata if deletion fails.",
};
export function registerOrchestration(pi: ExtensionAPI): void {
  for (const [name, schema] of Object.entries(orchestrationOperations)) {
    pi.registerTool({
      name, label: name.replaceAll("_", " "), description: descriptions[name as OrchestrationAction],
      parameters: Type.Unsafe<Record<string, unknown>>(z.toJSONSchema(schema)),
      executionMode: "sequential",
      async execute(id, params, signal) {
        if (!globalThis.__NATIVEPI_ORCHESTRATION__) throw new Error("NativePi orchestration host unavailable");
        try {
          const details = await globalThis.__NATIVEPI_ORCHESTRATION__(name, schema.parse(params), `${name}:${id}`, signal);
          return { content: [{ type: "text", text: JSON.stringify(details) }], details };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: message }], details: { code: orchestrationErrorCodes.find(code => message.startsWith(`${code}:`)) ?? "startup_failed", error: message }, isError: true };
        }
      },
    });
  }
  pi.on("before_agent_start", async (event, context) => {
    if (globalThis.__NATIVEPI_DISPATCH_FENCED__) throw new Error("stopped: Dispatch fenced");
    const projection = projectOrchestration(context.sessionManager.getSessionId(), context.sessionManager.getEntries());
    const relationship = projection.relationship;
    if (relationship) {
      const names = new Set(pi.getAllTools().map(tool => tool.name));
      for (const tool of relationship.configuration.tools) if (!names.has(tool)) throw new Error(`unavailable_tool: Delegate's selected tool ${tool} disappeared. Stop and repair configuration.`);
      pi.setActiveTools([...new Set([...relationship.configuration.tools, "lead_message"])]);
    }
    return { systemPrompt: `${event.systemPrompt}\n\n${relationship
      ? `You are a NativePi delegate for lead ${relationship.lead.id}. Work only on the lead-provided task and follow-ups. Your own context is fresh initially. You cannot spawn delegates or manage/message peers. Use lead_message for progress or a question (needsReply:true). Questions are distinct from final completion. End successful work with a substantive final answer including verification and worktree path/branch when relevant. The lead owns integration and cleanup. Tool selection is not a security sandbox.`
      : "You are a NativePi Work lead. You may use orchestration_catalog and delegate tools for fresh independent assignments; specify task context explicitly. Inspect progress/questions/results, reply to questions, and use delegate_wait rather than polling. You own integration of worktrees; no automatic merge or cleanup occurs. Historical thread tools work independently. Peer inbox messages never wake a lead: thread_wake is a separate explicit action. Stop fences the owned group; Finish only marks an idle group Finished. Restart never automatically resumes interrupted work."}` };
  });
}

export async function configureOrchestrationSession(session: AgentSession, config: z.infer<typeof delegateConfigurationSchema>): Promise<void> {
  const available = new Set(session.getAllTools().map(tool => tool.name));
  for (const name of config.tools) if (!available.has(name)) throw new Error(`unavailable_tool: ${name}`);
  const models = await session.modelRuntime.getAvailable();
  if (globalThis.__NATIVEPI_DISPATCH_FENCED__) throw new Error("stopped: Dispatch fenced");
  const model = models.find(model => model.provider === config.provider && model.id === config.model);
  if (!model || !getSupportedThinkingLevels(model).includes(config.reasoning)) throw new Error("unsupported_configuration: Model/reasoning unavailable in this cwd");
  if (config.tier === "priority" && !serviceTiers(model).includes(config.tier)) throw new Error("unsupported_configuration: Priority unavailable");
  if (session.isStreaming || session.isCompacting) {
    if (session.model?.provider !== config.provider || session.model.id !== config.model || session.thinkingLevel !== config.reasoning) throw new Error("busy: Delegate configuration differs from its accepted configuration");
  } else {
    // persist:false is important: model selection must not change Pi defaults.
    await session.setModel(model, { persist: false });
    session.setThinkingLevel(config.reasoning, { persist: false });
    session.sessionManager.appendCustomEntry(SERVICE_TIER_ENTRY, { tier: config.tier ?? "default" });
    const relationship = projectOrchestration(session.sessionManager.getSessionId(), session.sessionManager.getEntries()).relationship;
    session.setActiveToolsByName([...new Set([...config.tools, ...(relationship ? ["lead_message"] : [])])]);
  }
}

export async function restoreOrchestrationConfiguration(session: AgentSession): Promise<void> {
  const entries = session.sessionManager.getEntries();
  const id = session.sessionManager.getSessionId();
  const role = projectOrchestration(id, entries).relationship;
  if (role) { await configureOrchestrationSession(session, role.configuration); return; }
  if (entries.some(entry => entry.type === "message" && (entry.message.role === "user" || entry.message.role === "assistant"))) return;
  const profile = entries.map(entry => entry.type === "custom" && entry.customType === ORCHESTRATION_ENTRY ? orchestrationRecordSchema.safeParse(entry.data) : undefined).findLast(parsed => parsed?.success && parsed.data.sessionId === id && parsed.data.kind === "configuration");
  if (!profile?.success || profile.data.kind !== "configuration") return;
  const model = entries.findLast(entry => entry.type === "model_change");
  const thinking = entries.findLast(entry => entry.type === "thinking_level_change");
  const config = { ...profile.data.configuration,
    ...(model?.type === "model_change" ? { provider: model.provider, model: model.modelId } : {}),
    ...(thinking?.type === "thinking_level_change" ? { reasoning: thinking.thinkingLevel } : {}),
  };
  await configureOrchestrationSession(session, delegateConfigurationSchema.parse(config));
}

/** AgentSession owns all appends/configuration/execution; main only coordinates. */
export function bindOrchestrationHost(session: AgentSession): () => void {
  const initialId = session.sessionManager.getSessionId();
  if (globalThis.__NATIVEPI_ORCHESTRATION_SESSION__ !== initialId) globalThis.__NATIVEPI_DISPATCH_FENCED__ = false;
  globalThis.__NATIVEPI_ORCHESTRATION_SESSION__ = initialId;
  // A rejected extension event is only diagnostic in Pi. Enforce the dispatch
  // fence at the supported model-runtime boundary too, before any provider call.
  const originalStream = session.modelRuntime.streamSimple;
  const guardedStream: typeof originalStream = (model, context, options) => {
    if (globalThis.__NATIVEPI_DISPATCH_FENCED__) throw new Error("stopped: Dispatch fenced");
    const relationship = projectOrchestration(session.sessionManager.getSessionId(), session.sessionManager.getEntries()).relationship;
    if (relationship) {
      const available = new Set(session.getAllTools().map(tool => tool.name));
      for (const tool of relationship.configuration.tools) if (!available.has(tool)) throw new Error(`unavailable_tool: ${tool}`);
      if (model.provider !== relationship.configuration.provider || model.id !== relationship.configuration.model) throw new Error("unsupported_configuration: Delegate model changed");
    }
    return originalStream.call(session.modelRuntime, model, context, options);
  };
  session.modelRuntime.streamSimple = guardedStream;
  let armed: Pick<Assignment, "id" | "attempt" | "taskMessageId"> | undefined;
  let armedSupplied = false;
  let afterEntry: string | undefined;
  const accepted = new Set<string>();
  const send = (value: unknown) => { if (process.connected) process.send?.(value); };
  const listener = (raw: unknown) => {
    const fence = z.object({ type: z.literal("nativepi_orchestration_fence"), sessionId: z.string() }).safeParse(raw);
    if (fence.success) {
      if (fence.data.sessionId === session.sessionManager.getSessionId()) { globalThis.__NATIVEPI_DISPATCH_FENCED__ = true; void session.abort(); }
      return;
    }
    const parsed = orchestrationHostSchema.safeParse(raw);
    if (!parsed.success) return;
    const { requestId, sessionId, action, payload } = parsed.data;
    const reply = (result?: unknown, error?: string) => send({ type: "nativepi_orchestration_reply", requestId, result, error });
    void (async () => {
      if (session.sessionManager.getSessionId() !== sessionId) throw new Error("external_session_change: Pi binding changed");
      if (action === "append") {
        const record = orchestrationRecordSchema.parse(payload);
        if (record.sessionId !== sessionId) throw new Error("Record identity mismatch");
        session.sessionManager.appendCustomEntry(ORCHESTRATION_ENTRY, record);
        reply(true);
      } else if (action === "arm") {
        armed = z.object({ id: z.string(), attempt: z.number(), taskMessageId: z.string() }).parse(payload);
        afterEntry = session.sessionManager.getLeafId() ?? undefined; armedSupplied = false; reply(true);
      } else if (action === "catalog") {
        const models = await session.modelRuntime.getAvailable();
        reply({ models: models.map(model => ({ provider: model.provider, id: model.id, reasoning: getSupportedThinkingLevels(model), tiers: serviceTiers(model) })), tools: session.getAllTools(), activeTools: session.getActiveToolNames(), exposure: "Pi active declaration; codemode/MCP and trusted extensions may expose additional callable tools. Not a sandbox." });
      } else if (action === "configure") {
        if (globalThis.__NATIVEPI_DISPATCH_FENCED__) throw new Error("stopped: Dispatch fenced");
        const config = delegateConfigurationSchema.parse(payload);
        await configureOrchestrationSession(session, config);
        session.sessionManager.appendCustomEntry(ORCHESTRATION_ENTRY, { version: 1, sessionId, operationId: `configuration:${sessionId}`, kind: "configuration", configuration: config });
        reply({ activeTools: session.getActiveToolNames() });
      } else {
        if (globalThis.__NATIVEPI_DISPATCH_FENCED__) throw new Error("stopped: Dispatch fenced");
        const message = orchestrationMessageSchema.parse(payload);
        if (message.destination.id !== sessionId) throw new Error("Message destination mismatch");
        const entries = session.sessionManager.getEntries();
        const projection = projectOrchestration(sessionId, entries);
        if (projection.relationship && message.source.id !== projection.relationship.lead.id) throw new Error("not_owner: Delegate dispatch requires owning lead");
        if (!projection.inbox.has(message.id) && !projection.consumed.has(message.id)) throw new Error("Dispatch requires durable receipt");
        const supplied = entries.some(entry => entry.type === "custom_message" && (entry.details as { id?: string } | undefined)?.id === message.id);
        if (action === "context") {
          if (supplied || accepted.has(message.id)) { reply({ accepted: true, supplied }); return; }
          accepted.add(message.id);
          await session.sendCustomMessage({ customType: ORCHESTRATION_ENTRY, content: `[${message.kind} from Work thread ${message.source.id}]\n${message.content}`, display: true, details: message }, { triggerTurn: false });
          reply({ accepted: true, supplied: !session.isStreaming }); return;
        }
        if (!accepted.has(message.id) && !supplied) {
          accepted.add(message.id);
          // Acceptance is the already-persisted receipt; this promise is the
          // complete Pi run, deliberately observed separately from the reply.
          const execution = armed;
          void session.sendCustomMessage({ customType: ORCHESTRATION_ENTRY, content: `[${message.kind} from Work thread ${message.source.id}]\n${message.content}`, display: true, details: message }, { triggerTurn: true, deliverAs: "followUp" }).catch(error => {
            accepted.delete(message.id);
            send({ type: "nativepi_orchestration_outcome", sessionId, assignmentId: execution?.id, attempt: execution?.attempt, taskMessageId: message.id, aborted: false, stopReason: "error", reason: error instanceof Error ? error.message : String(error) });
          }).finally(() => send({ type: "nativepi_orchestration_runtime", sessionId: session.sessionManager.getSessionId(), running: !session.isIdle }));
        }
        reply({ accepted: true, supplied, running: !session.isIdle });
      }
    })().catch(error => reply(undefined, error instanceof Error ? error.message : String(error)));
  };
  process.on("message", listener);
  const unsubscribe = session.subscribe(event => {
    if (event.type === "message_end" && event.message.role === "custom" && event.message.customType === ORCHESTRATION_ENTRY) {
      const parsed = orchestrationMessageSchema.safeParse(event.message.details);
      if (parsed.success) queueMicrotask(() => {
        // Pi emits message_end before appending. Observe persistence after its
        // synchronous append, never acknowledge the public event itself.
        const message = parsed.data;
        if (!session.sessionManager.getEntries().some(entry => entry.type === "custom_message" && (entry.details as { id?: string } | undefined)?.id === message.id)) return;
        if (armed?.taskMessageId === message.id) armedSupplied = true;
        const projection = projectOrchestration(session.sessionManager.getSessionId(), session.sessionManager.getEntries());
        if (!projection.consumed.has(message.id)) session.sessionManager.appendCustomEntry(ORCHESTRATION_ENTRY, { version: 1, sessionId: session.sessionManager.getSessionId(), operationId: message.operationId, kind: "message", message, stage: "consumed" });
        send({ type: "nativepi_orchestration_supplied", sessionId: session.sessionManager.getSessionId(), messageId: message.id });
      });
    }
    if (event.type !== "agent_settled" || !armed || !armedSupplied) return;
    const branch = session.sessionManager.getBranch();
    const final = branch.slice(afterEntry ? branch.findIndex(entry => entry.id === afterEntry) + 1 : 0).findLast(entry => entry.type === "message" && entry.message.role === "assistant");
    const message = final?.type === "message" ? final.message : undefined;
    const substantive = message && "content" in message && Array.isArray(message.content) && message.content.some(part => part.type === "text" && "text" in part && typeof part.text === "string" && part.text.trim());
    send({ type: "nativepi_orchestration_outcome", sessionId: session.sessionManager.getSessionId(), assignmentId: armed.id, attempt: armed.attempt, taskMessageId: armed.taskMessageId, aborted: event.aborted, resultEntry: substantive ? final?.id : undefined, stopReason: message && "stopReason" in message ? message.stopReason : undefined, reason: message && "errorMessage" in message ? message.errorMessage : undefined });
  });
  return () => { process.off("message", listener); unsubscribe(); if (session.modelRuntime.streamSimple === guardedStream) session.modelRuntime.streamSimple = originalStream; };
}
