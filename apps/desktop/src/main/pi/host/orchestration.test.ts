import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSession, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, type Context, type AssistantMessage } from "@earendil-works/pi-ai";
import { bindOrchestrationHost } from "./orchestration.ts";
import { allocateThread } from "../../orchestration/allocation.ts";
import { ORCHESTRATION_ENTRY, type OrchestrationMessage } from "../../../shared/orchestration.ts";

test("pinned Pi accepts a durable attributed task before completion and classifies only agent_settled", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-pi-orchestration-"));
  const priorSend = process.send;
  const descriptor = Object.getOwnPropertyDescriptor(process, "connected");
  const replies = new Map<string, (value: Record<string, unknown>) => void>();
  const frames: Record<string, unknown>[] = [];
  Object.defineProperty(process, "connected", { configurable: true, value: true });
  process.send = ((value: Record<string, unknown>) => { frames.push(value); if (value.type === "nativepi_orchestration_reply") replies.get(String(value.requestId))?.(value); return true; }) as typeof process.send;
  let dispose: (() => void) | undefined;
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    await writeFile(join(root, "AGENTS.md"), "NORMAL_PROJECT_INSTRUCTIONS");
    const runtime = await ModelRuntime.create({ authPath: join(root, "auth.json"), modelsPath: null, modelsStorePath: join(root, "models.json"), refreshOnCreate: false });
    const model = runtime.getModels("openai")[0]!;
    expect(model).toBeDefined();
    await runtime.setRuntimeApiKey(model.provider, "test-only-no-network");
    const ref = await allocateThread(root, join(root, "sessions"));
    ({ session } = await createAgentSession({ cwd: root, agentDir: root, model, modelRuntime: runtime, sessionManager: SessionManager.open(ref.file), settingsManager: SettingsManager.inMemory({ autoCompaction: false } as never), tools: ["read"] }));
    const gate = Promise.withResolvers<void>();
    const streamed = Promise.withResolvers<void>();
    let captured: Context | undefined;
    runtime.streamSimple = (_model, context) => {
      captured = context;
      const stream = createAssistantMessageEventStream();
      streamed.resolve();
      void gate.promise.then(() => {
        const message: AssistantMessage = { role: "assistant", api: model.api, provider: model.provider, model: model.id, content: [{ type: "text", text: "Verified result" }], stopReason: "stop", timestamp: Date.now(), usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
        stream.push({ type: "done", reason: "stop", message });
      });
      return stream;
    };
    dispose = bindOrchestrationHost(session);
    let sequence = 0;
    const call = (action: string, payload: unknown) => new Promise<Record<string, unknown>>(resolve => {
      const requestId = `test-${++sequence}`;
      replies.set(requestId, resolve);
      process.emit("message", { type: "nativepi_orchestration_host", requestId, sessionId: ref.id, action, payload });
    });
    const message: OrchestrationMessage = { id: "lead:task", operationId: "task", source: { id: "lead", cwd: root, file: "/lead" }, destination: ref, kind: "task", assignmentId: "assignment", timestamp: new Date().toISOString(), content: "ONLY_LEAD_TASK" };
    expect((await call("append", { version: 1, sessionId: ref.id, operationId: "task", kind: "message", stage: "inbox", message })).error).toBeUndefined();
    await call("arm", { id: "assignment", attempt: 1, taskMessageId: message.id });
    const accepted = await call("dispatch", message);
    expect(accepted.error).toBeUndefined();
    await streamed.promise;
    expect(frames.some(frame => frame.type === "nativepi_orchestration_outcome")).toBe(false);
    expect(JSON.stringify(captured?.messages)).toContain("ONLY_LEAD_TASK");
    expect(JSON.stringify(captured)).toContain("NORMAL_PROJECT_INSTRUCTIONS");
    expect(JSON.stringify(captured?.messages)).toContain("[task from Work thread lead]");
    const settled = new Promise<void>(resolve => { session!.subscribe(event => { if (event.type === "agent_settled") resolve(); }); });
    gate.resolve(); await settled;
    await Promise.resolve();
    expect(frames.find(frame => frame.type === "nativepi_orchestration_outcome")).toMatchObject({ assignmentId: "assignment", attempt: 1, taskMessageId: message.id, aborted: false, stopReason: "stop", resultEntry: expect.any(String) });
    const disk = await readFile(ref.file, "utf8");
    expect(disk).toContain('"stage":"consumed"');
    expect(disk).toContain("Verified result");
    expect(disk).not.toContain('"role":"user"');
  } finally {
    dispose?.(); session?.dispose();
    process.send = priorSend;
    if (descriptor) Object.defineProperty(process, "connected", descriptor); else Reflect.deleteProperty(process, "connected");
    await rm(root, { recursive: true, force: true });
  }
});

