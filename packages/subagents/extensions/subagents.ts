import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
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
import { subagentsProtocol, type SubagentSettings } from "../types.ts";

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
}).passthrough();

type Usage = z.infer<typeof usageSchema>;
type JobStatus = "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled";
type Job = {
  id: string;
  name?: string;
  prompt: string;
  model: string;
  thinkingLevel: typeof THINKING_LEVELS[number];
  cwd: string;
  projectTrusted: boolean;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  output?: string;
  fullOutputFile?: string;
  error?: string;
  usage: Usage;
  turns: number;
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

export function parseSubagentOutput(stdout: string) {
  const usage = emptyUsage();
  let output = "";
  let stopReason: string | undefined;
  let error: string | undefined;
  let model: string | undefined;
  let turns = 0;

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = eventSchema.safeParse(JSON.parse(line) as unknown);
      if (!event.success || event.data.type !== "message_end") continue;
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

  return { output, stopReason, error, model, usage, turns };
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

function terminalStatus(status: JobStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function jobSnapshot(job: Job) {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    model: job.model,
    thinkingLevel: job.thinkingLevel,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    fullOutputFile: job.fullOutputFile,
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

  const finishJob = (job: Job, status: JobStatus) => {
    job.status = status;
    job.finishedAt = Date.now();
    job.controller = undefined;
    running = Math.max(0, running - 1);
    job.resolveDone();
    if (closing && terminalStatus(status)) {
      jobs.delete(job.id);
    }
    updateStatus();
    pump();
  };

  const runJob = async (job: Job) => {
    const controller = new AbortController();
    job.controller = controller;
    job.status = "running";
    job.startedAt = Date.now();
    running += 1;
    updateStatus();

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

    try {
      const result = await pi.exec(invocation.command, invocation.args, {
        cwd: job.cwd,
        signal: controller.signal,
      });
      const parsed = parseSubagentOutput(result.stdout);
      job.usage = parsed.usage;
      job.turns = parsed.turns;
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
      details: { jobs: selected.map(jobSnapshot), fullOutputFile: bounded.file },
      usage: includeUsage ? takeUsage(selected) : undefined,
    };
  };

  const ui = connect("@nativepi/subagents", subagentsProtocol, {
    state: settingsState,
    setMaxConcurrency: async ({ maxConcurrency: value }) => {
      await saveUserMaxConcurrency(value);
      userMaxConcurrency = value;
      maxConcurrency = projectMaxConcurrency ?? value;
      const state = settingsState();
      ui.emit("changed", state);
      pump();
      return state;
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
    ui.emit("changed", settingsState());
    updateStatus();
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
      const job: Job = {
        id: `sa-${++sequence}`,
        name: params.name,
        prompt: params.prompt,
        model: `${model.provider}/${model.id}`,
        thinkingLevel,
        cwd: context.cwd,
        projectTrusted: context.isProjectTrusted(),
        status: "queued",
        createdAt: Date.now(),
        usage: emptyUsage(),
        turns: 0,
        usageReported: false,
        cancellationRequested: false,
        done,
        resolveDone,
      };
      jobs.set(job.id, job);
      pump();
      return {
        content: [{
          type: "text",
          text: `${job.id} ${job.status}. Model: ${job.model}; thinking: ${job.thinkingLevel}.`,
        }],
        details: { job: jobSnapshot(job) },
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
      updateStatus();
      pump();
      return resultFor(selected, toolCallId, false);
    },
  });
}
