import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { Component, Focusable } from "@earendil-works/pi-tui";
import type {
  SubagentConversationBlock,
  SubagentConversationMessage,
  SubagentSettings,
  SubagentStatus,
} from "../types.ts";

export type SubagentsPanelJob = {
  id: string;
  name?: string;
  prompt: string;
  status: SubagentStatus;
  model: string;
  thinkingLevel: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  output?: string;
  error?: string;
  turns: number;
  toolCount: number;
  usage: { totalTokens: number };
  conversation: SubagentConversationMessage[];
};

type Filter = "all" | "active" | "queued" | "done";
type View = "list" | "detail" | "spawn" | "cancel" | "limit";

type PanelOptions = {
  tui: { requestRender(): void };
  theme: Theme;
  jobs: () => SubagentsPanelJob[];
  settings: () => SubagentSettings;
  parent: { model: string; thinking: string };
  spawn: (prompt: string) => Promise<void>;
  cancel: (id: string) => void;
  setConcurrency: (value: number) => Promise<void>;
  close: () => void;
};

const FILTERS: Filter[] = ["all", "active", "queued", "done"];
const STATUS_LABELS: Record<SubagentStatus, string> = {
  queued: "Queued",
  running: "Running",
  cancelling: "Stopping",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function terminal(status: SubagentStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function statusColor(status: SubagentStatus) {
  if (status === "failed") return "error" as const;
  if (status === "running" || status === "completed") return "success" as const;
  if (status === "queued" || status === "cancelling") return "warning" as const;
  return "dim" as const;
}

function statusMark(status: SubagentStatus) {
  if (status === "running") return "●";
  if (status === "queued") return "○";
  if (status === "cancelling") return "◐";
  if (status === "completed") return "✓";
  if (status === "failed") return "✗";
  return "–";
}

function duration(job: SubagentsPanelJob) {
  if (!job.startedAt) return "waiting";
  const seconds = Math.max(0, Math.floor(((job.finishedAt ?? Date.now()) - job.startedAt) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function tokenCount(tokens: number) {
  if (tokens < 1_000) return `${tokens}`;
  return `${(tokens / 1_000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
}

function plain(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function padEnd(text: string, width: number) {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function columns(start: string, end: string, width: number) {
  const available = Math.max(0, width - visibleWidth(end) - 1);
  const leading = truncateToWidth(start, available, "…");
  return `${leading}${" ".repeat(Math.max(1, width - visibleWidth(leading) - visibleWidth(end)))}${end}`;
}

function indent(lines: string[], amount = 2) {
  const prefix = " ".repeat(amount);
  return lines.map((line) => `${prefix}${line}`);
}

function wrap(text: string, width: number, maxLines = Number.POSITIVE_INFINITY) {
  return wrapTextWithAnsi(text, Math.max(1, width)).slice(0, maxLines);
}

function latestActivity(messages: SubagentConversationMessage[], width: number) {
  const activity: string[] = [];
  const blocks = messages.flatMap((message) => message.role === "assistant" ? message.content : []);
  for (const block of blocks.slice(-8)) activity.push(activityLine(block, width));
  return activity.filter(Boolean).slice(-6);
}

function activityLine(block: SubagentConversationBlock, width: number) {
  if (block.type === "thinking") return truncateToWidth(`Thinking  ${plain(block.text) || "…"}`, width, "…");
  if (block.type === "text") return truncateToWidth(`Reply     ${plain(block.text) || "…"}`, width, "…");
  const mark = block.status === "completed" ? "✓" : block.status === "failed" ? "✗" : block.status === "cancelled" ? "–" : "◐";
  const result = block.result ? `  ${plain(block.result)}` : "";
  return truncateToWidth(`${mark} ${block.name}${result}`, width, "…");
}

export class SubagentsPanel extends Container implements Focusable, Component {
  private view: View = "list";
  private filter: Filter = "all";
  private selected = 0;
  private detailId: string | undefined;
  private cancelId: string | undefined;
  private input = new Input();
  private message: { tone: "success" | "error" | "warning"; text: string } | undefined;
  private busy = false;
  private poll: ReturnType<typeof setInterval> | undefined;
  private _focused = false;

  get focused() {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.input.focused = value && (this.view === "spawn" || this.view === "limit");
  }

  constructor(private readonly options: PanelOptions) {
    super();
    this.input.onEscape = () => this.back();
    this.input.onSubmit = (value) => this.submit(value);
    this.poll = setInterval(() => options.tui.requestRender(), 500);
  }

  private allJobs() {
    return [...this.options.jobs()].reverse();
  }

  private visibleJobs() {
    return this.allJobs().filter((job) => {
      if (this.filter === "active") return job.status === "running" || job.status === "cancelling";
      if (this.filter === "queued") return job.status === "queued";
      if (this.filter === "done") return terminal(job.status);
      return true;
    });
  }

  private selectedJob() {
    const jobs = this.visibleJobs();
    this.selected = Math.min(this.selected, Math.max(0, jobs.length - 1));
    return jobs[this.selected];
  }

  private setView(view: View) {
    this.view = view;
    this.message = undefined;
    this.input.focused = this.focused && (view === "spawn" || view === "limit");
    this.options.tui.requestRender();
  }

  private back() {
    if (this.view === "list") {
      this.options.close();
      return;
    }
    this.setView(this.view === "cancel" && this.detailId ? "detail" : "list");
  }

  private submit(value: string) {
    if (this.busy) return;
    if (this.view === "spawn") {
      const prompt = value.trim();
      if (!prompt) {
        this.message = { tone: "error", text: "Describe the task before starting the subagent." };
        this.options.tui.requestRender();
        return;
      }
      this.busy = true;
      this.message = undefined;
      void this.options.spawn(prompt).then(
        () => {
          this.busy = false;
          this.input.setValue("");
          this.view = "list";
          this.selected = 0;
          this.message = { tone: "success", text: "Subagent started." };
          this.input.focused = false;
          this.options.tui.requestRender();
        },
        (error: unknown) => {
          this.busy = false;
          this.message = { tone: "error", text: error instanceof Error ? error.message : String(error) };
          this.options.tui.requestRender();
        },
      );
      return;
    }

    if (this.view === "limit") {
      const limit = Number(value.trim());
      if (!Number.isInteger(limit) || limit < 1 || limit > 32) {
        this.message = { tone: "error", text: "Enter a whole number from 1 to 32." };
        this.options.tui.requestRender();
        return;
      }
      this.busy = true;
      this.message = undefined;
      void this.options.setConcurrency(limit).then(
        () => {
          this.busy = false;
          this.view = "list";
          this.input.focused = false;
          this.message = { tone: "success", text: `User default set to ${limit}.` };
          this.options.tui.requestRender();
        },
        (error: unknown) => {
          this.busy = false;
          this.message = { tone: "error", text: error instanceof Error ? error.message : String(error) };
          this.options.tui.requestRender();
        },
      );
    }
  }

  private openSelected() {
    const job = this.selectedJob();
    if (!job) return;
    this.detailId = job.id;
    this.setView("detail");
  }

  private askToCancel(job: SubagentsPanelJob | undefined) {
    if (!job || terminal(job.status) || job.status === "cancelling") return;
    this.cancelId = job.id;
    this.setView("cancel");
  }

  private confirmCancel() {
    if (!this.cancelId) return;
    const job = this.options.jobs().find((candidate) => candidate.id === this.cancelId);
    if (job && !terminal(job.status) && job.status !== "cancelling") this.options.cancel(job.id);
    this.message = { tone: "warning", text: "Stopping subagent…" };
    this.view = this.detailId === this.cancelId ? "detail" : "list";
    this.cancelId = undefined;
    this.options.tui.requestRender();
  }

  private cycleFilter() {
    this.filter = FILTERS[(FILTERS.indexOf(this.filter) + 1) % FILTERS.length]!;
    this.selected = 0;
    this.message = undefined;
    this.options.tui.requestRender();
  }

  handleInput(data: string) {
    if (this.view === "spawn" || this.view === "limit") {
      this.input.handleInput(data);
      this.options.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      this.back();
      return;
    }
    if (this.view === "cancel") {
      if (matchesKey(data, Key.enter)) this.confirmCancel();
      return;
    }
    if (this.view === "detail") {
      const job = this.options.jobs().find((candidate) => candidate.id === this.detailId);
      if (data === "x" || data === "X") this.askToCancel(job);
      return;
    }
    if (matchesKey(data, Key.up)) {
      this.selected = Math.max(0, this.selected - 1);
      this.message = undefined;
      this.options.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.selected = Math.min(Math.max(0, this.visibleJobs().length - 1), this.selected + 1);
      this.message = undefined;
      this.options.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.openSelected();
      return;
    }
    if (matchesKey(data, Key.tab)) {
      this.cycleFilter();
      return;
    }
    if (data === "n" || data === "N") {
      this.input.setValue("");
      this.setView("spawn");
      return;
    }
    if (data === "l" || data === "L") {
      this.input.setValue(String(this.options.settings().userMaxConcurrency));
      this.setView("limit");
      return;
    }
    if (data === "x" || data === "X") this.askToCancel(this.selectedJob());
  }

  private header(width: number) {
    const jobs = this.allJobs();
    const running = jobs.filter((job) => job.status === "running" || job.status === "cancelling").length;
    const queued = jobs.filter((job) => job.status === "queued").length;
    const settings = this.options.settings();
    const title = this.options.theme.fg("accent", this.options.theme.bold("Subagents"));
    const summary = this.options.theme.fg("muted", `${running} running  ${queued} queued  limit ${settings.effectiveMaxConcurrency}`);
    return columns(title, summary, width);
  }

  private filters(width: number) {
    const jobs = this.allJobs();
    const counts: Record<Filter, number> = {
      all: jobs.length,
      active: jobs.filter((job) => job.status === "running" || job.status === "cancelling").length,
      queued: jobs.filter((job) => job.status === "queued").length,
      done: jobs.filter((job) => terminal(job.status)).length,
    };
    const label: Record<Filter, string> = { all: "All", active: "Active", queued: "Queued", done: "Done" };
    const tabs = FILTERS.map((filter) => {
      const text = `${label[filter]} ${counts[filter]}`;
      return filter === this.filter
        ? this.options.theme.fg("text", this.options.theme.bold(`[${text}]`))
        : this.options.theme.fg("dim", text);
    }).join("   ");
    return truncateToWidth(tabs, width, "");
  }

  private renderList(width: number) {
    const theme = this.options.theme;
    const jobs = this.visibleJobs();
    const lines = [this.header(width), "", this.filters(width), ""];
    if (jobs.length === 0) {
      const label = this.filter === "all" ? "No subagents yet" : `No ${this.filter} subagents`;
      lines.push(theme.fg("text", label));
      lines.push(theme.fg("muted", this.filter === "all" ? "Press N to start one." : "Press Tab to change the view."));
      lines.push("", theme.fg("dim", "N new   L limit   Tab view   Esc close"));
      return lines.map((line) => truncateToWidth(line, width, ""));
    }

    const start = Math.max(0, Math.min(this.selected - 3, jobs.length - 7));
    const end = Math.min(jobs.length, start + 7);
    for (let index = start; index < end; index++) {
      const job = jobs[index]!;
      const selected = index === this.selected;
      const status = theme.fg(statusColor(job.status), `${statusMark(job.status)} ${STATUS_LABELS[job.status]}`);
      const name = job.name ?? job.id;
      const title = columns(
        `${selected ? "›" : " "} ${theme.fg("text", theme.bold(name))}  ${theme.fg("dim", job.model)}`,
        status,
        width,
      );
      const meta = `${duration(job)}  ${tokenCount(job.usage.totalTokens)} tokens`;
      const detail = columns(`  ${theme.fg("muted", plain(job.prompt))}`, theme.fg("dim", meta), width);
      lines.push(selected ? theme.bg("selectedBg", padEnd(title, width)) : title);
      lines.push(selected ? theme.bg("selectedBg", padEnd(theme.fg("muted", detail), width)) : theme.fg("dim", detail));
    }
    if (jobs.length > 7) lines.push(theme.fg("dim", `  ${this.selected + 1} of ${jobs.length}`));
    if (this.message) lines.push("", theme.fg(this.message.tone, this.message.text));
    const hints = width < 64
      ? "Esc close   ↑↓ move   Enter open   N new"
      : "Esc close   ↑↓ move   Enter open   N new   X stop   Tab view   L limit";
    lines.push("", theme.fg("dim", hints));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  private renderDetail(width: number) {
    const theme = this.options.theme;
    const job = this.options.jobs().find((candidate) => candidate.id === this.detailId);
    if (!job) {
      this.view = "list";
      return this.renderList(width);
    }
    const status = theme.fg(statusColor(job.status), `${statusMark(job.status)} ${STATUS_LABELS[job.status]}`);
    const title = theme.fg("text", theme.bold(job.name ?? job.id));
    const lines = [
      columns(`${theme.fg("dim", "‹")} ${title}`, status, width),
      theme.fg("dim", `${job.model}  ·  thinking ${job.thinkingLevel}  ·  ${duration(job)}  ·  ${tokenCount(job.usage.totalTokens)} tokens  ·  ${job.toolCount} tools`),
      "",
      theme.fg("muted", "Task"),
      ...wrap(theme.fg("text", job.prompt), width, 3),
    ];
    if (job.error) lines.push("", theme.fg("error", job.error));
    const activity = latestActivity(job.conversation, width - 2);
    lines.push("", theme.fg("muted", "Recent activity"));
    if (activity.length === 0) lines.push(theme.fg("dim", job.status === "queued" ? "Waiting to start." : "Waiting for the first response."));
    else {
      for (const line of activity) {
        const isFailed = line.startsWith("✗");
        const isTool = /^[✓✗–◐]/.test(line);
        lines.push(`  ${theme.fg(isFailed ? "error" : isTool ? "muted" : "dim", line)}`);
      }
    }
    if (terminal(job.status) && job.output) {
      lines.push("", theme.fg("muted", "Final response"));
      lines.push(...wrap(theme.fg("text", plain(job.output)), width, 4));
    }
    if (this.message) lines.push("", theme.fg(this.message.tone, this.message.text));
    const canStop = !terminal(job.status) && job.status !== "cancelling";
    lines.push("", theme.fg("dim", `${canStop ? "X stop   " : ""}Esc back`));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  private renderSpawn(width: number) {
    const theme = this.options.theme;
    const lines = [
      theme.fg("accent", theme.bold("New subagent")),
      theme.fg("muted", "It can use this project, but it cannot see this conversation."),
      "",
      theme.fg("muted", "Task"),
      ...indent(this.input.render(Math.max(1, width - 2))),
      "",
      theme.fg("dim", `${this.options.parent.model}  ·  thinking ${this.options.parent.thinking}`),
    ];
    if (this.message) lines.push("", theme.fg(this.message.tone, this.message.text));
    lines.push("", theme.fg("dim", `${this.busy ? "Starting…" : "Enter start"}   Esc cancel`));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  private renderLimit(width: number) {
    const theme = this.options.theme;
    const settings = this.options.settings();
    const override = settings.projectMaxConcurrency;
    const lines = [
      theme.fg("accent", theme.bold("Concurrency limit")),
      theme.fg("muted", override === null
        ? "Additional subagents wait in the queue."
        : `This project uses ${override}. Saving changes your user default only.`),
      "",
      theme.fg("muted", "User default (1–32)"),
      ...indent(this.input.render(Math.max(1, width - 2))),
    ];
    if (this.message) lines.push("", theme.fg(this.message.tone, this.message.text));
    lines.push("", theme.fg("dim", `${this.busy ? "Saving…" : "Enter save"}   Esc cancel`));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  private renderCancel(width: number) {
    const theme = this.options.theme;
    const job = this.options.jobs().find((candidate) => candidate.id === this.cancelId);
    if (!job) {
      this.view = "list";
      return this.renderList(width);
    }
    const name = job.name ?? (plain(job.prompt) || job.id);
    return [
      theme.fg("warning", theme.bold(`Stop ${truncateToWidth(name, Math.max(8, width - 6), "…")}?`)),
      theme.fg("muted", "The subagent will keep any work it already wrote, but its response may be incomplete."),
      "",
      theme.fg("text", "Enter stop subagent"),
      theme.fg("dim", "Esc keep running"),
    ].map((line) => truncateToWidth(line, width, ""));
  }

  render(width: number) {
    const inner = Math.max(20, width - 2);
    const body = this.view === "detail"
      ? this.renderDetail(inner)
      : this.view === "spawn"
        ? this.renderSpawn(inner)
        : this.view === "limit"
          ? this.renderLimit(inner)
          : this.view === "cancel"
            ? this.renderCancel(inner)
            : this.renderList(inner);
    return [this.options.theme.fg("border", "─".repeat(inner)), ...indent(body, 1), this.options.theme.fg("border", "─".repeat(inner))]
      .map((line) => truncateToWidth(line, width, ""));
  }

  invalidate() {
    this.input.invalidate();
  }

  dispose() {
    if (this.poll) clearInterval(this.poll);
    this.poll = undefined;
  }
}
