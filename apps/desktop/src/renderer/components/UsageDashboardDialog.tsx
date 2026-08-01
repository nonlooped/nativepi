/*
THESIS: make the Pi-written cost record immediately scannable, without turning it into a dashboard grid.
OWN-WORLD: NativePi's graphite dialog, hairlines, quiet rows, and tabular cost figures.
STORY: choose all projects or one project, see total spend, its recent direction, and where it came from.
FIRST VIEWPORT: title and project filter lead; total, trend, then compact model and project ledgers follow.
FORM: an operating receipt, extending the existing session-info dialog rather than inventing a second surface language.
*/
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { TrendDownIcon } from "@phosphor-icons/react/TrendDown";
import { TrendUpIcon } from "@phosphor-icons/react/TrendUp";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useState } from "react";
import type { UsageDashboard } from "../../shared/pi-types.ts";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart.tsx";

const ALL_PROJECTS = "all-projects";

export default function UsageDashboardDialog({ onClose }: { onClose: () => void }) {
  const projects = useAppStore((state) => state.projects);
  const [projectPath, setProjectPath] = useState(ALL_PROJECTS);
  const selectedProjects = projectPath === ALL_PROJECTS ? projects : projects.filter((project) => project.path === projectPath);
  const request = useRequest(
    async () => rpc.request.getUsageDashboard({ projects: selectedProjects }),
    [projects, projectPath],
  );
  const dashboard = request.data?.dashboard ?? null;
  const error = request.data?.error ?? request.error;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Usage and costs</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Spend recorded in Pi session files. NativePi does not send a prompt to calculate it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <Select
            value={projectPath}
            onValueChange={(next) => typeof next === "string" && setProjectPath(next)}
            items={[{ value: ALL_PROJECTS, label: "All projects" }, ...projects.map((project) => ({ value: project.path, label: project.name }))]}
          >
            <SelectTrigger aria-label="Project" className="max-w-64 px-3 text-sm data-[size=default]:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS} className="min-h-8 px-2.5 text-sm">All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.path} value={project.path} className="min-h-8 px-2.5 text-sm">
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={request.reload} disabled={request.loading}>
            <ArrowClockwiseIcon data-icon="inline-start" className={request.loading ? "animate-spin" : undefined} />
            Refresh
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">Unable to load usage. {error}</p> : null}
        {request.loading ? <Loading /> : dashboard ? <Dashboard dashboard={dashboard} allProjects={projectPath === ALL_PROJECTS} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Dashboard({ dashboard, allProjects }: { dashboard: UsageDashboard; allProjects: boolean }) {
  if (dashboard.sessions === 0) {
    return <p className="py-8 text-center text-sm leading-relaxed text-muted-foreground">No billed model usage is recorded for this selection yet.</p>;
  }

  const trend = recentTrend(dashboard.daily);
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3" aria-label="Spend summary">
        <div>
          <p className="text-xs text-muted-foreground">Total spend</p>
          <p className="font-mono text-2xl font-medium tabular-nums tracking-tight">{cost(dashboard.totalCost)}</p>
        </div>
        <div className="pb-0.5 text-right">
          <p className="font-mono text-sm tabular-nums">{dashboard.sessions.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">sessions with recorded usage</p>
        </div>
      </section>

      <section className="border-t pt-4" aria-labelledby="usage-trend-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="usage-trend-heading" className="font-heading text-sm font-semibold">Recent spend</h3>
          {trend ? <TrendLabel trend={trend} /> : null}
        </div>
        <Trend daily={dashboard.daily} />
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <CostList heading="By model" values={dashboard.models.map((model) => ({ id: model.name, label: model.name, cost: model.cost }))} />
        <CostList
          heading={allProjects ? "By project" : "Selected project"}
          values={dashboard.projects.map((project) => ({ id: project.path, label: project.name, cost: project.cost }))}
        />
      </div>
    </div>
  );
}

function Trend({ daily }: { daily: UsageDashboard["daily"] }) {
  const points = recentDays(daily);
  const chartConfig = { cost: { label: "Spend", color: "var(--foreground)" } } satisfies ChartConfig;

  return (
    <div className="mt-3" role="img" aria-label={points.map((point) => `${point.label}: ${cost(point.cost)}`).join(", ")}>
      <ChartContainer config={chartConfig} className="h-32 w-full aspect-auto">
        <AreaChart accessibilityLayer data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} className="stroke-border/50" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
          <YAxis hide domain={[0, "auto"]} />
          <ChartTooltip cursor={false} content={<UsageTooltip />} />
          <Area
            dataKey="cost"
            type="monotone"
            fill="var(--color-cost)"
            fillOpacity={0.12}
            stroke="var(--color-cost)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--color-cost)" }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

type UsagePoint = ReturnType<typeof recentDays>[number];

function UsageTooltip({ active, payload }: { active?: boolean; payload?: { payload?: UsagePoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="grid min-w-44 gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium">{point.label}</p>
      <div className="grid gap-1.5">
        <TooltipRow label="Spend" value={cost(point.cost)} />
        <TooltipRow label="Sessions" value={point.sessions.toLocaleString()} />
      </div>
      <div className="grid gap-1 border-t border-border/50 pt-2">
        <p className="text-muted-foreground">Models</p>
        {point.models.length ? point.models.slice(0, 4).map((model) => (
          <TooltipRow key={model.name} label={model.name} value={cost(model.cost)} />
        )) : <span className="text-muted-foreground">No billed models</span>}
      </div>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0 truncate text-muted-foreground" title={label}>{label}</span>
      <span className="shrink-0 font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

function CostList({ heading, values }: { heading: string; values: { id: string; label: string; cost: number }[] }) {
  return (
    <section aria-label={heading}>
      <h3 className="font-heading text-sm font-semibold">{heading}</h3>
      <div className="mt-2 flex flex-col gap-1">
        {values.map((value) => (
          <div key={value.id} className="flex items-baseline justify-between gap-4 py-1">
            <span className="min-w-0 truncate text-sm text-muted-foreground" title={value.label}>{value.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums">{cost(value.cost)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendLabel({ trend }: { trend: { amount: number; direction: "up" | "down" | "flat" } }) {
  if (trend.direction === "flat") return <span className="text-xs text-muted-foreground">Same as the prior 7 days</span>;
  const Icon = trend.direction === "up" ? TrendUpIcon : TrendDownIcon;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icon aria-hidden /> {trend.direction === "up" ? "Up" : "Down"} {cost(Math.abs(trend.amount))} from the prior 7 days
    </span>
  );
}

function recentDays(daily: UsageDashboard["daily"]): { date: string; label: string; cost: number; sessions: number; models: { name: string; cost: number }[] }[] {
  const costs = new Map(daily.map((point) => [point.date, point.cost]));
  const details = new Map(daily.map((point) => [point.date, point]));
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (13 - index));
    const key = date.toLocaleDateString("en-CA");
    return {
      date: key,
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      cost: costs.get(key) ?? 0,
      sessions: details.get(key)?.sessions ?? 0,
      models: details.get(key)?.models ?? [],
    };
  });
}

function recentTrend(daily: UsageDashboard["daily"]): { amount: number; direction: "up" | "down" | "flat" } | null {
  const days = recentDays(daily);
  if (days.length === 0) return null;
  const previous = days.slice(0, 7).reduce((total, day) => total + day.cost, 0);
  const current = days.slice(7).reduce((total, day) => total + day.cost, 0);
  const amount = current - previous;
  return { amount, direction: Math.abs(amount) < 0.00005 ? "flat" : amount > 0 ? "up" : "down" };
}

function Loading() {
  return <div className="flex justify-center py-10 text-muted-foreground"><CircleNotchIcon className="animate-spin" /></div>;
}

function cost(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}
