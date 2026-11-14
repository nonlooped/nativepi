import { expect, test } from "bun:test";
import { OrchestrationCoordinator, type OrchestrationAdapter } from "./coordinator.ts";
import { OrchestrationService, type ThreadServiceAdapter } from "./service.ts";
import { ORCHESTRATION_ENTRY, type ThreadReference, type OrchestrationMessage } from "../../shared/orchestration.ts";
const lead = { id: "lead", cwd: "/repo", file: "/lead" };
const peer = { id: "peer", cwd: "/other", file: "/peer" };
const configuration = { provider: "provider", model: "model", reasoning: "off", tools: ["read"] };
function fixture() {
  const entries = new Map<string, unknown[]>();
  const refs = [lead, peer];
  const dispatched: OrchestrationMessage[] = [], stopped: string[] = [], finished: string[] = [];
  const adapter: OrchestrationAdapter = {
    read: async ref => entries.get(ref.id) ?? [],
    append: async (ref, record) => { const list = entries.get(ref.id) ?? []; list.push({ type: "custom", customType: ORCHESTRATION_ENTRY, data: record }); entries.set(ref.id, list); },
    dispatch: async (_ref, message, signal) => { signal.throwIfAborted(); dispatched.push(message); },
    stop: async ref => { stopped.push(ref.id); }, running: () => false, publish: () => {}, configure: async () => {},
  };
  const coordinator = new OrchestrationCoordinator(adapter);
  const operations: ThreadServiceAdapter = {
    discover: async () => refs,
    allocate: async (cwd, _title, initial) => { const id = `allocated-${refs.length}`; const ref = { id, cwd, file: `/${id}` }; refs.push(ref); if (initial) entries.set(id, [{ type: "custom", customType: ORCHESTRATION_ENTRY, data: { version: 1, sessionId: id, operationId: initial.operationId, kind: "relationship", relationship: { ...initial, delegate: ref } } }]); return ref; },
    catalog: async () => ({ models: [configuration], tools: ["read"] }),
    workRoot: async () => "/work",
    workspace: async (ref, branch, base) => ({ mode: "worktree", path: "/worktree", repository: ref.cwd, branch, base: base ?? "commit" }),
    configuration: async () => {},
    finish: async ref => { finished.push(ref.id); }, focus: async () => {}, finished: async () => false,
    remove: async ref => { refs.splice(refs.indexOf(ref), 1); },
  };
  const service = new OrchestrationService(coordinator, operations);
  const invoke = (action: string, params: Record<string, unknown>, operationId = action) => service.invoke(lead, action, params, operationId, new AbortController().signal);
  const setup = async () => { await service.discover(); coordinator.resumeLead(lead.id); };
  return { refs, entries, adapter, coordinator, operations, service, invoke, setup, dispatched, stopped, finished };
}
test("spawn duplicate transport allocates once, preserves exact task and supports full question/reply cycle", async () => {
  const f = fixture(); await f.setup();
  const p = { label: "Review", task: "Only this task", configuration };
  const [a, b] = await Promise.all([f.invoke("delegate_spawn", p, "same-tool"), f.invoke("delegate_spawn", p, "same-tool")]) as { ref: ThreadReference }[];
  expect(a!.ref).toEqual(b!.ref); expect(f.refs).toHaveLength(3);
  expect(f.dispatched.map(message => message.content)).toEqual(["Only this task"]);
  const child = a!.ref;
  await f.service.invoke(child, "lead_message", { content: "Which test?", needsReply: true }, "question", new AbortController().signal);
  const current = f.coordinator.snapshot(child.id).assignment!;
  await f.coordinator.settled(child.id, { assignmentId: current.id, attempt: current.attempt, taskMessageId: current.taskMessageId, aborted: false, resultEntry: "answer", stopReason: "stop" });
  const result = await f.invoke("delegate_wait", { delegateIds: [child.id] }) as ReturnType<OrchestrationCoordinator["snapshot"]>[];
  expect(result[0]?.reports[0]?.content).toBe("Which test?");
  await f.invoke("delegate_message", { delegateId: child.id, content: "Unit test" });
  expect(f.coordinator.snapshot(child.id).assignment?.id).toBe(current.id);
  await expect(f.service.invoke(child, "delegate_spawn", p, "nested", new AbortController().signal)).rejects.toThrow("Delegates cannot");
});
test("peer delivery remains idle until selected wake; Finish rejects active groups", async () => {
  const f = fixture(); await f.setup();
  await f.invoke("thread_message", { threadId: peer.id, content: "Hello" });
  expect(f.dispatched).toHaveLength(0);
  const pending = f.coordinator.snapshot(peer.id).inbox[0]!;
  await f.invoke("thread_wake", { threadId: peer.id, messageIds: [pending.id] });
  expect(f.dispatched[0]?.content).toBe("Hello");
  await f.invoke("delegate_spawn", { label: "Review", task: "Work", configuration });
  await expect(f.invoke("thread_finish", { threadId: lead.id })).rejects.toThrow("Group is running");
  await f.invoke("thread_stop", { threadId: lead.id });
  await f.invoke("thread_finish", { threadId: lead.id });
  expect(f.finished).toEqual([lead.id]);
});
test("created leads are independent; deleting a parent preserves child transcripts and workspace", async () => {
  const f = fixture(); await f.setup();
  const created = await f.invoke("thread_create", { title: "Independent", configuration }) as { ref: ThreadReference };
  const spawned = await f.invoke("delegate_spawn", { label: "Isolated", task: "Work", configuration, workspace: { mode: "worktree", base: "explicit" } }) as { ref: ThreadReference; workspace: { path: string; base: string } };
  expect(spawned.ref.cwd).toBe("/worktree"); expect(spawned.workspace.base).toBe("explicit");
  await f.coordinator.stop(lead.id);
  expect(f.stopped).not.toContain(created.ref.id);
  await expect(f.invoke("thread_delete", { threadId: lead.id })).rejects.toThrow("Cannot delete yourself");
  await f.service.invoke(peer, "thread_delete", { threadId: lead.id }, "delete", new AbortController().signal);
  expect(f.refs.some(ref => ref.id === lead.id)).toBe(false);
  expect(f.refs.some(ref => ref.id === spawned.ref.id)).toBe(true);
  expect(f.coordinator.snapshot(spawned.ref.id).relationship?.lead.id).toBe(lead.id);
});
test("Stop during allocation leaves an inspectable delegate but never dispatches late work", async () => {
  const f = fixture(); await f.setup();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const allocate = f.operations.allocate;
  f.operations.allocate = async (...args) => { entered.resolve(); await release.promise; return allocate(...args); };
  const spawning = f.invoke("delegate_spawn", { label: "Review", task: "Must not run", configuration }).catch(error => error);
  await entered.promise; await f.coordinator.stop(lead.id); release.resolve(); await spawning;
  expect(f.dispatched).toHaveLength(0);
  const child = f.refs.at(-1)!;
  expect(f.coordinator.snapshot(child.id).relationship?.lead.id).toBe(lead.id);
});
test("restart preserves accepted operations without repeating allocation or execution", async () => {
  const f = fixture(); await f.setup();
  const params = { label: "Review", task: "Task", configuration };
  await f.invoke("delegate_spawn", params, "durable");
  const restartedAdapter: OrchestrationAdapter = { read: async ref => f.entries.get(ref.id) ?? [], append: async () => { throw new Error("recovery must not write"); }, dispatch: async () => { throw new Error("recovery must not execute"); }, stop: async () => {}, running: () => false, publish: () => {} };
  const restarted = new OrchestrationCoordinator(restartedAdapter);
  const service = new OrchestrationService(restarted, f.operations);
  await service.discover(); restarted.resumeLead(lead.id);
  const result = await service.invoke(lead, "delegate_spawn", params, "durable", new AbortController().signal) as { recovered: boolean };
  expect(result.recovered).toBe(true); expect(f.refs).toHaveLength(3);
  expect(restarted.snapshot(f.refs.at(-1)!.id).assignment?.state).toBe("interrupted");
});

