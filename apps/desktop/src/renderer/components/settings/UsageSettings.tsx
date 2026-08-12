import { useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { UsageDashboard } from "../../../shared/pi-types.ts";
import { rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import { useRequest } from "../../lib/useRequest.ts";
import { providerIconName } from "../../lib/providerIcons.ts";
import { useReducedMotion } from "../../lib/motion.ts";
import BrandIcon from "../BrandIcon.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { cn } from "@/lib/utils.ts";

const ALL_PROJECTS = "all-projects";
const PROVIDER_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

type Range = "7" | "30" | "90" | "all";
type ChartMetric = "cost" | "tokens";

export default function UsageSettings() {
  const projects = useAppStore((state) => state.projects);
  const [projectPath, setProjectPath] = useState(ALL_PROJECTS);
  const [range, setRange] = useState<Range>("30");
  const selectedProjects = projectPath === ALL_PROJECTS ? projects : projects.filter((project) => project.path === projectPath);
  const request = useRequest(
    async () => rpc.request.getUsageDashboard({ projects: selectedProjects }),
    [projects, projectPath],
  );
  const dashboard = request.data?.dashboard ?? null;
  const error = request.data?.error ?? request.error;
  const period = periodLabel(range, dashboard?.daily ?? []);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-body-muted-foreground">{period}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={projectPath}
            onValueChange={(value) => typeof value === "string" && setProjectPath(value)}
            items={[{ value: ALL_PROJECTS, label: "All projects" }, ...projects.map((project) => ({ value: project.path, label: project.name }))]}
          >
            <SelectTrigger aria-label="Project" className="h-8 w-full min-w-44 px-2.5 text-xs sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end">
              <SelectGroup>
                <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.path} value={project.path}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <ToggleGroup
              value={[range]}
              onValueChange={(next) => {
                const value = next.at(0) as Range | undefined;
                if (value) setRange(value);
              }}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Date range"
            >
              <ToggleGroupItem value="7">7 days</ToggleGroupItem>
              <ToggleGroupItem value="30">30 days</ToggleGroupItem>
              <ToggleGroupItem value="90">90 days</ToggleGroupItem>
              <ToggleGroupItem value="all">All</ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="outline"
              size="icon-lg"
              onClick={request.reload}
              disabled={request.loading}
              aria-label="Refresh usage"
              title="Refresh usage"
            >
              <ArrowClockwiseIcon className={request.loading ? "animate-spin" : undefined} />
            </Button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Unable to load usage. {error}
        </div>
      ) : null}

      {request.loading ? <Loading /> : dashboard ? <Dashboard dashboard={dashboard} range={range} /> : null}
    </div>
  );
}

