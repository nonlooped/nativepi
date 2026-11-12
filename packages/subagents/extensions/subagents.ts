import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { Type } from "typebox";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { subagentsProtocol, THINKING_LEVELS, concurrencySchema } from "../types.ts";
import { SubagentsPanel } from "./subagents-tui.ts";
import { createSubagentPool } from "./pool.ts";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const SpawnParameters = Type.Object({
  prompt: Type.String({ description: "Self-contained task for the child; it cannot see the parent conversation." }),
  name: Type.Optional(Type.String({ description: "Short label for this child." })),
  model: Type.Optional(Type.String({ description: "Model id or provider/model. Omit to use the parent chat's current model." })),
  thinkingLevel: Type.Optional(Type.Enum(THINKING_LEVELS, { type: "string", description: "Pi thinking/reasoning level. Omit to use the parent chat's current level." })),
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
  const pool = createSubagentPool(pi, (overview) => ui.emit("changed", overview), () => ui.connected);
  const ui = connect("@nativepi/subagents", subagentsProtocol, {
    overview: pool.overview,
    detail: ({ id }) => pool.detail(id),
    cancel: ({ id }) => pool.cancel([id])[0]!,
    setMaxConcurrency: ({ maxConcurrency }) => pool.setConcurrency(maxConcurrency),
  });
  pi.on("session_start", async (_event, context) => { await pool.start(context); });
  pi.on("session_shutdown", async (_event, context) => { await pool.dispose(context); });
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
      const job = await pool.enqueue(params, context);
      return {
        content: [{
          type: "text",
          text: `${job.id} ${job.status}. Model: ${job.model}; thinking: ${job.thinkingLevel}.`,
        }],
        details: { job },
      };
    },
  });

  pi.registerTool({
    name: "subagent_status",
    label: "Subagent Status",
    description: "Get one subagent's current state and its final response when settled.",
    parameters: IdParameters,
    async execute(toolCallId, params) {
      return pool.result([params.id], toolCallId, true);
    },
  });

  pi.registerTool({
    name: "subagent_list",
    label: "List Subagents",
    description: "List queued, running, and settled subagents in this parent session without their full responses.",
    parameters: Type.Object({}),
    async execute(toolCallId) {
      return pool.result(pool.overview().jobs.map((job) => job.id), toolCallId, false, false);
    },
  });

  pi.registerTool({
    name: "subagent_wait",
    label: "Wait for Subagents",
    description: "Wait until every selected subagent settles, then return their final responses. Cancelling this wait does not cancel the children.",
    parameters: IdsParameters,
    async execute(toolCallId, params, signal) {
      await pool.wait(params.ids, signal);
      return pool.result(params.ids, toolCallId, true);
    },
  });

  pi.registerTool({
    name: "subagent_cancel",
    label: "Cancel Subagents",
    description: "Cancel queued or running subagents by id.",
    parameters: IdsParameters,
    async execute(toolCallId, params) {
      pool.cancel(params.ids);
      return pool.result(params.ids, toolCallId, false);
    },
  });

  const openDashboard = async (context: ExtensionContext) => {
    await context.ui.custom<unknown>((tui, theme, _keybindings, done) =>
      new SubagentsPanel({
        tui,
        theme,
        jobs: pool.panelJobs,
        settings: pool.settings,
        parent: {
          model: context.model ? `${context.model.provider}/${context.model.id}` : "No model selected",
          thinking: context.thinkingLevel ?? pi.getThinkingLevel(),
        },
        spawn: async (prompt) => {
          await pool.enqueue({ prompt }, context);
        },
        cancel: (id) => { pool.cancel([id]); },
        setConcurrency: async (value) => { await pool.setConcurrency(value); },
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
      const all = pool.overview().jobs;
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
      const job = pool.overview().jobs.find((job) => job.id === id);
      if (!job) {
        context.ui.notify(`Unknown subagent id: ${id}`, "warning");
        return;
      }
      const detail = pool.format(job.id);
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
        const selected = pool.cancel(ids);
        context.ui.notify(`Cancelled ${selected.length} subagent(s).`, "info");
      } catch (err) {
        context.ui.notify(errorMessage(err), "warning");
      }
      return;
    }
    if (head === "concurrency" || head === "limit") {
      const value = Number(rest.trim());
      if (!concurrencySchema.safeParse(value).success) {
        context.ui.notify(`Concurrency must be an integer 1–32 (current effective: ${pool.settings().effectiveMaxConcurrency}).`, "warning");
        return;
      }
      try {
        await pool.setConcurrency(value);
        context.ui.notify(`Concurrency set to ${value} (effective ${pool.settings().effectiveMaxConcurrency}).`, "info");
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
        const job = await pool.enqueue({ prompt: parsed.prompt, name: parsed.name, model: parsed.model, thinkingLevel: parsed.thinking }, context);
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
    if (args.trim().length > 8 && !args.trim().startsWith("--")) {
      const maybePrompt = args.trim();
      const looksLikeCommand = ["list", "spawn", "status", "cancel", "concurrency", "dashboard", "open", "help"].some((c) => maybePrompt.toLowerCase().startsWith(c));
      if (!looksLikeCommand) {
        try {
          const job = await pool.enqueue({ prompt: maybePrompt }, context);
          context.ui.notify(`${job.id} queued — ${job.model}. Use /subagents to watch.`, "info");
        } catch (err) {
          context.ui.notify(errorMessage(err), "error");
        }
        return;
      }
    }
    context.ui.notify(`Unknown subcommand "${head}". Try /subagents help.`, "warning");
  };

  pi.registerCommand("subagents", {
    description: "Manage asynchronous subagents — list, spawn, cancel, and watch them live",
    getArgumentCompletions: (prefix) => {
      const options = ["list", "spawn ", "status ", "cancel ", "concurrency ", "help", "dashboard"];
      const filtered = options.filter((value) => value.startsWith(prefix.toLowerCase()));
      if (filtered.length > 0) return filtered.map((value) => ({ value, label: value }));
      const ids = pool.overview().jobs.map((job) => job.id).filter((id) => id.startsWith(prefix));
      return ids.length > 0 ? ids.map((value) => ({ value, label: value })) : null;
    },
    handler: handleSubagentsCommand,
  });

  pi.registerCommand("subagent", {
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