test("a cold lead discovers ownership before stopping its delegate", async () => {
  const f = fixture(); await f.setup();
  const spawned = await f.invoke("delegate_spawn", { label: "Review", task: "Work", configuration }) as { ref: ThreadReference };
  const cold = new OrchestrationCoordinator(f.adapter);
  const service = new OrchestrationService(cold, f.operations);
  await service.invoke(lead, "delegate_stop", { delegateId: spawned.ref.id }, "stop-cold", new AbortController().signal);
  expect(cold.snapshot(spawned.ref.id).assignment?.state).toBe("stopped");
  expect(f.stopped).toContain(spawned.ref.id);
});
test("an unreadable history reference does not block healthy threads' discovery", async () => {
  const f = fixture(); await f.setup();
  const missing = { id: "missing", cwd: "/gone", file: "/gone/session" };
  f.refs.push(missing);
  const read = f.adapter.read;
  f.adapter.read = async ref => { if (ref.id === missing.id) throw new Error("ENOENT"); return read(ref); };
  expect((await f.service.discover()).map(ref => ref.id)).toEqual(["lead", "peer"]);
});

test("worktree path/base intent is durable before creation, including Stop during creation", async () => {
  const f = fixture(); await f.setup();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  f.operations.workspace = async (ref, branch, base, prepared) => {
    const workspace = { mode: "worktree" as const, path: "/retained-worktree", branch, base: base ?? "captured-head", repository: ref.cwd };
    await prepared?.(workspace); entered.resolve(); await release.promise; return workspace;
  };
  const spawning = f.invoke("delegate_spawn", { label: "Work", task: "Must not run", configuration, workspace: { mode: "worktree" } }).catch(error => error);
  await entered.promise;
  expect(JSON.stringify(f.entries.get(lead.id))).toContain("/retained-worktree");
  expect(JSON.stringify(f.entries.get(lead.id))).toContain("captured-head");
  await f.coordinator.stop(lead.id); release.resolve(); await spawning;
  expect(f.dispatched).toHaveLength(0);
});
