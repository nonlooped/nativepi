import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { SubagentsPanel, type SubagentsPanelJob } from "../extensions/subagents-tui.ts";
import subagentsExtension, {
  conversationBlocks,
  createJsonLineReader,
  getPiInvocation,
  loadSubagentSettings,
  parseSubagentOutput,
  saveUserMaxConcurrency,
} from "../extensions/subagents.ts";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "nativepi-subagents-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("the default concurrency is six", async () => {
  const settings = await loadSubagentSettings(await temporaryDirectory(), false, await temporaryDirectory());

  expect(settings).toMatchObject({
    userMaxConcurrency: 6,
    projectMaxConcurrency: null,
    effectiveMaxConcurrency: 6,
    diagnostics: [],
  });
});

test("a trusted project overrides the user concurrency", async () => {
  const agentDir = await temporaryDirectory();
  const project = await temporaryDirectory();
  await mkdir(join(project, ".pi"), { recursive: true });
  await Bun.write(join(agentDir, "subagents.json"), JSON.stringify({ maxConcurrency: 4 }));
  await Bun.write(join(project, ".pi", "subagents.json"), JSON.stringify({ maxConcurrency: 9 }));

  const settings = await loadSubagentSettings(project, true, agentDir);

  expect(settings.userMaxConcurrency).toBe(4);
  expect(settings.projectMaxConcurrency).toBe(9);
  expect(settings.effectiveMaxConcurrency).toBe(9);
});

test("an untrusted project cannot override concurrency", async () => {
  const agentDir = await temporaryDirectory();
  const project = await temporaryDirectory();
  await mkdir(join(project, ".pi"), { recursive: true });
  await Bun.write(join(agentDir, "subagents.json"), JSON.stringify({ maxConcurrency: 4 }));
  await Bun.write(join(project, ".pi", "subagents.json"), JSON.stringify({ maxConcurrency: 9 }));

  const settings = await loadSubagentSettings(project, false, agentDir);

  expect(settings.projectMaxConcurrency).toBeNull();
  expect(settings.effectiveMaxConcurrency).toBe(4);
});

test("invalid concurrency falls back conservatively with a diagnostic", async () => {
  const agentDir = await temporaryDirectory();
  await Bun.write(join(agentDir, "subagents.json"), JSON.stringify({ maxConcurrency: 0 }));

  const settings = await loadSubagentSettings(await temporaryDirectory(), false, agentDir);

  expect(settings.effectiveMaxConcurrency).toBe(6);
  expect(settings.diagnostics[0]).toContain("Invalid");
});

test("saving the user limit preserves unknown configuration", async () => {
  const agentDir = await temporaryDirectory();
  const path = join(agentDir, "subagents.json");
  await Bun.write(path, JSON.stringify({ maxConcurrency: 3, futureOption: { enabled: true } }));

  await saveUserMaxConcurrency(8, agentDir);

  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
    maxConcurrency: 8,
    futureOption: { enabled: true },
  });
});

test("saving refuses to replace malformed user configuration", async () => {
  const agentDir = await temporaryDirectory();
  const path = join(agentDir, "subagents.json");
  await Bun.write(path, "not json");

  await expect(saveUserMaxConcurrency(8, agentDir)).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe("not json");
});

test("NativePi children launch Pi's CLI through Electron's Node runtime", () => {
  const previous = process.env["NATIVEPI_HOST"];
  process.env["NATIVEPI_HOST"] = "1";
  try {
    const invocation = getPiInvocation(["--help"]);
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args.at(-1)).toBe("--help");
    expect(existsSync(invocation.args[0]!)).toBe(true);
    expect(invocation.args[0]).toMatch(/[\\/]pi-coding-agent[\\/]dist[\\/]cli\.js$/);
  } finally {
    if (previous === undefined) delete process.env["NATIVEPI_HOST"];
    else process.env["NATIVEPI_HOST"] = previous;
  }
});

test("the pool runs no more than six default children at once", async () => {
  type RegisteredTool = {
    execute: (
      toolCallId: string,
      params: Record<string, unknown>,
      signal: AbortSignal | undefined,
      onUpdate: undefined,
      context: Record<string, unknown>,
    ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown; usage?: { input: number } }>;
  };

  const tools = new Map<string, RegisteredTool>();
  let active = 0;
  let peak = 0;
  const childOutput = JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      provider: "anthropic",
      model: "claude-sonnet",
      stopReason: "stop",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    },
  });
  const pi = {
    on: () => {},
    registerTool: (tool: RegisteredTool & { name: string }) => tools.set(tool.name, tool),
    getAllTools: () => [],
    getThinkingLevel: () => "high",
    exec: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { stdout: childOutput, stderr: "", code: 0, killed: false };
    },
  };
  subagentsExtension(pi as never);
  const model = { provider: "anthropic", id: "claude-sonnet", reasoning: true };
  const context = {
    cwd: process.cwd(),
    model,
    thinkingLevel: "high",
    modelRegistry: { getAvailable: () => [model] },
    isProjectTrusted: () => false,
  };
  const spawn = tools.get("subagent_spawn")!;
  const spawned = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      spawn.execute(`spawn-${index}`, { prompt: `task ${index}` }, undefined, undefined, context),
    ),
  );
  const ids = spawned.map((result) => result.content[0]!.text.split(" ")[0]!);
  const waited = await tools.get("subagent_wait")!.execute(
    "wait",
    { ids },
    undefined,
    undefined,
    context,
  );

  expect(peak).toBe(6);
  expect(waited.content[0]!.text.match(/— completed/g)).toHaveLength(8);
  expect(waited.usage?.input).toBe(8);
});

