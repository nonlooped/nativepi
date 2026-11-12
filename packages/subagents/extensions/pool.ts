import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead, truncateTail, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_CONCURRENCY, concurrencySchema, thinkingLevelSchema, SUBAGENT_TOOL_NAMES, type ThinkingLevel, type SubagentSettings, type SubagentStatus, type SubagentOverview } from "../types.ts";
import { loadSubagentSettings, saveUserMaxConcurrency } from "./config.ts";
import { createSubagentProjection, emptyUsage, addUsage } from "./projection.ts";
import { execStreaming, getPiInvocation } from "./process.ts";

const SHUTDOWN_GRACE_MS = 5_000;
const SUBAGENT_OUTPUT_DIR = join(tmpdir(), "nativepi-subagents");
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

type Job = {
  id: string;
  name?: string;
  prompt: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  cwd: string;
  projectTrusted: boolean;
  status: SubagentStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  output?: string;
  fullOutputFile?: string;
  error?: string;
  projection: ReturnType<typeof createSubagentProjection>;
  usageReported: boolean;
  cancellationRequested: boolean;
  controller?: AbortController;
  done: Promise<void>;
  resolveDone: () => void;
};

function terminalStatus(status: SubagentStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function jobSummary(job: Job) {
  const projected = job.projection.result();
  return {
    id: job.id,
    ...(job.name ? { name: job.name } : {}),
    prompt: job.prompt,
    status: job.status,
    model: projected.model ?? job.model,
    thinkingLevel: job.thinkingLevel,
    createdAt: job.createdAt,
    ...(job.startedAt !== undefined ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt !== undefined ? { finishedAt: job.finishedAt } : {}),
    ...(job.error ? { error: job.error } : {}),
    turns: projected.turns,
    toolCount: projected.toolCount,
    usage: {
      input: projected.usage.input,
      output: projected.usage.output,
      cacheRead: projected.usage.cacheRead,
      cacheWrite: projected.usage.cacheWrite,
      totalTokens: projected.usage.totalTokens,
      cost: projected.usage.cost.total,
    },
  };
}

function jobDetail(job: Job) {
  return {
    ...jobSummary(job),
    ...(job.fullOutputFile ? { fullOutputFile: job.fullOutputFile } : {}),
    conversation: job.projection.conversation(),
  };
}

function formatJob(job: Job, includeOutput: boolean) {
  const heading = `${job.id}${job.name ? ` (${job.name})` : ""} — ${job.status}`;
  const metadata = `${job.projection.result().model ?? job.model} · thinking ${job.thinkingLevel}`;
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

export function createSubagentPool(pi: ExtensionAPI, emit: (overview: SubagentOverview) => void, connected: () => boolean) {
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
    if (closing || !latest) return;
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
    if (closing) return;
    updateStatus();
    emit(overviewState());
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
    job.projection.settle(status, job.error);
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
      const accept = (line: string) => {
        const changed = job.projection.accept(line);
        if (changed) queuePublish();
      };
      const result = connected()
        ? await execStreaming(invocation.command, invocation.args, job.cwd, controller.signal, accept)
        : await pi.exec(invocation.command, invocation.args, { cwd: job.cwd, signal: controller.signal }).then((result) => {
          for (const line of result.stdout.split(/\r?\n/)) accept(line);
          return result;
        });
      const parsed = job.projection.result();

      const bounded = await writeBoundedOutput(job.projection.takeOutput(), job.id);
      job.output = bounded.text;
      job.fullOutputFile = bounded.file;

      if (job.cancellationRequested || parsed.aborted || parsed.stopReason === "aborted" || (result.killed && controller.signal.aborted)) {
        job.error = "Cancelled.";
        finishJob(job, "cancelled");
      } else if (result.code !== 0 || parsed.stopReason === "error") {
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
      const projected = job.projection.result();
      if (!terminalStatus(job.status) || job.usageReported || projected.turns === 0) continue;
      job.usageReported = true;
      turns += projected.turns;
      addUsage(total, projected.usage);
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
    const requestedThinking = thinkingLevelSchema.catch("off").parse(params.thinkingLevel ?? context.thinkingLevel ?? pi.getThinkingLevel());
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
      projection: createSubagentProjection(id, params.prompt),
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

  const start = async (context: ExtensionContext) => {
    if (closing) throw new Error("The parent session is closing.");
    latest = context;
    const settings = await loadSubagentSettings(context.cwd, context.isProjectTrusted());
    if (closing) return;
    userMaxConcurrency = settings.userMaxConcurrency;
    projectMaxConcurrency = settings.projectMaxConcurrency;
    maxConcurrency = settings.effectiveMaxConcurrency;
    for (const diagnostic of settings.diagnostics) context.ui.notify(diagnostic, "warning");
    publish();
  };

  const dispose = async (context: ExtensionContext) => {
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
  };

  let settingOperation = Promise.resolve();
  const setConcurrency = (value: number) => {
    concurrencySchema.parse(value);
    const next = settingOperation.then(async () => {
      if (closing) throw new Error("The parent session is closing.");
      await saveUserMaxConcurrency(value);
      if (closing) return overviewState();
      userMaxConcurrency = value;
      maxConcurrency = projectMaxConcurrency ?? value;
      pump();
      publish();
      return overviewState();
    });
    settingOperation = next.then(() => undefined, () => undefined);
    return next;
  };
  return {
    start, dispose, overview: overviewState, settings: settingsState, setConcurrency,
    enqueue: async (params: { prompt: string; name?: string; model?: string; thinkingLevel?: string }, context: ExtensionContext) => jobSummary(await createJob(params, context)),
    detail: (id: string) => jobDetail(getJobs([id])[0]!),
    cancel: (ids: string[]) => { const selected = getJobs(ids); cancelJobs(selected); return selected.map(jobDetail); },
    result: (ids: string[], toolCallId: string, includeOutput: boolean, includeUsage = true) => resultFor(getJobs(ids), toolCallId, includeOutput, includeUsage),
    wait: async (ids: string[], signal?: AbortSignal) => { await waitForJobs(getJobs(ids), signal); },
    panelJobs: () => [...jobs.values()].map((job) => ({ ...jobDetail(job), output: job.output })),
    format: (id: string) => formatJob(getJobs([id])[0]!, true),
  };
}
