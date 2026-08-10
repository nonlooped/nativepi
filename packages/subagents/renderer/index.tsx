import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { RobotIcon } from "@phosphor-icons/react/Robot";
import { XIcon } from "@phosphor-icons/react/X";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext } from "@nativepi/extension-api";
import {
  Badge,
  Button,
  ConversationTranscript,
  FieldError,
  SettingsSliderRow,
} from "@nativepi/extension-api/ui";
import {
  subagentsProtocol,
  type SubagentDetail,
  type SubagentOverview,
  type SubagentStatus,
  type SubagentSummary,
} from "../types.ts";

type Context = RendererContext<typeof subagentsProtocol>;

const number = new Intl.NumberFormat();
const muted: CSSProperties = { color: "var(--muted-foreground)" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function statusLabel(status: SubagentStatus) {
  return status === "cancelling" ? "Cancelling" : `${status[0]!.toUpperCase()}${status.slice(1)}`;
}

function statusColor(status: SubagentStatus) {
  if (status === "failed") return "var(--destructive)";
  if (status === "running" || status === "completed") return "var(--success)";
  if (status === "queued" || status === "cancelling") return "var(--warning)";
  return "var(--muted-foreground)";
}

function StatusBadge({ status }: { status: SubagentStatus }) {
  const color = statusColor(status);
  return (
    <Badge
      variant="outline"
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 35%, transparent)`,
        background: `color-mix(in oklch, ${color} 10%, transparent)`,
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {statusLabel(status)}
    </Badge>
  );
}

function useOverview(context: Context) {
  const { call, on } = context.channel;
  const [overview, setOverview] = useState<SubagentOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void call("overview")
      .then((value) => {
        if (!active) return;
        setOverview(value);
        setError(null);
      })
      .catch((reason: unknown) => active && setError(errorMessage(reason)));
    const off = on("changed", (value) => {
      setOverview(value);
      setError(null);
    });
    return () => {
      active = false;
      off();
    };
  }, [call, on]);

  return { overview, setOverview, error };
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function duration(job: SubagentSummary, now: number) {
  if (!job.startedAt) return "Waiting";
  const seconds = Math.max(0, Math.floor(((job.finishedAt ?? now) - job.startedAt) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function useNarrowWorkspace() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" ? window.innerWidth < 720 : false);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
  }, []);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? element.getBoundingClientRect().width;
      setNarrow(width < 720);
    });
    observer.observe(element);
    setNarrow(element.getBoundingClientRect().width < 720);
    return () => observer.disconnect();
  }, [element]);
  return { ref, narrow };
}

function OverviewCounts({ jobs }: { jobs: SubagentSummary[] }) {
  const running = jobs.filter((job) => job.status === "running" || job.status === "cancelling").length;
  const queued = jobs.filter((job) => job.status === "queued").length;
  return (
    <div style={{ ...muted, display: "flex", gap: "0.75rem", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
      <span><strong style={{ color: "var(--foreground)" }}>{running}</strong> running</span>
      <span><strong style={{ color: "var(--foreground)" }}>{queued}</strong> queued</span>
      <span><strong style={{ color: "var(--foreground)" }}>{jobs.length}</strong> total</span>
    </div>
  );
}

function JobRow({ job, selected, now, onSelect }: {
  job: SubagentSummary;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  return (
    <Button
      variant={selected ? "secondary" : "ghost"}
      onClick={onSelect}
      title={job.prompt}
      style={{
        width: "100%",
        height: "auto",
        minHeight: "4.5rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "0.375rem",
        padding: "0.625rem 0.75rem",
        whiteSpace: "normal",
        textAlign: "start",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
        <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.8125rem", fontWeight: 600 }}>
          {job.name ?? `Subagent ${job.id}`}
        </span>
        <StatusBadge status={job.status} />
      </span>
      <span
        style={{
          ...muted,
          display: "-webkit-box",
          overflow: "hidden",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          fontSize: "0.75rem",
          lineHeight: 1.4,
        }}
      >
        {job.prompt}
      </span>
      <span style={{ ...muted, display: "flex", gap: "0.375rem", overflow: "hidden", fontSize: "0.6875rem", fontVariantNumeric: "tabular-nums" }}>
        <span>{duration(job, now)}</span>
        <span aria-hidden="true">·</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{job.model}</span>
      </span>
    </Button>
  );
}

function EmptyJobs() {
  return (
    <div style={{ margin: "auto", maxWidth: "22rem", padding: "2rem", textAlign: "center" }}>
      <RobotIcon size={28} aria-hidden="true" style={{ color: "var(--muted-foreground)", margin: "0 auto 0.75rem" }} />
      <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600 }}>No subagents yet</h2>
      <p style={{ ...muted, margin: "0.375rem 0 0", fontSize: "0.8125rem", lineHeight: 1.5 }}>
        When Pi delegates work in this chat, each child conversation will appear here.
      </p>
    </div>
  );
}

function JobList({ jobs, selectedId, onSelect }: {
  jobs: SubagentSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const active = jobs.some((job) => job.status === "running" || job.status === "cancelling");
  const now = useNow(active);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.5rem" }}>
      {[...jobs].reverse().map((job) => (
        <JobRow key={job.id} job={job} selected={job.id === selectedId} now={now} onSelect={() => onSelect(job.id)} />
      ))}
    </div>
  );
}

function JobConversation({ context, summary, narrow, onBack }: {
  context: Context;
  summary: SubagentSummary;
  narrow: boolean;
  onBack: () => void;
}) {
  const { call } = context.channel;
  const [detail, setDetail] = useState<SubagentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = summary.status === "running" || summary.status === "cancelling";
  const now = useNow(active);

  useEffect(() => {
    let current = true;
    void call("detail", { id: summary.id })
      .then((value) => {
        if (!current) return;
        setDetail(value);
        setError(null);
      })
      .catch((reason: unknown) => current && setError(errorMessage(reason)));
    return () => {
      current = false;
    };
  }, [call, summary]);

  const cancel = () => {
    setError(null);
    void call("cancel", { id: summary.id }).then(setDetail).catch((reason: unknown) => setError(errorMessage(reason)));
  };

  return (
    <section style={{ minWidth: 0, minHeight: 0, display: "flex", flex: 1, flexDirection: "column" }}>
      <header style={{ display: "flex", minHeight: "4.5rem", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
        {narrow ? (
          <Button variant="ghost" size="icon-sm" onClick={onBack} title="All subagents" aria-label="All subagents">
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600 }}>
              {summary.name ?? `Subagent ${summary.id}`}
            </h2>
            <StatusBadge status={summary.status} />
          </div>
          <div style={{ ...muted, display: "flex", flexWrap: "wrap", gap: "0.25rem 0.5rem", marginTop: "0.25rem", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
            <span>{summary.model}</span>
            <span aria-hidden="true">·</span>
            <span>Thinking {summary.thinkingLevel}</span>
            <span aria-hidden="true">·</span>
            <span>{duration(summary, now)}</span>
            {summary.usage.totalTokens > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{number.format(summary.usage.totalTokens)} tokens</span>
              </>
            ) : null}
          </div>
        </div>
        {summary.status === "queued" || summary.status === "running" ? (
          <Button variant="destructive" size="sm" onClick={cancel}>
            <XIcon data-icon="inline-start" />
            Cancel
          </Button>
        ) : null}
      </header>
      {error ? <div style={{ padding: "0.75rem 1rem" }}><FieldError>{error}</FieldError></div> : null}
      {!detail || detail.id !== summary.id ? (
        <p style={{ ...muted, margin: "auto", fontSize: "0.8125rem" }}>Loading conversation…</p>
      ) : (
        <ConversationTranscript
          messages={detail.conversation}
          running={detail.status === "running" || detail.status === "cancelling"}
          style={{ minHeight: 0, flex: 1 }}
        />
      )}
    </section>
  );
}

function SubagentWorkspace({ context }: { context: Context }) {
  const { overview, error } = useOverview(context);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const { ref, narrow } = useNarrowWorkspace();

  if (error)
    return (
      <div ref={ref} style={{ display: "flex", height: "100%", padding: "1rem" }}>
        <FieldError>{error}</FieldError>
      </div>
    );
  if (!overview)
    return (
      <div ref={ref} style={{ display: "flex", height: "100%" }}>
        <p style={{ ...muted, margin: "auto", fontSize: "0.8125rem" }}>Loading subagents…</p>
      </div>
    );
  if (overview.jobs.length === 0) return <div ref={ref} style={{ display: "flex", height: "100%" }}><EmptyJobs /></div>;

  const selected = overview.jobs.find((job) => job.id === selectedId) ?? overview.jobs.at(-1)!;
  const select = (id: string) => {
    setSelectedId(id);
    setShowDetail(true);
  };
  const showList = !narrow || !showDetail;
  const showConversation = !narrow || showDetail;

  return (
    <div ref={ref} style={{ display: "flex", height: "100%", minHeight: 0, minWidth: 0 }}>
      {showList ? (
        <aside style={{ width: narrow ? "100%" : "18rem", minWidth: 0, display: "flex", flexShrink: 0, flexDirection: "column", borderInlineEnd: narrow ? undefined : "1px solid var(--border)", background: "var(--sidebar)" }}>
          <div style={{ display: "flex", minHeight: "4.5rem", flexDirection: "column", justifyContent: "center", gap: "0.375rem", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "0.875rem", fontWeight: 600 }}>Current chat</h2>
            <OverviewCounts jobs={overview.jobs} />
          </div>
          <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
            <JobList jobs={overview.jobs} selectedId={selected.id} onSelect={select} />
          </div>
        </aside>
      ) : null}
      {showConversation ? (
        <JobConversation context={context} summary={selected} narrow={narrow} onBack={() => setShowDetail(false)} />
      ) : null}
    </div>
  );
}

function SubagentHeaderControl({ context }: { context: Context }) {
  const { overview } = useOverview(context);
  const active = overview?.jobs.filter((job) =>
    job.status === "queued" || job.status === "running" || job.status === "cancelling"
  ).length ?? 0;
  return (
    <>
      <span>Subagents</span>
      {active > 0 ? <Badge variant="secondary">{active}</Badge> : null}
    </>
  );
}

function SubagentSettingsControl({ context }: { context: Context }) {
  const { call } = context.channel;
  const { overview, setOverview, error } = useOverview(context);
  const settings = overview?.settings;

  const changeMaxConcurrency = (maxConcurrency: number) => {
    if (!overview || maxConcurrency === overview.settings.userMaxConcurrency) return;
    const previous = overview;
    setOverview({ ...overview, settings: { ...overview.settings, userMaxConcurrency: maxConcurrency } });
    void call("setMaxConcurrency", { maxConcurrency }).then(setOverview).catch(() => {
      setOverview(previous);
      context.actions.notify("Unable to save the subagent limit. Try again.", "error");
    });
  };

  const isOverridden = settings?.projectMaxConcurrency !== null && settings?.projectMaxConcurrency !== undefined;
  const description = isOverridden
    ? `User default is ${settings?.userMaxConcurrency}. This project runs up to ${settings?.effectiveMaxConcurrency} subagents at once.`
    : "Maximum subagents that may run at once. Additional work waits in the queue.";

  return (
    <>
      <SettingsSliderRow
        label="Concurrent subagents"
        description={description}
        value={settings?.userMaxConcurrency ?? 6}
        min={1}
        max={32}
        step={1}
        format={(value) => `${value}`}
        onChange={changeMaxConcurrency}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </>
  );
}

export default defineRenderer({
  apiVersion: 1,
  protocol: subagentsProtocol,
  conversationViews: [
    {
      id: "subagents",
      label: "Subagents",
      control: (context) => <SubagentHeaderControl context={context} />,
      render: (context) => <SubagentWorkspace context={context} />,
    },
  ],
  settings: [
    {
      id: "subagents",
      heading: "Subagents",
      description: "Run isolated Pi sessions in parallel without sharing the parent conversation.",
      render: (context) => <SubagentSettingsControl context={context} />,
    },
  ],
});
