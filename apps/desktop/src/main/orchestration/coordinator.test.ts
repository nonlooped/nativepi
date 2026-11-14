import { expect, test } from "bun:test";
import { OrchestrationCoordinator, type OrchestrationAdapter } from "./coordinator.ts";
import { ORCHESTRATION_ENTRY, type OrchestrationRecord, type ThreadReference, type OrchestrationMessage } from "../../shared/orchestration.ts";
const lead = { id: "lead", cwd: "/repo", file: "/lead" };
const child = { id: "child", cwd: "/repo", file: "/child" };
const peer = { id: "peer", cwd: "/other", file: "/peer" };
function fixture() {
  const entries = new Map<string, unknown[]>();
  const dispatched: OrchestrationMessage[] = [];
  const stopped: string[] = [];
  const adapter: OrchestrationAdapter = {
    read: async ref => entries.get(ref.id) ?? [],
    append: async (ref, record) => { const list = entries.get(ref.id) ?? []; list.push({ customType: ORCHESTRATION_ENTRY, data: record }); entries.set(ref.id, list); },
    dispatch: async (_ref, message, signal) => { signal.throwIfAborted(); dispatched.push(message); },
    stop: async ref => { stopped.push(ref.id); },
    running: () => false,
    publish: () => {},
  };
  const coordinator = new OrchestrationCoordinator(adapter);
  async function setup() {
    for (const ref of [lead, child, peer]) await coordinator.hydrate(ref);
    coordinator.resumeLead(lead.id);
    await coordinator.register({ operationId: "spawn", lead, delegate: child, label: "Review", configuration: { provider: "test", model: "model", reasoning: "off", tools: ["read"] }, workspace: { mode: "shared", path: "/repo" } });
  }
  return { coordinator, entries, dispatched, stopped, adapter, setup };
}
test("fresh task, progress, question, reply, completion and follow-up stay distinct", async () => {
  const f = fixture(); await f.setup();
  const first = await f.coordinator.assign("lead", "child", "task", "Review the change.");
  expect(f.dispatched[0]?.content).toBe("Review the change.");
  await f.coordinator.report("child", "progress", "Reading", false);
  expect(f.coordinator.snapshot("child").assignment?.state).toBe("running");
  const question = await f.coordinator.report("child", "question", "Which branch?", true);
  const waiting = f.coordinator.wait("lead", ["child"], true, new AbortController().signal);
  await f.coordinator.settled("child", { assignmentId: f.coordinator.snapshot("child").assignment!.id, attempt: f.coordinator.snapshot("child").assignment!.attempt, aborted: false, stopReason: "stop", resultEntry: "answer1" });
  expect((await waiting)[0]?.assignment?.state).toBe("waiting");
  const reply = await f.coordinator.assign("lead", "child", "reply", "main", { replyTo: question.id });
  expect(reply.id).toBe(first.id);
  await f.coordinator.settled("child", { assignmentId: f.coordinator.snapshot("child").assignment!.id, attempt: f.coordinator.snapshot("child").assignment!.attempt, aborted: false, stopReason: "stop", resultEntry: "answer2" });
  expect(f.coordinator.snapshot("child").assignment?.state).toBe("completed");
  const followUp = await f.coordinator.assign("lead", "child", "follow", "Check again.");
  expect(followUp.id).not.toBe(first.id);
});
test("peer inbox delivery and retries never dispatch work", async () => {
  const f = fixture(); await f.setup();
  await Promise.all([f.coordinator.send("lead", "peer", "mail", "Context"), f.coordinator.send("lead", "peer", "mail", "Context")]);
  expect(f.dispatched).toHaveLength(0);
  expect(f.coordinator.snapshot("peer").inbox).toHaveLength(1);
  const restored = new OrchestrationCoordinator(f.adapter);
  await restored.hydrate(peer);
  expect(restored.snapshot("peer").inbox).toHaveLength(1);
});
test("delegates cannot manage peers, spawn, or impersonate an owning lead", async () => {
  const f = fixture(); await f.setup();
  await expect(f.coordinator.send("child", "peer", "mail", "Hi")).rejects.toThrow("Only Work leads");
  await expect(f.coordinator.assign("peer", "child", "steal", "Work")).rejects.toThrow("another lead");
  expect(() => f.coordinator.resumeLead("child")).toThrow("Only Work leads");
});
test("Stop fences late completion, cancels waits and does not stop independent peers", async () => {
  const f = fixture(); await f.setup();
  await f.coordinator.assign("lead", "child", "task", "Work");
  const wait = f.coordinator.wait("lead", ["child"], true, new AbortController().signal);
  await f.coordinator.stop("lead"); await wait;
  expect(f.stopped.sort()).toEqual(["child", "lead"]);
  await f.coordinator.settled("child", { assignmentId: f.coordinator.snapshot("child").assignment!.id, attempt: f.coordinator.snapshot("child").assignment!.attempt, aborted: false, stopReason: "stop", resultEntry: "late" });
  expect(f.coordinator.snapshot("child").assignment?.state).toBe("stopped");
  await expect(f.coordinator.assign("lead", "child", "late", "Work")).rejects.toThrow("stopped");
  f.coordinator.resumeLead("lead");
  await expect(f.coordinator.assign("lead", "child", "ordinary", "Work")).rejects.toThrow("resume");
  await f.coordinator.assign("lead", "child", "resume", "Continue", { resume: true });
  expect(f.coordinator.snapshot("child").assignment?.attempt).toBe(2);
});
test("non-successful settled outcomes never complete assignments", async () => {
  for (const outcome of [{ aborted: true, stopReason: "stop", resultEntry: "x" }, { aborted: false, stopReason: "length", resultEntry: "x" }, { aborted: false, stopReason: "error" }, { aborted: false, stopReason: "stop" }]) {
    const f = fixture(); await f.setup(); await f.coordinator.assign("lead", "child", "task", "Work");
    await f.coordinator.settled("child", { ...outcome, assignmentId: f.coordinator.snapshot("child").assignment!.id, attempt: f.coordinator.snapshot("child").assignment!.attempt });
    expect(f.coordinator.snapshot("child").assignment?.state).toBe("failed");
  }
});
test("failed receipt preserves sender intent for recovery", async () => {
  const f = fixture(); await f.setup();
  const append = f.adapter.append;
  f.adapter.append = async (ref: ThreadReference, record: OrchestrationRecord) => { if (ref.id === "peer") throw new Error("external_session_change"); return append(ref, record); };
  await expect(f.coordinator.send("lead", "peer", "mail", "Context")).rejects.toThrow("external_session_change");
  expect(f.coordinator.snapshot("lead").pendingDelivery).toHaveLength(1);
  f.adapter.append = append;
  await f.coordinator.send("lead", "peer", "mail", "Context");
  expect(f.coordinator.snapshot("peer").inbox).toHaveLength(1);
  expect(f.coordinator.snapshot("lead").pendingDelivery).toHaveLength(0);
});