test("the subagents command opens an inline panel instead of a modal", async () => {
  let command: ((args: string, context: Record<string, unknown>) => Promise<void>) | undefined;
  let dialogOptions: unknown = "not called";
  const pi = {
    on: () => {},
    registerTool: () => {},
    registerCommand: (name: string, registration: { handler: typeof command }) => {
      if (name === "subagents") command = registration.handler;
    },
    getThinkingLevel: () => "high",
    exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }),
  };
  subagentsExtension(pi as never);
  const model = { provider: "anthropic", id: "claude-sonnet", reasoning: true };
  const context = {
    model,
    thinkingLevel: "high",
    ui: {
      custom: async (_factory: unknown, options?: unknown) => {
        dialogOptions = options;
      },
    },
  };

  await command?.("", context);

  expect(dialogOptions).toBeUndefined();
});

test("JSON-mode output returns the final response and aggregates usage", () => {
  const message = (text: string, input: number, output: number) => JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      provider: "anthropic",
      model: "claude-sonnet",
      stopReason: "stop",
      usage: {
        input,
        output,
        cacheRead: 2,
        cacheWrite: 3,
        totalTokens: input + output + 5,
        cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.02, total: 0.33 },
      },
    },
  });

  const parsed = parseSubagentOutput([message("working", 10, 4), "not json", message("done", 20, 8)].join("\n"));

  expect(parsed.output).toBe("done");
  expect(parsed.turns).toBe(2);
  expect(parsed.model).toBe("anthropic/claude-sonnet");
  expect(parsed.usage.input).toBe(30);
  expect(parsed.usage.output).toBe(12);
  expect(parsed.usage.cost.total).toBeCloseTo(0.66);
});

test("streamed JSONL survives arbitrary byte boundaries", () => {
  const lines: string[] = [];
  const reader = createJsonLineReader((line) => lines.push(line));
  const bytes = Buffer.from('{"text":"café"}\n{"type":"done"}', "utf8");
  const split = bytes.indexOf(0xc3) + 1;

  reader.push(bytes.subarray(0, 5));
  reader.push(bytes.subarray(5, split));
  reader.push(bytes.subarray(split, split + 2));
  reader.push(bytes.subarray(split + 2));

  expect(reader.end()).toBe('{"text":"café"}\n{"type":"done"}');
  expect(lines).toEqual(['{"text":"café"}', '{"type":"done"}']);
});

test("the TUI panel stays within narrow terminal widths", () => {
  const panel = new SubagentsPanel({
    tui: { requestRender: () => {} },
    theme: {
      fg: (_color: string, text: string) => text,
      bg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as never,
    jobs: () => [],
    settings: () => ({ userMaxConcurrency: 6, projectMaxConcurrency: null, effectiveMaxConcurrency: 6 }),
    parent: { model: "anthropic/claude-sonnet", thinking: "high" },
    spawn: async () => {},
    cancel: () => {},
    setConcurrency: async () => {},
    close: () => {},
  });

  const lines = panel.render(40);

  expect(lines.some((line) => line.includes("No subagents yet"))).toBe(true);
  expect(lines.some((line) => line.includes("N new"))).toBe(true);
  expect(lines.every((line) => visibleWidth(line) <= 40)).toBe(true);
  panel.dispose();
});

test("stopping from the TUI requires confirmation", () => {
  const job: SubagentsPanelJob = {
    id: "sa-1",
    name: "Review API",
    prompt: "Review the API boundary",
    status: "running",
    model: "anthropic/claude-sonnet",
    thinkingLevel: "high",
    createdAt: Date.now(),
    startedAt: Date.now(),
    turns: 0,
    toolCount: 0,
    usage: { totalTokens: 0 },
    conversation: [],
  };
  const cancelled: string[] = [];
  const panel = new SubagentsPanel({
    tui: { requestRender: () => {} },
    theme: {
      fg: (_color: string, text: string) => text,
      bg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as never,
    jobs: () => [job],
    settings: () => ({ userMaxConcurrency: 6, projectMaxConcurrency: null, effectiveMaxConcurrency: 6 }),
    parent: { model: job.model, thinking: job.thinkingLevel },
    spawn: async () => {},
    cancel: (id) => cancelled.push(id),
    setConcurrency: async () => {},
    close: () => {},
  });

  panel.handleInput("x");
  expect(cancelled).toEqual([]);
  expect(panel.render(80).some((line) => line.includes("Stop Review API?"))).toBe(true);

  panel.handleInput("\r");
  expect(cancelled).toEqual(["sa-1"]);
  panel.dispose();
});

test("assistant content becomes a complete graphical conversation", () => {
  expect(conversationBlocks([
    { type: "thinking", thinking: "I should inspect the entry point." },
    { type: "text", text: "I’ll start by reading the file." },
    { type: "toolCall", id: "tool-1", name: "read", arguments: { path: "src/index.ts" } },
  ])).toEqual([
    { type: "thinking", text: "I should inspect the entry point." },
    { type: "text", text: "I’ll start by reading the file." },
    {
      type: "tool",
      id: "tool-1",
      name: "read",
      status: "running",
      arguments: "{\n  \"path\": \"src/index.ts\"\n}",
    },
  ]);
});
