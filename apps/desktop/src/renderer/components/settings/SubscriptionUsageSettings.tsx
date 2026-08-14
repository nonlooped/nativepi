import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { ChartDonutIcon } from "@phosphor-icons/react/ChartDonut";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { z } from "zod";
import { Button } from "@/components/ui/button.tsx";
import { useAppStore } from "../../lib/store.ts";
import { rpc } from "../../lib/rpc.ts";
import { useRequest } from "../../lib/useRequest.ts";
import { providerIconName } from "../../lib/providerIcons.ts";
import BrandIcon from "../BrandIcon.tsx";

const subscriptionUsageLimitSchema = z.object({
  label: z.string(),
  usedPercent: z.number().finite(),
  resetAt: z.string().optional(),
  windowSeconds: z.number().finite().positive().optional(),
});

const subscriptionUsageSchema = z.object({
  provider: z.string(),
  limits: z.array(subscriptionUsageLimitSchema),
});

const subscriptionUsageResultSchema = z.object({
  usages: z.array(subscriptionUsageSchema).optional(),
});

type SubscriptionUsageLimit = z.infer<typeof subscriptionUsageLimitSchema>;
type SubscriptionUsage = z.infer<typeof subscriptionUsageSchema>;

function providerLabel(provider: string) {
  return provider === "github-copilot"
    ? "GitHub Copilot"
    : provider === "openai-codex"
      ? "OpenAI Codex"
      : provider === "kimi-coding"
        ? "Kimi Code"
        : provider === "anthropic"
          ? "Anthropic"
          : provider.charAt(0).toUpperCase() + provider.slice(1);
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function toneColor(usedPercent: number) {
  return usedPercent >= 90
    ? "var(--destructive)"
    : usedPercent >= 75
      ? "var(--warning)"
      : "var(--foreground)";
}

function countdown(resetAt?: string) {
  if (!resetAt) return undefined;
  const remaining = Date.parse(resetAt) - Date.now();
  if (Number.isNaN(remaining)) return undefined;
  if (remaining <= 0) return "Resets now";
  const minutes = Math.round(remaining / 60_000);
  if (minutes < 60) return `Resets in ${pluralize(minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Resets in ${pluralize(hours, "hour")}`;
  return `Resets in ${pluralize(Math.round(hours / 24), "day")}`;
}

function resetTitle(resetAt?: string) {
  if (!resetAt) return undefined;
  const date = new Date(resetAt);
  return Number.isNaN(date.valueOf()) ? resetAt : date.toLocaleString();
}

function pace(limit: SubscriptionUsageLimit) {
  if (!limit.resetAt || !limit.windowSeconds) return undefined;
  const reset = Date.parse(limit.resetAt);
  if (Number.isNaN(reset)) return undefined;
  const windowMs = limit.windowSeconds * 1000;
  const elapsed = ((Date.now() - (reset - windowMs)) / windowMs) * 100;
  if (elapsed <= 0 || elapsed >= 100) return undefined;
  const drift = limit.usedPercent - elapsed;
  return {
    elapsed,
    label: drift > 12 ? "At risk" : drift < -12 ? "Ahead of pace" : "On track",
    color:
      drift > 12 ? "var(--destructive)" : drift < -12 ? "var(--success)" : "var(--muted-foreground)",
  };
}

export default function SubscriptionUsageSettings() {
  const addProject = useAppStore((s) => s.addProject);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const projects = useAppStore((s) => s.projects);
  const projectDir = activeProjectPath ?? projects[0]?.path ?? null;

  const request = useRequest(
    async () => {
      if (!projectDir) return { usages: [] as SubscriptionUsage[] };
      const { result, error } = await rpc.request.callExtension({
        projectDir,
        sessionFile: activeSessionFile ?? null,
        extension: "@nativepi/subscription-usage",
        method: "usages",
      });
      if (error) throw new Error(error);
      const parsed = subscriptionUsageResultSchema.safeParse(result);
      if (!parsed.success) throw new Error("The subscription provider returned invalid usage data.");
      const usages = (parsed.data.usages ?? []).map((usage) => ({
        ...usage,
        limits: usage.limits.toSorted((a, b) => b.usedPercent - a.usedPercent),
      }));
      usages.sort((a, b) => {
        const aMax = a.limits.reduce((m, l) => Math.max(m, l.usedPercent), 0);
        const bMax = b.limits.reduce((m, l) => Math.max(m, l.usedPercent), 0);
        return bMax - aMax;
      });
      return { usages };
    },
    [projectDir, activeSessionFile],
  );

  const usages = request.data?.usages ?? [];
  const error = request.data ? null : request.error;

  if (!projectDir) {
    return (
      <div className="flex flex-col gap-6">
        <RefreshButton onRefresh={request.reload} loading={request.loading} />
        <EmptyState
          icon={<PlugsConnectedIcon size={20} />}
          title="Open a project to view subscription usage"
          description="Subscription limits are read through the active Pi session."
          action={
            <Button variant="outline" onClick={() => void addProject()}>
              <FolderOpenIcon data-icon="inline-start" />
              Open project
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RefreshButton onRefresh={request.reload} loading={request.loading} />

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Unable to load subscription usage. {error}
        </div>
      ) : null}

      {request.loading ? (
        <div
          className="flex min-h-60 items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-16 text-sm text-muted-foreground"
          role="status"
        >
          <CircleNotchIcon className="animate-spin" />
          Reading subscription limits…
        </div>
      ) : usages.length === 0 ? (
        <EmptyState
          title="No subscription limits to show"
          description="Connect a supported provider — Anthropic, OpenAI Codex, Kimi Code, or GitHub Copilot — with a subscription account in Providers. Limits appear here once Pi can read them."
        />
      ) : (
        <div className="border-b border-border/70">
          {usages.map((usage) => (
            <ProviderCard key={usage.provider} usage={usage} />
          ))}
        </div>
      )}

      <p className="max-w-3xl text-xs leading-5 text-body-muted-foreground">
        Subscription limits are reported by each provider and read by Pi using your stored OAuth session. They are not invoices and may lag behind actual use.
      </p>
    </div>
  );
}

function RefreshButton({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRefresh}
      disabled={loading}
      className="self-end"
    >
      <ArrowClockwiseIcon className={loading ? "animate-spin" : undefined} data-icon="inline-start" />
      Refresh limits
    </Button>
  );
}

