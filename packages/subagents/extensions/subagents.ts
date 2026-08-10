import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CONFIG_DIR_NAME,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  getAgentDir,
  getPackageDir,
  truncateHead,
  truncateTail,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { z } from "@nativepi/extension-api/schema";
import { Type } from "typebox";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
  subagentsProtocol,
  type SubagentConversationBlock,
  type SubagentConversationMessage,
  type SubagentSettings,
  type SubagentStatus,
} from "../types.ts";
import { SubagentsPanel } from "./subagents-tui.ts";

const DEFAULT_MAX_CONCURRENCY = 6;
const MAX_CONFIGURED_CONCURRENCY = 32;
const SHUTDOWN_GRACE_MS = 5_000;
const SUBAGENT_OUTPUT_DIR = join(tmpdir(), "nativepi-subagents");
const SUBAGENT_TOOL_NAMES = [
  "subagent_spawn",
  "subagent_status",
  "subagent_list",
  "subagent_wait",
  "subagent_cancel",
] as const;
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

const settingsFileSchema = z.object({
  maxConcurrency: z.number().int().min(1).max(MAX_CONFIGURED_CONCURRENCY),
}).passthrough();
const jsonObjectSchema = z.record(z.string(), z.unknown());
const usageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  cacheWrite1h: z.number().optional(),
  reasoning: z.number().optional(),
  totalTokens: z.number(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    total: z.number(),
  }).passthrough(),
}).passthrough();
const assistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.array(z.unknown()),
  provider: z.string(),
  model: z.string(),
  usage: usageSchema,
  stopReason: z.string(),
  errorMessage: z.string().optional(),
}).passthrough();
const eventSchema = z.object({
  type: z.string(),
  message: z.unknown().optional(),
  assistantMessageEvent: z.unknown().optional(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  isError: z.boolean().optional(),
}).passthrough();

type Usage = z.infer<typeof usageSchema>;
type Job = {
  id: string;
  name?: string;
  prompt: string;
  model: string;
  thinkingLevel: typeof THINKING_LEVELS[number];
  cwd: string;
  projectTrusted: boolean;
  status: SubagentStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  output?: string;
  fullOutputFile?: string;
  error?: string;
  usage: Usage;
  turns: number;
  toolCount: number;
  conversation: SubagentConversationMessage[];
  messageSequence: number;
  streamingMessageId?: string;
  usageReported: boolean;
  cancellationRequested: boolean;
  controller?: AbortController;
  done: Promise<void>;
  resolveDone: () => void;
};

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function addUsage(target: Usage, value: Usage) {
  target.input += value.input;
  target.output += value.output;
  target.cacheRead += value.cacheRead;
  target.cacheWrite += value.cacheWrite;
  target.totalTokens += value.totalTokens;
  target.cost.input += value.cost.input;
  target.cost.output += value.cost.output;
  target.cost.cacheRead += value.cost.cacheRead;
  target.cost.cacheWrite += value.cost.cacheWrite;
  target.cost.total += value.cost.total;
  if (value.cacheWrite1h !== undefined) target.cacheWrite1h = (target.cacheWrite1h ?? 0) + value.cacheWrite1h;
  if (value.reasoning !== undefined) target.reasoning = (target.reasoning ?? 0) + value.reasoning;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readSettingsFile(path: string) {
  try {
    const parsed = settingsFileSchema.safeParse(JSON.parse(await readFile(path, "utf8")) as unknown);
    if (!parsed.success) {
      return { value: undefined, diagnostic: `Invalid ${path}: ${z.prettifyError(parsed.error)}` };
    }
    return { value: parsed.data.maxConcurrency, diagnostic: undefined };
  } catch (error) {
    if (isMissingFile(error)) return { value: undefined, diagnostic: undefined };
    return { value: undefined, diagnostic: `Could not read ${path}: ${errorMessage(error)}` };
  }
}

export async function loadSubagentSettings(cwd: string, projectTrusted: boolean, agentDir = getAgentDir()) {
  const user = await readSettingsFile(join(agentDir, "subagents.json"));
  const project = projectTrusted
    ? await readSettingsFile(join(cwd, CONFIG_DIR_NAME, "subagents.json"))
    : { value: undefined, diagnostic: undefined };
  return {
    userMaxConcurrency: user.value ?? DEFAULT_MAX_CONCURRENCY,
    projectMaxConcurrency: project.value ?? null,
    effectiveMaxConcurrency: project.value ?? user.value ?? DEFAULT_MAX_CONCURRENCY,
    diagnostics: [user.diagnostic, project.diagnostic].filter((value): value is string => Boolean(value)),
  };
}

export async function saveUserMaxConcurrency(maxConcurrency: number, agentDir = getAgentDir()) {
  const path = join(agentDir, "subagents.json");
  await withFileMutationQueue(path, async () => {
    let current: Record<string, unknown> = {};
    try {
      const parsed = jsonObjectSchema.safeParse(JSON.parse(await readFile(path, "utf8")) as unknown);
      if (!parsed.success) throw new Error(`Invalid ${path}: expected a JSON object.`);
      current = parsed.data;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ ...current, maxConcurrency }, null, 2)}\n`, "utf8");
    try {
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assistantText(content: unknown[]) {
  return content.flatMap((part) =>
    isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [],
  ).join("");
}

function boundedText(text: string, max = DEFAULT_MAX_BYTES) {
  return truncateHead(text, { maxBytes: max, maxLines: DEFAULT_MAX_LINES }).content;
}

function jsonText(value: unknown, max = 8_000) {
  try {
    const text = JSON.stringify(value, null, 2);
    return text ? boundedText(text, max) : undefined;
  } catch {
    return undefined;
  }
}

function toolResultText(value: unknown) {
  if (!isRecord(value)) return jsonText(value);
  const content = value["content"];
  if (Array.isArray(content)) {
    const text = content.flatMap((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    ).join("\n");
    if (text) return boundedText(text);
  }
  return jsonText(value, DEFAULT_MAX_BYTES);
}

export function conversationBlocks(content: unknown[]) {
  return content.flatMap((part): SubagentConversationBlock[] => {
    if (!isRecord(part) || typeof part.type !== "string") return [];
    if (part.type === "text" && typeof part.text === "string") {
      return [{ type: "text", text: boundedText(part.text) }];
    }
    if (part.type === "thinking" && typeof part.thinking === "string") {
      return [{ type: "thinking", text: boundedText(part.thinking) }];
    }
    if (part.type === "toolCall" && typeof part.id === "string" && typeof part.name === "string") {
      const args = jsonText(part.arguments);
      return [{
        type: "tool",
        id: part.id,
        name: part.name,
        status: "running",
        ...(args ? { arguments: args } : {}),
      }];
    }
    return [];
  });
}

export function parseSubagentOutput(stdout: string) {
  const usage = emptyUsage();
  const tools = new Set<string>();
  let output = "";
  let stopReason: string | undefined;
  let error: string | undefined;
  let model: string | undefined;
  let turns = 0;

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = eventSchema.safeParse(JSON.parse(line) as unknown);
      if (!event.success) continue;
      if (event.data.type === "tool_execution_start" && event.data.toolCallId) tools.add(event.data.toolCallId);
      if (event.data.type !== "message_end") continue;
      const message = assistantMessageSchema.safeParse(event.data.message);
      if (!message.success) continue;
      output = assistantText(message.data.content);
      stopReason = message.data.stopReason;
      error = message.data.errorMessage;
      model = `${message.data.provider}/${message.data.model}`;
      turns += 1;
      addUsage(usage, message.data.usage);
    } catch {
      // Pi's JSON mode may be surrounded by non-event process output. Ignore it.
    }
  }

  return { output, stopReason, error, model, usage, turns, toolCount: tools.size };
}

export function getPiInvocation(args: string[]) {
  if (process.env["NATIVEPI_HOST"] === "1") {
    return { command: process.execPath, args: [join(getPackageDir(), "dist", "cli.js"), ...args] };
  }

  const currentScript = process.argv[1];
  const virtualBunScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !virtualBunScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const executable = basename(process.execPath).toLowerCase();
  if (!/^(node|bun)(\.exe)?$/.test(executable)) return { command: process.execPath, args };
  return { command: "pi", args };
}

export function createJsonLineReader(onLine: (line: string) => void) {
  const decoder = new StringDecoder("utf8");
  let output = "";
  let pending = "";
  const accept = (text: string, final: boolean) => {
    output += text;
    pending += text;
    const lines = pending.split(/\r?\n/);
    if (!final) pending = lines.pop() ?? "";
    else pending = "";
    for (const line of lines) if (line.trim()) onLine(line);
  };
  return {
    push(chunk: Uint8Array) {
      accept(decoder.write(Buffer.from(chunk)), false);
    },
    end() {
      accept(decoder.end(), true);
      return output;
    },
  };
}

function execStreaming(
  command: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  onLine: (line: string) => void,
) {
  return new Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = createJsonLineReader(onLine);
    const stderrDecoder = new StringDecoder("utf8");
    let stderr = "";
    let killed = false;
    let settled = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      if (killed || settled) return;
      killed = true;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), SHUTDOWN_GRACE_MS);
    };
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (forceTimer) clearTimeout(forceTimer);
      signal.removeEventListener("abort", kill);
      const stdoutText = stdout.end();
      stderr += stderrDecoder.end();
      resolve({ stdout: stdoutText, stderr, code, killed });
    };

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += stderrDecoder.write(chunk);
    });
    child.once("error", (error) => {
      stderr += errorMessage(error);
      finish(1);
    });
    child.once("close", (code) => finish(code ?? 0));
    if (signal.aborted) kill();
    else signal.addEventListener("abort", kill, { once: true });
  });
}

function terminalStatus(status: SubagentStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function findTool(job: Job, id: string) {
  for (let messageIndex = job.conversation.length - 1; messageIndex >= 0; messageIndex--) {
    const message = job.conversation[messageIndex]!;
    const blockIndex = message.content.findIndex((block) => block.type === "tool" && block.id === id);
    if (blockIndex >= 0) return { message, blockIndex };
  }
  return undefined;
}

function streamingMessage(job: Job) {
  const existing = job.streamingMessageId
    ? job.conversation.find((message) => message.id === job.streamingMessageId)
    : undefined;
  if (existing) return existing;
  const message: SubagentConversationMessage = {
    id: `${job.id}-assistant-${++job.messageSequence}`,
    role: "assistant",
    content: [],
    timestamp: Date.now(),
  };
  job.streamingMessageId = message.id;
  job.conversation.push(message);
  return message;
}

function setStreamingBlock(message: SubagentConversationMessage, index: number, block: SubagentConversationBlock) {
  while (message.content.length < index) message.content.push({ type: "text", text: "" });
  message.content[index] = block;
}

function applyConversationEvent(job: Job, line: string) {
  try {
    const event = eventSchema.safeParse(JSON.parse(line) as unknown);
    if (!event.success) return false;
    if (event.data.type === "message_update" && isRecord(event.data.assistantMessageEvent)) {
      const update = event.data.assistantMessageEvent;
      const type = update["type"];
      const index = update["contentIndex"];
      if (typeof type !== "string" || typeof index !== "number" || !Number.isInteger(index) || index < 0) return false;
      const message = streamingMessage(job);
      const current = message.content[index];
      if (type === "text_start") setStreamingBlock(message, index, { type: "text", text: "" });
      else if (type === "text_delta" && typeof update["delta"] === "string") {
        setStreamingBlock(message, index, {
          type: "text",
          text: boundedText(`${current?.type === "text" ? current.text : ""}${update["delta"]}`),
        });
      } else if (type === "text_end" && typeof update["content"] === "string") {
        setStreamingBlock(message, index, { type: "text", text: boundedText(update["content"]) });
      } else if (type === "thinking_start") setStreamingBlock(message, index, { type: "thinking", text: "" });
      else if (type === "thinking_delta" && typeof update["delta"] === "string") {
        setStreamingBlock(message, index, {
          type: "thinking",
          text: boundedText(`${current?.type === "thinking" ? current.text : ""}${update["delta"]}`),
        });
      } else if (type === "thinking_end" && typeof update["content"] === "string") {
        setStreamingBlock(message, index, { type: "thinking", text: boundedText(update["content"]) });
      } else if (type === "toolcall_end" && isRecord(update["toolCall"])) {
        const tool = update["toolCall"];
        if (typeof tool.id !== "string" || typeof tool.name !== "string") return false;
        if (!findTool(job, tool.id)) job.toolCount += 1;
        const args = jsonText(tool.arguments);
        setStreamingBlock(message, index, {
          type: "tool",
          id: tool.id,
          name: tool.name,
          status: "running",
          ...(args ? { arguments: args } : {}),
        });
      } else return false;
      return true;
    }
    if (event.data.type === "message_end") {
      const message = assistantMessageSchema.safeParse(event.data.message);
      if (!message.success) return false;
      const content = conversationBlocks(message.data.content);
      if (content.length === 0 && !message.data.errorMessage) return false;
      job.model = `${message.data.provider}/${message.data.model}`;
      job.turns += 1;
      addUsage(job.usage, message.data.usage);
      const addedTools = content.filter((block) => block.type === "tool" && !findTool(job, block.id)).length;
      job.toolCount += addedTools;
      const current = job.streamingMessageId
        ? job.conversation.find((candidate) => candidate.id === job.streamingMessageId)
        : undefined;
      const completed = {
        id: current?.id ?? `${job.id}-assistant-${++job.messageSequence}`,
        role: "assistant" as const,
        content,
        timestamp: Date.now(),
        ...(message.data.errorMessage ? { error: message.data.errorMessage } : {}),
      };
      if (current) job.conversation[job.conversation.indexOf(current)] = completed;
      else job.conversation.push(completed);
      job.streamingMessageId = undefined;
      return true;
    }
    if (event.data.type !== "tool_execution_start" && event.data.type !== "tool_execution_end") return false;
    if (!event.data.toolCallId || !event.data.toolName) return false;
    const found = findTool(job, event.data.toolCallId);
    const args = jsonText(event.data.args);
    const result = event.data.type === "tool_execution_end" ? toolResultText(event.data.result) : undefined;
    const next: SubagentConversationBlock = {
      type: "tool",
      id: event.data.toolCallId,
      name: event.data.toolName,
      status: event.data.type === "tool_execution_start" ? "running" : event.data.isError ? "failed" : "completed",
      ...(args ? { arguments: args } : {}),
      ...(result ? { result } : {}),
    };
    if (found) {
      const previous = found.message.content[found.blockIndex];
      found.message.content[found.blockIndex] = {
        ...previous,
        ...next,
        ...(previous?.type === "tool" && previous.arguments && !next.arguments
          ? { arguments: previous.arguments }
          : {}),
      };
    } else {
      job.toolCount += 1;
      job.conversation.push({
        id: `${job.id}-assistant-${++job.messageSequence}`,
        role: "assistant",
        content: [next],
        timestamp: Date.now(),
      });
    }
    return true;
  } catch {
    return false;
  }
}

function settleConversation(job: Job, status: SubagentStatus) {
  for (const message of job.conversation) {
    message.content = message.content.map((block) =>
      block.type === "tool" && block.status === "running"
        ? {
            ...block,
            status: status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed",
            ...(status === "cancelled" ? { result: block.result ?? "Cancelled." } : {}),
          }
        : block,
    );
  }
}

function jobSummary(job: Job) {
  return {
    id: job.id,
    ...(job.name ? { name: job.name } : {}),
    prompt: job.prompt,
    status: job.status,
    model: job.model,
    thinkingLevel: job.thinkingLevel,
    createdAt: job.createdAt,
    ...(job.startedAt !== undefined ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt !== undefined ? { finishedAt: job.finishedAt } : {}),
    ...(job.error ? { error: job.error } : {}),
    turns: job.turns,
    toolCount: job.toolCount,
    usage: {
      input: job.usage.input,
      output: job.usage.output,
      cacheRead: job.usage.cacheRead,
      cacheWrite: job.usage.cacheWrite,
      totalTokens: job.usage.totalTokens,
      cost: job.usage.cost.total,
    },
  };
}

function jobDetail(job: Job) {
  return {
    ...jobSummary(job),
    ...(job.fullOutputFile ? { fullOutputFile: job.fullOutputFile } : {}),
    conversation: job.conversation,
  };
}

function formatJob(job: Job, includeOutput: boolean) {
  const heading = `${job.id}${job.name ? ` (${job.name})` : ""} — ${job.status}`;
  const metadata = `${job.model} · thinking ${job.thinkingLevel}`;
  let body: string | undefined;
  if (includeOutput && terminalStatus(job.status)) {
    if (job.status === "completed") body = job.output || "(no final response)";
    else body = [job.error, job.output && job.output !== job.error ? `Partial response:\n${job.output}` : undefined]
      .filter(Boolean)
      .join("\n\n") || "(no error details)";
  }
  return [`### ${heading}`, metadata, body].filter(Boolean).join("\n\n");
}

function resolveModel(context: ExtensionContext, requested?: string) {
  if (!requested) {
    if (!context.model) throw new Error("No current model is selected.");
    return context.model;
  }

  const available = context.modelRegistry.getAvailable();
  const matches = available.filter((model) => `${model.provider}/${model.id}` === requested || model.id === requested);
  if (matches.length === 0) throw new Error(`Subagent model is not available: ${requested}`);
  if (matches.length > 1) throw new Error(`Subagent model is ambiguous; use provider/model: ${requested}`);
  return matches[0];
}

function waitForJobs(jobs: Job[], signal?: AbortSignal) {
  const settled = Promise.all(jobs.map((job) => job.done)).then(() => undefined);
  if (!signal) return settled;
  if (signal.aborted) return Promise.reject(new Error("Subagent wait cancelled."));

  return new Promise<void>((resolve, reject) => {
    const abort = () => reject(new Error("Subagent wait cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    void settled.then(
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

const ThinkingLevelSchema = StringEnum(THINKING_LEVELS, {
  description: "Pi thinking/reasoning level. Omit to use the parent chat's current level.",
});
const SpawnParameters = Type.Object({
  prompt: Type.String({ description: "Self-contained task for the child; it cannot see the parent conversation." }),
  name: Type.Optional(Type.String({ description: "Short label for this child." })),
  model: Type.Optional(Type.String({ description: "Model id or provider/model. Omit to use the parent chat's current model." })),
  thinkingLevel: Type.Optional(ThinkingLevelSchema),
});
const IdParameters = Type.Object({ id: Type.String({ description: "Subagent id returned by subagent_spawn." }) });
const IdsParameters = Type.Object({
  ids: Type.Array(Type.String(), { minItems: 1, maxItems: 64, description: "Subagent ids." }),
});

function parseSubagentCommandArgs(raw: string): { head: string; rest: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { head: "", rest: "" };
  const space = trimmed.search(/\s/);
  if (space === -1) return { head: trimmed.toLowerCase(), rest: "" };
  return { head: trimmed.slice(0, space).toLowerCase(), rest: trimmed.slice(space + 1) };
}

function parseSpawnArgs(raw: string): { prompt: string; name?: string; model?: string; thinking?: string; error?: string } {
  const tokens = (raw.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [])
    .map((token) => token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token);
  const prompt: string[] = [];
  let name: string | undefined;
  let model: string | undefined;
  let thinking: string | undefined;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (!token.startsWith("--")) {
      prompt.push(token);
      continue;
    }
    if (!["--name", "--label", "--model", "--thinking"].includes(token)) {
      return { prompt: "", error: `Unknown flag ${token}` };
    }
    const value = tokens[++index];
    if (!value) return { prompt: "", error: `Missing value for ${token}` };
    if (token === "--name" || token === "--label") name = value;
    else if (token === "--model") model = value;
    else {
      if (!(THINKING_LEVELS as readonly string[]).includes(value)) {
        return { prompt: "", error: `Invalid --thinking; use ${THINKING_LEVELS.join("|")}` };
      }
      thinking = value;
    }
  }

  return { prompt: prompt.join(" ").trim(), name, model, thinking };
}

export default function subagentsExtension(pi: ExtensionAPI) {
  const jobs = new Map<string, Job>();
  let sequence = 0;
  let running = 0;
  let closing = false;
  let latest: ExtensionContext | undefined;
  let userMaxConcurrency = DEFAULT_MAX_CONCURRENCY;
  let projectMaxConcurrency: number | null = null;
  let maxConcurrency = DEFAULT_MAX_CONCURRENCY;

  const settingsState = (): SubagentSettings => ({
    userMaxConcurrency,
    projectMaxConcurrency,
    effectiveMaxConcurrency: maxConcurrency,
  });

  const overviewState = () => ({
    settings: settingsState(),
    jobs: [...jobs.values()].map(jobSummary),
  });

  const updateStatus = () => {
    if (!latest) return;
    const queued = [...jobs.values()].filter((job) => job.status === "queued").length;
    const active = running + queued;
    latest.ui.setStatus(
      "subagents",
      active > 0
        ? latest.ui.theme.fg("muted", "subagents · ")
          + latest.ui.theme.fg("accent", `${running} running`)
          + (queued > 0 ? latest.ui.theme.fg("dim", ` · ${queued} queued`) : "")
        : undefined,
    );
  };

  function publish() {
    updateStatus();
    ui.emit("changed", overviewState());
  }

  const writeBoundedOutput = async (text: string, key: string) => {
    const truncation = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
    if (!truncation.truncated) return { text: truncation.content, file: undefined };

    await mkdir(SUBAGENT_OUTPUT_DIR, { recursive: true });
    const file = join(SUBAGENT_OUTPUT_DIR, `${process.pid}-${key.replace(/[^a-zA-Z0-9_-]+/g, "_")}.txt`);
    await writeFile(file, text, { encoding: "utf8", mode: 0o600 });
    return {
      text: `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${file}]`,
      file,
    };
  };

  const finishJob = (job: Job, status: SubagentStatus) => {
    job.status = status;
    job.finishedAt = Date.now();
    job.controller = undefined;
    settleConversation(job, status);
    if (status === "failed" && job.error && !job.conversation.some((message) => message.error === job.error)) {
      job.conversation.push({
        id: `${job.id}-assistant-${++job.messageSequence}`,
        role: "assistant",
        content: [],
        timestamp: job.finishedAt,
        error: job.error,
      });
    }
    running = Math.max(0, running - 1);
    job.resolveDone();
    if (closing && terminalStatus(status)) jobs.delete(job.id);
    publish();
    pump();
  };

  const runJob = async (job: Job) => {
    const controller = new AbortController();
    job.controller = controller;
    job.status = "running";
    job.startedAt = Date.now();
    running += 1;
    publish();

    const args = [
      "--mode", "json",
      "--print",
      "--no-session",
      "--model", job.model,
      "--thinking", job.thinkingLevel,
      "--exclude-tools", SUBAGENT_TOOL_NAMES.join(","),
      job.projectTrusted ? "--approve" : "--no-approve",
      `Task:\n${job.prompt}`,
    ];
    const invocation = getPiInvocation(args);
    let publishTimer: ReturnType<typeof setTimeout> | undefined;
    const queuePublish = () => {
      if (publishTimer) return;
      publishTimer = setTimeout(() => {
        publishTimer = undefined;
        publish();
      }, 100);
    };

    try {
      const result = ui.connected
        ? await execStreaming(invocation.command, invocation.args, job.cwd, controller.signal, (line) => {
            if (applyConversationEvent(job, line)) queuePublish();
          })
        : await pi.exec(invocation.command, invocation.args, { cwd: job.cwd, signal: controller.signal });
      const parsed = parseSubagentOutput(result.stdout);
      job.usage = parsed.usage;
      job.turns = parsed.turns;
      job.toolCount = Math.max(job.toolCount, parsed.toolCount);
      if (parsed.model) job.model = parsed.model;

      const bounded = await writeBoundedOutput(parsed.output, job.id);
      job.output = bounded.text;
      job.fullOutputFile = bounded.file;

      if (job.cancellationRequested || (result.killed && controller.signal.aborted)) {
        job.error = "Cancelled.";
        finishJob(job, "cancelled");
      } else if (result.code !== 0 || parsed.stopReason === "error" || parsed.stopReason === "aborted") {
        const stderr = truncateTail(result.stderr.trim(), {
          maxBytes: DEFAULT_MAX_BYTES,
          maxLines: DEFAULT_MAX_LINES,
        }).content;
        job.error = parsed.error || stderr || `Subagent exited with code ${result.code}.`;
        if (!job.output) job.output = job.error;
        finishJob(job, "failed");
      } else {
        finishJob(job, "completed");
      }
    } catch (error) {
      job.error = job.cancellationRequested ? "Cancelled." : errorMessage(error);
      finishJob(job, job.cancellationRequested ? "cancelled" : "failed");
    } finally {
      if (publishTimer) clearTimeout(publishTimer);
    }
  };

  function pump() {
    if (closing) return;
    for (const job of jobs.values()) {
      if (running >= maxConcurrency) break;
      if (job.status !== "queued") continue;
      void runJob(job);
    }
    updateStatus();
  }

  const getJobs = (ids: string[]) => {
    const selected: Job[] = [];
    for (const id of new Set(ids)) {
      const job = jobs.get(id);
      if (!job) throw new Error(`Unknown subagent id: ${id}`);
      selected.push(job);
    }
    return selected;
  };

  const takeUsage = (selected: Job[]) => {
    const total = emptyUsage();
    let turns = 0;
    for (const job of selected) {
      if (!terminalStatus(job.status) || job.usageReported || job.turns === 0) continue;
      job.usageReported = true;
      turns += job.turns;
      addUsage(total, job.usage);
    }
    return turns > 0 ? total : undefined;
  };

  const cancelJobs = (selected: Job[]) => {
    for (const job of selected) {
      if (job.status === "queued") {
        job.status = "cancelled";
        job.error = "Cancelled before starting.";
        job.finishedAt = Date.now();
        job.resolveDone();
      } else if (job.status === "running") {
        job.status = "cancelling";
        job.cancellationRequested = true;
        job.controller?.abort();
      }
    }
    publish();
    pump();
  };

  const resultFor = async (
    selected: Job[],
    toolCallId: string,
    includeOutput: boolean,
    includeUsage = true,
  ) => {
    const full = selected.map((job) => formatJob(job, includeOutput)).join("\n\n---\n\n") || "No subagents.";
    const bounded = await writeBoundedOutput(full, `result-${toolCallId}`);
    return {
      content: [{ type: "text" as const, text: bounded.text }],
      details: { jobs: selected.map(jobSummary), fullOutputFile: bounded.file },
      usage: includeUsage ? takeUsage(selected) : undefined,
    };
  };

  const createJob = async (
    params: { prompt: string; name?: string; model?: string; thinkingLevel?: string },
    context: ExtensionContext,
  ) => {
    if (closing) throw new Error("The parent session is closing.");
    const model = resolveModel(context, params.model);
    const rawThinking = params.thinkingLevel ?? context.thinkingLevel ?? pi.getThinkingLevel();
    const requestedThinking = typeof rawThinking === "string" && (THINKING_LEVELS as readonly string[]).includes(rawThinking)
      ? (rawThinking as typeof THINKING_LEVELS[number])
      : "off";
    const thinkingLevel = model.reasoning ? requestedThinking : "off";
    let resolveDone = () => {};
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const id = `sa-${++sequence}`;
    const createdAt = Date.now();
    const job: Job = {
      id,
      name: params.name,
      prompt: params.prompt,
      model: `${model.provider}/${model.id}`,
      thinkingLevel,
      cwd: context.cwd,
      projectTrusted: context.isProjectTrusted(),
      status: "queued",
      createdAt,
      usage: emptyUsage(),
      turns: 0,
      toolCount: 0,
      conversation: [{
        id: `${id}-user-1`,
        role: "user",
        content: [{ type: "text", text: params.prompt }],
        timestamp: createdAt,
      }],
      messageSequence: 1,
      usageReported: false,
      cancellationRequested: false,
      done,
      resolveDone,
    };
    jobs.set(job.id, job);
    publish();
    pump();
    return job;
  };

  const ui = connect("@nativepi/subagents", subagentsProtocol, {
    overview: overviewState,
    detail: ({ id }) => jobDetail(getJobs([id])[0]!),
    cancel: ({ id }) => {
      const job = getJobs([id])[0]!;
      cancelJobs([job]);
      return jobDetail(job);
    },
    setMaxConcurrency: async ({ maxConcurrency: value }) => {
      await saveUserMaxConcurrency(value);
      userMaxConcurrency = value;
      maxConcurrency = projectMaxConcurrency ?? value;
      pump();
      publish();
      return overviewState();
    },
  });

  pi.on("session_start", async (_event, context) => {
    latest = context;
    closing = false;
    const settings = await loadSubagentSettings(context.cwd, context.isProjectTrusted());
    userMaxConcurrency = settings.userMaxConcurrency;
    projectMaxConcurrency = settings.projectMaxConcurrency;
    maxConcurrency = settings.effectiveMaxConcurrency;
    for (const diagnostic of settings.diagnostics) context.ui.notify(diagnostic, "warning");
    publish();
  });

  pi.on("session_shutdown", async (_event, context) => {
    closing = true;
    for (const job of jobs.values()) {
      if (job.status === "queued") {
        job.error = "Cancelled because the parent session closed.";
        job.status = "cancelled";
        job.finishedAt = Date.now();
        job.resolveDone();
      } else if (job.status === "running" || job.status === "cancelling") {
        job.cancellationRequested = true;
        job.status = "cancelling";
        job.controller?.abort();
      }
    }
    context.ui.setStatus("subagents", undefined);
    let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...jobs.values()].map((job) => job.done)),
        new Promise((resolve) => {
          shutdownTimer = setTimeout(resolve, SHUTDOWN_GRACE_MS);
        }),
      ]);
    } finally {
      if (shutdownTimer) clearTimeout(shutdownTimer);
    }
    for (const [id, job] of jobs) {
      if (terminalStatus(job.status)) jobs.delete(id);
    }
    if (jobs.size === 0) running = 0;
    latest = undefined;
  });

  pi.registerTool({
    name: "subagent_spawn",
    label: "Spawn Subagent",
    description: "Queue an isolated Pi child and return immediately. The child receives the current project and normal Pi configuration, but no parent conversation and no subagent tools. Provide a self-contained prompt. Omit model and thinkingLevel to inherit the parent chat's current values.",
    promptSnippet: "Spawn an asynchronous isolated Pi child for independent work",
    promptGuidelines: [
      "Use subagent_spawn only for independent work whose prompt can be made self-contained; children cannot see the parent conversation.",
      "After subagent_spawn, use subagent_wait or subagent_status to collect the result before relying on it.",
      "Avoid assigning concurrent subagents overlapping file edits in the same worktree.",
    ],
    parameters: SpawnParameters,
    async execute(_toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) throw new Error("Subagent spawn cancelled.");
      const job = await createJob(params, context);
      return {
        content: [{
          type: "text",
          text: `${job.id} ${job.status}. Model: ${job.model}; thinking: ${job.thinkingLevel}.`,
        }],
        details: { job: jobSummary(job) },
      };
    },
  });

  pi.registerTool({
    name: "subagent_status",
    label: "Subagent Status",
    description: "Get one subagent's current state and its final response when settled.",
    parameters: IdParameters,
    async execute(toolCallId, params) {
      return resultFor(getJobs([params.id]), toolCallId, true);
    },
  });

  pi.registerTool({
    name: "subagent_list",
    label: "List Subagents",
    description: "List queued, running, and settled subagents in this parent session without their full responses.",
    parameters: Type.Object({}),
    async execute(toolCallId) {
      return resultFor([...jobs.values()], toolCallId, false, false);
    },
  });

  pi.registerTool({
    name: "subagent_wait",
    label: "Wait for Subagents",
    description: "Wait until every selected subagent settles, then return their final responses. Cancelling this wait does not cancel the children.",
    parameters: IdsParameters,
    async execute(toolCallId, params, signal) {
      const selected = getJobs(params.ids);
      await waitForJobs(selected, signal);
      return resultFor(selected, toolCallId, true);
    },
  });

  pi.registerTool({
    name: "subagent_cancel",
    label: "Cancel Subagents",
    description: "Cancel queued or running subagents by id.",
    parameters: IdsParameters,
    async execute(toolCallId, params) {
      const selected = getJobs(params.ids);
      cancelJobs(selected);
      return resultFor(selected, toolCallId, false);
    },
  });

  const openDashboard = async (context: ExtensionContext) => {
    await context.ui.custom<unknown>((tui, theme, _keybindings, done) =>
      new SubagentsPanel({
        tui,
        theme,
        jobs: () => [...jobs.values()],
        settings: settingsState,
        parent: {
          model: context.model ? `${context.model.provider}/${context.model.id}` : "No model selected",
          thinking: context.thinkingLevel ?? pi.getThinkingLevel(),
        },
        spawn: async (prompt) => {
          await createJob({ prompt }, context);
        },
        cancel: (id) => {
          const job = jobs.get(id);
          if (job) cancelJobs([job]);
        },
        setConcurrency: async (value) => {
          await saveUserMaxConcurrency(value);
          userMaxConcurrency = value;
          maxConcurrency = projectMaxConcurrency ?? value;
          pump();
          publish();
        },
        close: () => done(undefined),
      }),
    );
  };

  const handleSubagentsCommand = async (args: string, context: ExtensionContext) => {
    const { head, rest } = parseSubagentCommandArgs(args);
    if (!head) {
      await openDashboard(context);
      return;
    }
    if (head === "help" || head === "--help" || head === "-h") {
      context.ui.notify(
        [
          "subagents — manage isolated Pi subagents",
          "",
          "/subagents               open interactive dashboard",
          "/subagents list          list all subagents",
          "/subagents spawn <prompt> [--name LABEL] [--model provider/id] [--thinking LEVEL]  spawn a new child",
          "/subagents status <id>   show one subagent's status + output",
          "/subagents cancel <id>   cancel a queued/running child",
          "/subagents concurrency <1-32>  set concurrent limit",
          "/subagents help          show this help",
        ].join("\n"),
        "info",
      );
      return;
    }
    if (head === "list" || head === "ls") {
      const all = [...jobs.values()];
      if (all.length === 0) {
        context.ui.notify("No subagents in this session yet — spawn one with /subagents spawn <prompt> or press n in the dashboard.", "info");
        return;
      }
      const lines = all.map((job) => `${job.id} — ${job.status} · ${job.model} · ${job.name ?? truncateToWidth(job.prompt.replace(/\s+/g, " ").trim(), 48, "…")}`);
      context.ui.notify(lines.join("\n"), "info");
      return;
    }
    if (head === "status") {
      const id = rest.trim().split(/\s+/)[0];
      if (!id) {
        context.ui.notify("Usage: /subagents status <id>", "warning");
        return;
      }
      const job = jobs.get(id);
      if (!job) {
        context.ui.notify(`Unknown subagent id: ${id}`, "warning");
        return;
      }
      const detail = formatJob(job, true);
      context.ui.notify(detail, job.status === "failed" ? "error" : "info");
      return;
    }
    if (head === "cancel") {
      const ids = rest.trim().split(/\s+/).filter(Boolean);
      if (ids.length === 0) {
        context.ui.notify("Usage: /subagents cancel <id> [id ...]", "warning");
        return;
      }
      try {
        const selected = getJobs(ids);
        cancelJobs(selected);
        context.ui.notify(`Cancelled ${selected.length} subagent(s).`, "info");
      } catch (err) {
        context.ui.notify(errorMessage(err), "warning");
      }
      return;
    }
    if (head === "concurrency" || head === "limit") {
      const value = Number(rest.trim());
      if (!Number.isInteger(value) || value < 1 || value > 32) {
        context.ui.notify(`Concurrency must be an integer 1–32 (current effective: ${maxConcurrency}).`, "warning");
        return;
      }
      try {
        await saveUserMaxConcurrency(value);
        userMaxConcurrency = value;
        maxConcurrency = projectMaxConcurrency ?? value;
        pump();
        publish();
        context.ui.notify(`Concurrency set to ${value} (effective ${maxConcurrency}).`, "info");
      } catch (err) {
        context.ui.notify(errorMessage(err), "error");
      }
      return;
    }
    if (head === "spawn") {
      const parsed = parseSpawnArgs(rest);
      if (parsed.error) {
        context.ui.notify(parsed.error, "warning");
        return;
      }
      if (!parsed.prompt.trim()) {
        context.ui.notify("Usage: /subagents spawn <prompt> [--name LABEL] [--model provider/id] [--thinking LEVEL]", "warning");
        return;
      }
      try {
        const job = await createJob({ prompt: parsed.prompt, name: parsed.name, model: parsed.model, thinkingLevel: parsed.thinking }, context);
        context.ui.notify(`${job.id} queued — ${job.model} · thinking ${job.thinkingLevel}. Use /subagents to watch it live.`, "info");
      } catch (err) {
        context.ui.notify(errorMessage(err), "error");
      }
      return;
    }
    if (head === "dashboard" || head === "open") {
      await openDashboard(context);
      return;
    }
    // Bare prompt shorthand: treat whole trimmed args as prompt for quick spawn
    if (args.trim().length > 8 && !args.trim().startsWith("--")) {
      const maybePrompt = args.trim();
      const looksLikeCommand = ["list", "spawn", "status", "cancel", "concurrency", "dashboard", "open", "help"].some((c) => maybePrompt.toLowerCase().startsWith(c));
      if (!looksLikeCommand) {
        try {
          const job = await createJob({ prompt: maybePrompt }, context);
          context.ui.notify(`${job.id} queued — ${job.model}. Use /subagents to watch.`, "info");
        } catch (err) {
          context.ui.notify(errorMessage(err), "error");
        }
        return;
      }
    }
    context.ui.notify(`Unknown subcommand "${head}". Try /subagents help.`, "warning");
  };

  if (typeof (pi as unknown as { registerCommand?: unknown }).registerCommand === "function") {
    (pi as unknown as { registerCommand: typeof pi.registerCommand }).registerCommand("subagents", {
    description: "Manage asynchronous subagents — list, spawn, cancel, and watch them live",
    getArgumentCompletions: (prefix) => {
      const options = ["list", "spawn ", "status ", "cancel ", "concurrency ", "help", "dashboard"];
      const filtered = options.filter((value) => value.startsWith(prefix.toLowerCase()));
      if (filtered.length > 0) return filtered.map((value) => ({ value, label: value }));
      const ids = [...jobs.keys()].filter((id) => id.startsWith(prefix));
      return ids.length > 0 ? ids.map((value) => ({ value, label: value })) : null;
    },
    handler: handleSubagentsCommand,
  });

    (pi as unknown as { registerCommand: typeof pi.registerCommand }).registerCommand("subagent", {
    description: "Alias for /subagents",
    getArgumentCompletions(prefix) {
      return [
        "list",
        "spawn ",
        "status ",
        "cancel ",
        "concurrency ",
        "help",
      ]
        .filter((value) => value.startsWith(prefix.toLowerCase()))
        .map((value) => ({ value, label: value }));
    },
    handler: handleSubagentsCommand,
  });
  }
}