test("exact delegate configuration validates its own catalog without changing global defaults", async () => {
  const { configureOrchestrationSession } = await import("./orchestration.ts");
  const runtime = await ModelRuntime.create({ refreshOnCreate: false, modelsPath: null });
  const model = runtime.getModels("google")[0]!;
  const available = { ...model, provider: "extension-provider", id: "extension-model", reasoning: false, thinkingLevelMap: undefined };
  const calls: unknown[] = [];
  const entries: unknown[] = [];
  const fake = {
    getAllTools: () => [{ name: "extension_tool" }],
    modelRuntime: { getAvailable: async () => [available] },
    isStreaming: false, isCompacting: false,
    setModel: async (...args: unknown[]) => { calls.push(["model", ...args]); },
    setThinkingLevel: (...args: unknown[]) => { calls.push(["thinking", ...args]); },
    setActiveToolsByName: (...args: unknown[]) => { calls.push(["tools", ...args]); },
    sessionManager: { getSessionId: () => "delegate", getEntries: () => entries, appendCustomEntry: (customType: string, data: unknown) => entries.push({ customType, data }) },
  } as unknown as Parameters<typeof configureOrchestrationSession>[0];
  globalThis.__NATIVEPI_DISPATCH_FENCED__ = false;
  const config = { provider: available.provider, model: available.id, reasoning: "off" as const, tools: ["extension_tool"] };
  await configureOrchestrationSession(fake, config);
  expect(calls[0]).toEqual(["model", available, { persist: false }]);
  expect(calls[1]).toEqual(["thinking", "off", { persist: false }]);
  expect(calls[2]).toEqual(["tools", ["extension_tool"]]);
  await expect(configureOrchestrationSession(fake, { ...config, tier: "priority" })).rejects.toThrow("Priority unavailable");
  await expect(configureOrchestrationSession(fake, { ...config, tools: ["missing"] })).rejects.toThrow("unavailable_tool");
  await expect(configureOrchestrationSession(fake, { ...config, model: "missing" })).rejects.toThrow("unsupported_configuration");
  globalThis.__NATIVEPI_DISPATCH_FENCED__ = true;
  await expect(configureOrchestrationSession(fake, config)).rejects.toThrow("Dispatch fenced");
  globalThis.__NATIVEPI_DISPATCH_FENCED__ = false;
});

test("all registered orchestration tool schemas are accepted by pinned Pi's real argument validator", async () => {
  const { registerOrchestration } = await import("./orchestration.ts");
  const { validateToolArguments } = await import("@earendil-works/pi-ai");
  const definitions: import("@earendil-works/pi-coding-agent").ToolDefinition[] = [];
  registerOrchestration({ registerTool: (definition: import("@earendil-works/pi-coding-agent").ToolDefinition) => definitions.push(definition), on: () => {} } as unknown as import("@earendil-works/pi-coding-agent").ExtensionAPI);
  const configuration = { provider: "provider", model: "model", reasoning: "off", tools: ["read"] };
  const samples: Record<string, import("@earendil-works/pi-ai").ToolCall["arguments"]> = {
    orchestration_catalog: {}, delegate_spawn: { label: "Review", task: "Task", configuration },
    delegate_message: { delegateId: "child", content: "Reply" }, delegate_inspect: {}, delegate_wait: { delegateIds: ["child"] }, delegate_stop: { delegateId: "child" }, lead_message: { content: "Question", needsReply: true },
    thread_list: {}, thread_search: { query: "needle" }, thread_read: { threadId: "thread" }, thread_create: { title: "Independent", configuration }, thread_message: { threadId: "thread", content: "Hello" }, thread_inbox: {}, thread_wake: { threadId: "thread", messageIds: ["message"] }, thread_stop: { threadId: "thread" }, thread_finish: { threadId: "thread" }, thread_delete: { threadId: "thread" },
  };
  expect(definitions).toHaveLength(17);
  for (const tool of definitions) expect(validateToolArguments(tool, { type: "toolCall", id: "call", name: tool.name, arguments: samples[tool.name]! })).toEqual(samples[tool.name]);
  const spawn = definitions.find(tool => tool.name === "delegate_spawn")!;
  expect(() => validateToolArguments(spawn, { type: "toolCall", id: "invalid", name: spawn.name, arguments: { label: "Missing task" } })).toThrow();
});