function ProviderCard({ usage }: { usage: SubscriptionUsage }) {
  const sorted = [...usage.limits].sort((a, b) => b.usedPercent - a.usedPercent);
  const mostConstrained = sorted[0];
  const remaining = mostConstrained ? Math.max(0, 100 - mostConstrained.usedPercent) : undefined;

  return (
    <section className="grid gap-6 border-t border-border/70 py-7 lg:grid-cols-[minmax(12rem,0.55fr)_minmax(20rem,1.45fr)] lg:gap-10">
      <div className="flex items-start justify-between gap-4 lg:flex-col lg:justify-start">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
            <BrandIcon name={providerIconName(usage.provider)} size={21} color />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-none">{providerLabel(usage.provider)}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {sorted.length === 0
                ? "No limits reported"
                : `${sorted.length} ${sorted.length === 1 ? "limit" : "limits"}`}
            </p>
          </div>
        </div>
        {remaining !== undefined ? (
          <div className="text-right lg:text-left">
            <p
              className="font-mono text-lg font-medium leading-none tabular-nums"
              style={{ color: toneColor(mostConstrained!.usedPercent) }}
            >
              {Math.round(remaining)}% left
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Most constrained limit</p>
          </div>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm leading-5 text-muted-foreground">
          This provider did not report any subscription limits. It may not have any, or the account has not used a quota yet.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {sorted.map((limit) => {
            const left = Math.max(0, 100 - limit.usedPercent);
            const reset = countdown(limit.resetAt);
            const pacing = pace(limit);
            return (
              <div key={`${limit.label}-${limit.resetAt ?? ""}`} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium" title={limit.label}>
                    {limit.label}
                  </p>
                  <p className="shrink-0 font-mono text-xs tabular-nums" style={{ color: toneColor(limit.usedPercent) }}>
                    {Math.round(left)}% left
                  </p>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    className="h-full origin-left rounded-full transition-transform duration-300 ease-out"
                    style={{ transform: `scaleX(${Math.min(100, Math.max(0, limit.usedPercent)) / 100})`, background: toneColor(limit.usedPercent) }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground" title={resetTitle(limit.resetAt)}>
                    {reset ?? "No reset time reported"}
                  </span>
                  {pacing ? (
                    <>
                      <span className="text-muted-foreground/40" aria-hidden>
                        ·
                      </span>
                      <span style={{ color: pacing.color }} className="font-medium">
                        {pacing.label}
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round(limit.usedPercent)}% used · {Math.round(pacing.elapsed)}% of window elapsed
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <ChartDonutIcon size={18} />}
      </span>
      <h2 className="mt-3 font-heading text-sm font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-body-muted-foreground">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
