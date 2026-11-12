import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createSubagentProjection, parseSubagentOutput } from "../extensions/projection.ts";
import { createJsonLineReader, execStreaming } from "../extensions/process.ts";
import { createSubagentPool } from "../extensions/pool.ts";
import { saveUserMaxConcurrency } from "../extensions/config.ts";

const usage = { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cacheWrite1h: 1, reasoning: 2, totalTokens: 14, cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 } };
const message = (content: unknown[], stopReason = "stop") => ({ type: "message_end", message: { role: "assistant", content, provider: "fixture", model: "model", stopReason, usage } });
const events = [
  { type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "réfléchir" } },
  { type: "message_update", assistantMessageEvent: { type: "toolcall_end", contentIndex: 1, toolCall: { id: "tool-1", name: "read", arguments: { file: "café" } } } },
  message([{ type: "thinking", thinking: "réfléchir" }, { type: "toolCall", id: "tool-1", name: "read", arguments: { file: "café" } }], "toolUse"),
  { type: "tool_execution_start", toolCallId: "tool-1", toolName: "read" },
  { type: "tool_execution_end", toolCallId: "tool-1", toolName: "read", isError: true, result: { content: [{ type: "text", text: "failed to read" }] } },
  message([{ type: "text", text: "final café" }]),
  { type: "agent_settled", aborted: true },
];
const output = events.map(event => JSON.stringify(event)).join("\n");

test("one projection handles byte-stream and completed output including usage, tool failures and abort", () => {
  const bytes = Buffer.from(output);
  for (const chunkSize of [1, 7, 64, bytes.length]) {
    const projection = createSubagentProjection("fixture", "prompt");
    const reader = createJsonLineReader(line => projection.accept(line));
    for (let offset = 0; offset < bytes.length; offset += chunkSize) reader.push(bytes.subarray(offset, offset + chunkSize));
    reader.end();
    expect(projection.result()).toEqual(parseSubagentOutput(output));
    expect(projection.result()).toMatchObject({ output: "final café", turns: 2, toolCount: 1, aborted: true, usage: { input: 4, reasoning: 4, cacheWrite1h: 2 } });
    expect(projection.conversation().flatMap(message => message.content)).toContainEqual(expect.objectContaining({ type: "tool", status: "failed", result: "failed to read" }));
    projection.settle("cancelled");
    expect(projection.conversation().at(-1)?.content).toEqual([{ type: "text", text: "final café" }]);
  }
});