test("Stop during pending acceptance fences late dispatch and releases its wait", async () => {
  const f = fixture(); await f.setup();
  const entered = Promise.withResolvers<void>();
  f.adapter.dispatch = async (_ref, _message, signal) => {
    entered.resolve();
    await new Promise<void>((_resolve, reject) => {
      if (signal.aborted) reject(new Error("aborted"));
      else signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };
  const assignment = f.coordinator.assign("lead", "child", "task", "Work");
  const rejected = assignment.then(() => undefined, error => error as Error);
  await entered.promise;
  await f.coordinator.stop("lead");
  expect((await rejected)?.message).toContain("aborted");
  expect(f.coordinator.snapshot("child").assignment?.state).toBe("stopped");
  expect(f.dispatched).toHaveLength(0);
});
test("failed dispatch is inspectable and requires explicit resumption", async () => {
  const f = fixture(); await f.setup();
  f.adapter.dispatch = async () => { throw new Error("Pi unavailable"); };
  await expect(f.coordinator.assign("lead", "child", "task", "Work")).rejects.toThrow("Pi unavailable");
  expect(f.coordinator.snapshot("child").assignment?.state).toBe("failed");
  await expect(f.coordinator.assign("lead", "child", "retry", "Work")).rejects.toThrow("resume");
});
test("a failed durable Stop still aborts actual work and retains its dispatch fence", async () => {
  const f = fixture(); await f.setup();
  await f.coordinator.assign("lead", "child", "task", "Work");
  const original = f.adapter.append;
  f.adapter.append = async (ref, record) => { if (record.kind === "stop") throw new Error("external writer"); await original(ref, record); };
  await expect(f.coordinator.stop("lead")).rejects.toThrow("could not be stopped");
  expect(f.stopped.sort()).toEqual(["child", "lead"]);
  await expect(f.coordinator.assign("lead", "child", "late", "Work")).rejects.toThrow("stopped");
});
test("an aborted user wait releases without stopping delegates or scheduling a wake", async () => {
  const f = fixture(); await f.setup();
  await f.coordinator.assign("lead", "child", "task", "Work");
  const controller = new AbortController();
  const waiting = f.coordinator.wait("lead", ["child"], true, controller.signal);
  controller.abort(); await waiting;
  expect(f.stopped).toHaveLength(0);
  expect(f.coordinator.snapshot("child").assignment?.state).toBe("running");
});

test("an explicit peer wake supplies only selected inbox content", async () => {
  const f = fixture(); await f.setup();
  const first = await f.coordinator.send("lead", "peer", "first", "First message");
  await f.coordinator.send("lead", "peer", "second", "Second message");
  await f.coordinator.wake("peer", [first.id], new AbortController().signal);
  expect(f.dispatched.map(message => message.content)).toEqual(["First message"]);
  expect(f.coordinator.snapshot("peer").inbox.map(message => message.content)).toEqual(["Second message"]);
  await expect(f.coordinator.wake("peer", [], new AbortController().signal)).rejects.toThrow("Select unique");
});
test("late outcomes cannot complete a newer assignment or execution attempt", async () => {
  const f = fixture(); await f.setup();
  const first = await f.coordinator.assign("lead", "child", "task", "Work");
  await f.coordinator.stop("child");
  await f.coordinator.assign("lead", "child", "resume", "Continue", { resume: true });
  await f.coordinator.settled("child", { assignmentId: first.id, attempt: first.attempt, aborted: false, stopReason: "stop", resultEntry: "old" });
  expect(f.coordinator.snapshot("child").assignment?.state).toBe("running");
});

test("repeated Stop is single-flight while the actual runtimes are disposing", async () => {
  const f = fixture(); await f.setup(); await f.coordinator.assign("lead", "child", "task", "Work");
  const release = Promise.withResolvers<void>();
  f.adapter.stop = async ref => { f.stopped.push(ref.id); await release.promise; };
  const first = f.coordinator.stop("lead");
  expect(f.coordinator.stop("lead")).toBe(first);
  expect(f.coordinator.stop("child")).toBe(first);
  release.resolve(); await first;
  expect(f.stopped.sort()).toEqual(["child", "lead"]);
});
test("a wait for a completed assignment cannot accidentally wait for its newer follow-up", async () => {
  const f = fixture(); await f.setup();
  const first = await f.coordinator.assign("lead", "child", "task", "Work");
  await f.coordinator.settled("child", { assignmentId: first.id, attempt: first.attempt, taskMessageId: first.taskMessageId, aborted: false, stopReason: "stop", resultEntry: "done" });
  await f.coordinator.assign("lead", "child", "followup", "More work");
  const result = await f.coordinator.wait("lead", ["child"], true, new AbortController().signal, 1000, { child: first.id });
  expect(result[0]?.assignment?.state).toBe("completed");
  expect(f.coordinator.snapshot("child").assignment?.state).toBe("running");
});

test("lost sender acknowledgment reconciles against a recipient that already consumed the message", async () => {
  const f = fixture(); await f.setup();
  const append = f.adapter.append;
  f.adapter.append = async (ref, record) => { if (ref.id === "lead" && record.kind === "message" && record.stage === "acknowledged") throw new Error("ack lost"); await append(ref, record); };
  await expect(f.coordinator.send("lead", "peer", "message", "Accepted content")).rejects.toThrow("ack lost");
  const message = f.coordinator.snapshot("peer").inbox[0]!;
  await f.coordinator.wake("peer", [message.id], new AbortController().signal);
  f.adapter.append = append;
  expect(await f.coordinator.reconcileDeliveries("lead")).toEqual([{ messageId: message.id, delivered: true }]);
  expect(f.coordinator.snapshot("lead").pendingDelivery).toHaveLength(0);
  expect(f.dispatched).toHaveLength(1);
});

test("configuration failure records a failed assignment and sender intent before any dispatch", async () => {
  const f = fixture(); await f.setup();
  f.adapter.configure = async () => { throw new Error("unavailable_tool: removed extension tool"); };
  await expect(f.coordinator.assign("lead", "child", "configuration-failure", "Retained task")).rejects.toThrow("unavailable_tool");
  expect(f.coordinator.snapshot("child").assignment).toMatchObject({ state: "failed", reason: "unavailable_tool: removed extension tool" });
  expect(f.coordinator.snapshot("lead").pendingDelivery[0]?.content).toBe("Retained task");
  expect(f.dispatched).toHaveLength(0);
});
test("a completed delegate accepts a normal follow-up after group Stop and explicit lead resumption", async () => {
  const f = fixture(); await f.setup();
  const assignment = await f.coordinator.assign("lead", "child", "task", "Work");
  await f.coordinator.settled("child", { assignmentId: assignment.id, attempt: assignment.attempt, aborted: false, resultEntry: "done", stopReason: "stop" });
  await f.coordinator.stop("lead"); f.coordinator.resumeLead("lead");
  const next = await f.coordinator.assign("lead", "child", "follow-up", "More work");
  expect(next.state).toBe("running");
  expect(next.id).not.toBe(assignment.id);
});