function Dashboard({ dashboard, range }: { dashboard: UsageDashboard; range: Range }) {
  if (dashboard.sessions === 0) return <EmptyUsage />;

  const view = filterDashboard(dashboard, range);
  const providers = groupByProvider(view.models);
  const activeDays = view.daily.length;
  const observedInput = view.tokens.input + view.tokens.cacheRead;

  return (
    <div className="flex flex-col gap-9">
      <section className="grid gap-8 border-b border-border/70 pb-9 xl:grid-cols-[minmax(16rem,0.72fr)_minmax(30rem,1.45fr)] xl:gap-10">
        <div className="flex flex-col">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Recorded cost</p>
          <p className="mt-2 font-mono text-4xl font-medium tracking-tight tabular-nums sm:text-5xl">{cost(view.totalCost)}</p>
          <p className="mt-2 max-w-xs text-xs leading-5 text-body-muted-foreground">Model-reported estimates from Pi session files, not provider invoices.</p>

          <div className="mt-7 flex flex-col gap-4">
            {providers.map((provider, index) => {
              const share = view.totalCost > 0 ? (provider.cost / view.totalCost) * 100 : 0;
              return (
                <div key={provider.provider} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <BrandIcon name={providerIconName(provider.provider)} size={15} className="text-muted-foreground" />
                      <span className="truncate font-medium">{prettyProvider(provider.provider)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums">{cost(provider.cost)}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ backgroundColor: providerColor(index), width: `${share}%` }} />
                  </div>
                  <p className="text-xs tabular-nums text-muted-foreground">{share.toFixed(1)}% of cost · {formatTokens(provider.tokens)} tokens</p>
                </div>
              );
            })}
          </div>
        </div>

        <UsageChart daily={view.daily} providers={providers.slice(0, 4)} />
      </section>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-b border-border/70 pb-7 sm:grid-cols-3 xl:grid-cols-5">
        <Metric label="Processed tokens" value={formatTokens(view.tokens.total)} detail={activeDays ? `${formatTokens(view.tokens.total / activeDays)} per active day` : "No activity"} />
        <Metric
          label="Cached input"
          value={formatTokens(view.tokens.cacheRead)}
          detail={observedInput ? `${((view.tokens.cacheRead / observedInput) * 100).toFixed(1)}% of observed input` : "No cached input"}
        />
        <Metric label="Uncached input" value={formatTokens(view.tokens.input)} detail={`${formatTokens(view.tokens.cacheWrite)} cache writes`} />
        <Metric label="Output" value={formatTokens(view.tokens.output)} detail={view.sessions ? `${cost(view.totalCost / view.sessions)} per session` : "No sessions"} />
        <Metric label="Sessions" value={view.sessions.toLocaleString()} detail={`${activeDays.toLocaleString()} active ${activeDays === 1 ? "day" : "days"}`} />
      </dl>

      <section className="grid gap-10 xl:grid-cols-[minmax(0,1.7fr)_minmax(15rem,0.75fr)]">
        <ModelBreakdown models={view.models} totalCost={view.totalCost} />
        <UsageSummary dashboard={dashboard} view={view} />
      </section>

      <p className="max-w-3xl text-xs leading-5 text-body-muted-foreground">
        Costs and tokens come from the usage records Pi writes to session files on this device. Forked sessions count inherited cost once. NativePi stores these totals locally and does not submit them as product telemetry.
      </p>
    </div>
  );
}

function UsageChart({ daily, providers }: { daily: UsageDashboard["daily"]; providers: ReturnType<typeof groupByProvider> }) {
  const [metric, setMetric] = useState<ChartMetric>("cost");
  const reducedMotion = useReducedMotion();
  const data = daily.map((day) => {
    const point: Record<string, string | number> = {
      date: day.date,
      label: formatShortDate(day.date),
      sessions: day.sessions,
      totalTokens: day.tokens,
    };
    for (const model of day.models) {
      const provider = modelProvider(model.name);
      point[provider] = Number(point[provider] ?? 0) + (metric === "cost" ? model.cost : model.tokens);
    }
    return point;
  });
  const config: ChartConfig = Object.fromEntries(
    providers.map((provider, index) => [provider.provider, { label: prettyProvider(provider.provider), color: providerColor(index) }]),
  );
  const max = Math.max(0, ...data.flatMap((point) => providers.map((provider) => Number(point[provider.provider] ?? 0))));

  return (
    <div className="min-w-0 xl:border-l xl:border-border/70 xl:pl-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-sm font-semibold">Daily usage</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {providers.map((provider, index) => (
              <span key={provider.provider} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: providerColor(index) }} aria-hidden />
                {prettyProvider(provider.provider)}
              </span>
            ))}
          </div>
        </div>
        <ToggleGroup
          value={[metric]}
          onValueChange={(next) => {
            const value = next.at(0) as ChartMetric | undefined;
            if (value) setMetric(value);
          }}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Chart measure"
        >
          <ToggleGroupItem value="cost">Cost</ToggleGroupItem>
          <ToggleGroupItem value="tokens">Tokens</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No usage in this period.</div>
      ) : (
        <ChartContainer config={config} className="mt-5 h-64 w-full aspect-auto" initialDimension={{ width: 640, height: 256 }}>
          <AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} className="stroke-border/60" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} tick={{ fontSize: 11 }} />
            <YAxis
              width={48}
              tickLine={false}
              axisLine={false}
              domain={[0, max === 0 ? 1 : max * 1.08]}
              tickFormatter={(value: number) => metric === "cost" ? compactCost(value) : formatTokens(value)}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<UsageTooltip metric={metric} />} />
            {providers.map((provider, index) => (
              <Area
                key={provider.provider}
                dataKey={provider.provider}
                name={prettyProvider(provider.provider)}
                type="monotone"
                fill={providerColor(index)}
                fillOpacity={0.08}
                stroke={providerColor(index)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 2, fill: "var(--background)", stroke: providerColor(index) }}
                isAnimationActive={!reducedMotion}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}

function UsageTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string; payload?: { label?: string; sessions?: number; totalTokens?: number } }[];
  metric: ChartMetric;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !payload?.length || !point) return null;

  return (
    <div className="min-w-48 rounded-lg border border-border/70 bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-xl">
      <p className="font-medium">{point.label}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {payload.map((item) => (
          <div key={String(item.dataKey)} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
              {prettyProvider(String(item.dataKey))}
            </span>
            <span className="font-mono tabular-nums">{metric === "cost" ? cost(item.value ?? 0) : formatTokens(item.value ?? 0)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-border/70 pt-2 text-muted-foreground">
        {point.sessions?.toLocaleString()} {point.sessions === 1 ? "session" : "sessions"} · {formatTokens(point.totalTokens ?? 0)} tokens
      </p>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 font-mono text-lg font-medium tracking-tight tabular-nums">{value}</dd>
      <p className="mt-0.5 truncate text-xs text-body-muted-foreground" title={detail}>{detail}</p>
    </div>
  );
}

function ModelBreakdown({ models, totalCost }: { models: UsageDashboard["models"]; totalCost: number }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-sm font-semibold">Model breakdown</h2>
        <span className="text-xs text-muted-foreground">{models.length} {models.length === 1 ? "model" : "models"}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="pb-2 text-left font-medium">Model</th>
              <th className="px-3 pb-2 text-right font-medium">Cost</th>
              <th className="px-3 pb-2 text-right font-medium">Share</th>
              <th className="pb-2 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => {
              const provider = modelProvider(model.name);
              const share = totalCost > 0 ? (model.cost / totalCost) * 100 : 0;
              return (
                <tr key={model.name} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="max-w-72 py-2.5 pr-3">
                    <span className="flex items-center gap-2">
                      <BrandIcon name={providerIconName(provider)} size={14} className="text-muted-foreground" />
                      <span className="truncate font-medium" title={model.name}>{friendlyModelName(model.name)}</span>
                    </span>
                    <span className="mt-0.5 block truncate pl-[1.375rem] text-xs text-muted-foreground" title={model.name}>{model.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">{cost(model.cost)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{share.toFixed(1)}%</td>
                  <td className="py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatTokens(model.tokens)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsageSummary({ dashboard, view }: { dashboard: UsageDashboard; view: ReturnType<typeof filterDashboard> }) {
  const rows = [
    ["Sessions", view.sessions.toLocaleString()],
    ["Active days", view.daily.length.toLocaleString()],
    ["Projects in view", dashboard.projects.length.toLocaleString()],
    ["Average daily cost", view.daily.length ? cost(view.totalCost / view.daily.length) : "$0"],
    ["Average session cost", view.sessions ? cost(view.totalCost / view.sessions) : "$0"],
  ];

  return (
    <div>
      <h2 className="font-heading text-sm font-semibold">Activity</h2>
      <dl className="mt-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 border-t border-border/70 py-3 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EmptyUsage() {
  return (
    <div className="flex min-h-80 items-center justify-center border-y border-dashed border-border px-6 py-16 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ChartLineUpIcon />
        </span>
        <h2 className="font-heading text-sm font-semibold">No billed usage yet</h2>
        <p className="text-sm leading-6 text-body-muted-foreground">
          Usage appears after Pi records a model cost in a session file. The data stays on this device.
        </p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-80 items-center justify-center gap-2 border-y border-border/70 text-sm text-muted-foreground" role="status">
      <CircleNotchIcon className="animate-spin" />
      Reading Pi&apos;s session files…
    </div>
  );
}

function filterDashboard(dashboard: UsageDashboard, range: Range) {
  if (range === "all") return dashboard;

  const days = Number(range);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  const cutoffDate = localIsoDate(cutoff);
  const daily = dashboard.daily.filter((day) => day.date >= cutoffDate);
  const modelMap = new Map<string, { cost: number; tokens: number }>();
  let totalCost = 0;
  let totalTokens = 0;

  for (const day of daily) {
    totalCost += day.cost;
    totalTokens += day.tokens;
    for (const model of day.models) {
      const previous = modelMap.get(model.name) ?? { cost: 0, tokens: 0 };
      modelMap.set(model.name, { cost: previous.cost + model.cost, tokens: previous.tokens + model.tokens });
    }
  }

  const ratio = dashboard.totalCost > 0 ? totalCost / dashboard.totalCost : 0;
  const tokens = {
    input: Math.round(dashboard.tokens.input * ratio),
    output: Math.round(dashboard.tokens.output * ratio),
    cacheRead: Math.round(dashboard.tokens.cacheRead * ratio),
    cacheWrite: Math.round(dashboard.tokens.cacheWrite * ratio),
    total: totalTokens,
  };
  const sessions = Math.min(dashboard.sessions, daily.reduce((total, day) => total + day.sessions, 0));

  return {
    totalCost,
    sessions,
    daily,
    projects: dashboard.projects,
    models: [...modelMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .toSorted((a, b) => b.cost - a.cost),
    tokens,
  };
}

function groupByProvider(models: { name: string; cost: number; tokens: number }[]) {
  const providers = new Map<string, { cost: number; tokens: number }>();
  for (const model of models) {
    const provider = modelProvider(model.name);
    const previous = providers.get(provider) ?? { cost: 0, tokens: 0 };
    providers.set(provider, { cost: previous.cost + model.cost, tokens: previous.tokens + model.tokens });
  }
  return [...providers.entries()]
    .map(([provider, value]) => ({ provider, ...value }))
    .toSorted((a, b) => b.cost - a.cost);
}

function modelProvider(model: string) {
  return model.includes("/") ? (model.split("/")[0] ?? "other") : "other";
}

function providerColor(index: number) {
  return PROVIDER_COLORS[index % PROVIDER_COLORS.length] ?? "var(--muted-foreground)";
}

function periodLabel(range: Range, daily: UsageDashboard["daily"]) {
  if (range === "all") {
    if (daily.length === 0) return "All recorded usage";
    return `${formatLongDate(daily[0]!.date)} – ${formatLongDate(daily.at(-1)!.date)}`;
  }
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - Number(range) + 1);
  return `${formatLongDate(localIsoDate(start))} – ${formatLongDate(localIsoDate(end))}`;
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLongDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function cost(value: number) {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function compactCost(value: number) {
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `$${value.toFixed(value >= 10 ? 0 : 2)}`;
}

function formatTokens(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function friendlyModelName(value: string) {
  const id = value.split("/").at(-1) ?? value;
  return id
    .replace(/[-_]+/g, " ")
    .replace(/^gpt\s+(?=\d)/i, "GPT-")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\bclaude\b/gi, "Claude")
    .replace(/\bcodex\b/gi, "Codex")
    .replace(/\b(opus|sonnet|haiku|terra|sol|spark)\b/gi, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
    .replace(/\s+/g, " ")
    .trim();
}

function prettyProvider(provider: string) {
  if (!provider || provider === "other") return "Other";
  const names: Record<string, string> = {
    anthropic: "Anthropic",
    google: "Google",
    openai: "OpenAI",
    "openai-codex": "OpenAI Codex",
    openrouter: "OpenRouter",
  };
  return names[provider.toLowerCase()] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}