test("pool lowering concurrency, queued cancellation, wait cancellation and usage collection preserve running work", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-pool-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const executions: Array<{ resolve: (value: { stdout: string; stderr: string; code: number; killed: boolean }) => void; signal?: AbortSignal }> = [];
  const model = { provider: "fixture", id: "model", reasoning: true };
  const context = { cwd: root, model, thinkingLevel: "high", modelRegistry: { getAvailable: () => [model] }, isProjectTrusted: () => false, ui: { notify: () => {}, setStatus: () => {}, theme: { fg: (_: string, text: string) => text } } } as unknown as ExtensionContext;
  const pool = createSubagentPool({
    getThinkingLevel: () => "high",
    exec: (_command: string, _args: string[], options: { signal: AbortSignal }) => new Promise(resolve => { executions.push({ resolve, signal: options.signal }); }),
  } as unknown as ExtensionAPI, () => {}, () => false);
  try {
    await pool.start(context);
    await pool.setConcurrency(2);
    const first = await pool.enqueue({ prompt: "first" }, context);
    const second = await pool.enqueue({ prompt: "second" }, context);
    const queued = await pool.enqueue({ prompt: "queued" }, context);
    await pool.setConcurrency(1);
    expect(executions).toHaveLength(2);
    expect(executions.every(execution => !execution.signal?.aborted)).toBe(true);
    pool.cancel([queued.id]);
    const abort = new AbortController();
    const waiting = pool.wait([first.id, second.id], abort.signal).catch(error => error);
    abort.abort();
    expect(await waiting).toMatchObject({ message: "Subagent wait cancelled." });
    expect(executions.every(execution => !execution.signal?.aborted)).toBe(true);
    for (const execution of executions) execution.resolve({ stdout: JSON.stringify(message([{ type: "text", text: "done" }])), stderr: "", code: 0, killed: false });
    await pool.wait([first.id, second.id, queued.id]);
    expect(executions).toHaveLength(2);
    expect(pool.detail(queued.id).status).toBe("cancelled");
    expect((await pool.result([first.id, second.id], "first-result", true)).usage?.input).toBe(4);
    expect((await pool.result([first.id, second.id], "again", true)).usage).toBeUndefined();
    expect(pool.overview().jobs.map(job => job.status)).toEqual(["completed", "completed", "cancelled"]);
    await expect(saveUserMaxConcurrency(33, root)).rejects.toThrow();
    await expect(saveUserMaxConcurrency(1.5, root)).rejects.toThrow();
  } finally {
    await pool.dispose(context);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("stream executor reports spawn failure without contacting Pi", async () => {
  const result = await execStreaming(join(tmpdir(), "nativepi-nonexistent-executable"), [], tmpdir(), new AbortController().signal, () => {});
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("ENOENT");
});

test.skipIf(process.platform === "win32")("stream cancellation kills a child ignoring SIGTERM and preserves partial UTF-8 output", async () => {
  const ready = Promise.withResolvers<void>();
  const lines: string[] = [];
  const controller = new AbortController();
  const running = execStreaming(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); console.log("partial café"); setInterval(() => {}, 1000)'], tmpdir(), controller.signal, line => { lines.push(line); ready.resolve(); });
  await ready.promise;
  controller.abort();
  const result = await running;
  expect(result.killed).toBe(true);
  expect(lines).toEqual(["partial café"]);
}, 10_000);

test("pool shutdown cancels queued and running children without starting queued work", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-pool-shutdown-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  let starts = 0;
  const model = { provider: "fixture", id: "model", reasoning: true };
  const context = { cwd: root, model, isProjectTrusted: () => false, ui: { notify: () => {}, setStatus: () => {}, theme: { fg: (_: string, text: string) => text } } } as unknown as ExtensionContext;
  const pool = createSubagentPool({
    getThinkingLevel: () => "off",
    exec: (_: string, _args: string[], { signal }: { signal: AbortSignal }) => new Promise(resolve => {
      starts += 1;
      signal.addEventListener("abort", () => resolve({ stdout: JSON.stringify(message([{ type: "text", text: "partial" }])), stderr: "", code: 1, killed: true }), { once: true });
    }),
  } as unknown as ExtensionAPI, () => {}, () => false);
  try {
    await pool.start(context); await pool.setConcurrency(1);
    await pool.enqueue({ prompt: "running" }, context); await pool.enqueue({ prompt: "queued" }, context);
    await pool.dispose(context);
    expect(starts).toBe(1);
    expect(pool.overview().jobs).toEqual([]);
  } finally {
    await pool.dispose(context);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("a disposed pool cannot publish after its child outlives the shutdown grace", async () => {
  const root = await mkdtemp(join(tmpdir(), "nativepi-pool-late-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const model = { provider: "fixture", id: "model", reasoning: true };
  const statuses: unknown[] = [];
  const context = { cwd: root, model, isProjectTrusted: () => false, ui: { notify: () => {}, setStatus: (...args: unknown[]) => statuses.push(args), theme: { fg: (_: string, text: string) => text } } } as unknown as ExtensionContext;
  const child = Promise.withResolvers<{ stdout: string; stderr: string; code: number; killed: boolean }>();
  const events: string[] = [];
  let signal: AbortSignal | undefined;
  const old = createSubagentPool({
    getThinkingLevel: () => "off",
    exec: (_: string, _args: string[], options: { signal: AbortSignal }) => { signal = options.signal; return child.promise; },
  } as unknown as ExtensionAPI, () => events.push("old"), () => false);
  const current = createSubagentPool({ getThinkingLevel: () => "off" } as unknown as ExtensionAPI, () => events.push("current"), () => false);
  try {
    await old.start(context);
    const job = await old.enqueue({ prompt: "old job" }, context);
    const settled = old.wait([job.id]);
    const shutdown = old.dispose(context);
    expect(signal?.aborted).toBe(true);
    const statusCount = statuses.length;
    const eventCount = events.length;
    await shutdown;
    await current.start(context);
    child.resolve({ stdout: JSON.stringify(message([{ type: "text", text: "late café" }])), stderr: "", code: 0, killed: false });
    await settled;
    expect(events.slice(eventCount)).toEqual(["current"]);
    expect(statuses.length).toBe(statusCount + 1);
    expect(old.overview().jobs).toEqual([]);
    await expect(old.setConcurrency(2)).rejects.toThrow("closing");
    await expect(old.start(context)).rejects.toThrow("closing");
  } finally {
    child.resolve({ stdout: "", stderr: "", code: 0, killed: false });
    await old.dispose(context); await current.dispose(context);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}, 10_000);
