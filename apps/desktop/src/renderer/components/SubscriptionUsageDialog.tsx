import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import type { SubscriptionUsage } from "../../shared/subscriptionUsage.ts";
import { pluralize } from "../lib/format.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

type Limit = SubscriptionUsage["limits"][number];

/** How far the window has run, so usage can be read against the clock rather than alone. */
function elapsedPercent(limit: Limit): number | undefined {
  if (!limit.resetAt || !limit.windowSeconds) return undefined;
  const reset = Date.parse(limit.resetAt);
  if (Number.isNaN(reset)) return undefined;
  const window = limit.windowSeconds * 1000;
  const elapsed = ((Date.now() - (reset - window)) / window) * 100;
  return elapsed > 0 && elapsed < 100 ? elapsed : undefined;
}

function tone(usedPercent: number): string {
  return usedPercent >= 90 ? "text-destructive" : usedPercent >= 75 ? "text-warning" : "text-foreground";
}

function countdown(resetAt?: string): string | undefined {
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

function resetTitle(resetAt?: string): string | undefined {
  if (!resetAt) return undefined;
  const date = new Date(resetAt);
  return Number.isNaN(date.valueOf()) ? resetAt : date.toLocaleString();
}

function verdict(usedPercent: number, elapsed: number): "Ahead of pace" | "On track" | "At risk" {
  const drift = usedPercent - elapsed;
  if (drift > 12) return "At risk";
  if (drift < -12) return "Ahead of pace";
  return "On track";
}

function paceTone(usedPercent: number, elapsed: number): string {
  const pace = verdict(usedPercent, elapsed);
  return pace === "At risk" ? "text-destructive" : pace === "Ahead of pace" ? "text-success" : "text-foreground";
}

export default function SubscriptionUsageDialog({
  open,
  onOpenChange,
  providerName,
  usage,
  loading,
  error,
  refresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  usage?: SubscriptionUsage;
  loading: boolean;
  error: string | null | undefined;
  refresh: () => void;
}) {
  const limits = [...(usage?.limits ?? [])].sort((a, b) => b.usedPercent - a.usedPercent);
  const [leading, ...rest] = limits;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Subscription usage</DialogTitle>
          <DialogDescription className="text-sm text-body-muted-foreground">
            {providerName} plan limits reported for this account.
          </DialogDescription>
        </DialogHeader>

        {loading ? <p className="text-sm text-body-muted-foreground">Reading subscription usage…</p> : null}
        {error ? <p className="text-sm text-destructive">Could not read subscription usage: {error}</p> : null}
        {!loading && !error && limits.length === 0 ? (
          <p className="text-sm text-body-muted-foreground">This account did not report any subscription limits.</p>
        ) : null}

        {leading ? <Headline limit={leading} /> : null}

        {rest.length > 0 ? (
          <div className="flex flex-col gap-4 border-t pt-4">
            {rest.map((limit) => (
              <LimitRow key={`${limit.label}-${limit.resetAt ?? ""}`} limit={limit} />
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t pt-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            The composer ring tracks the limit closest to its cap.
          </p>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <ArrowClockwiseIcon data-icon="inline-start" className={loading ? "animate-spin" : undefined} />
            Refresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Headline({ limit }: { limit: Limit }) {
  const elapsed = elapsedPercent(limit);
  const reset = countdown(limit.resetAt);

  return (
    <section className="flex items-center gap-5" aria-label={limit.label}>
      <Dial usedPercent={limit.usedPercent} elapsedPercent={elapsed} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-sm font-semibold">{limit.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground" title={resetTitle(limit.resetAt)}>
          {reset ?? "No reset time reported"}
        </p>
        {elapsed === undefined ? null : (
          <p className="mt-2.5 text-xs">
            <span className={cn("font-medium", paceTone(limit.usedPercent, elapsed))}>{verdict(limit.usedPercent, elapsed)}</span>
            <span className="text-muted-foreground">
              {" "}
              · {Math.round(limit.usedPercent)}% spent, {Math.round(elapsed)}% of the window gone
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

/** Remaining share as an arc, with the elapsed share notched into it as the pace reference. */
function Dial({ usedPercent, elapsedPercent: elapsed }: { usedPercent: number; elapsedPercent?: number }) {
  const remainingPercent = 100 - usedPercent;
  const angle = ((elapsed ?? 0) * 3.6 - 90) * (Math.PI / 180);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];

  return (
    <div className="relative size-32 shrink-0">
      <svg viewBox="0 0 100 100" className={cn("size-full", tone(usedPercent))} role="img" aria-label={`${Math.round(remainingPercent)}% left`}>
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${remainingPercent} 100`}
          transform="rotate(-90 50 50)"
        />
        {elapsed === undefined ? null : (
          <line
            x1={50 + cos * 35.5}
            y1={50 + sin * 35.5}
            x2={50 + cos * 48.5}
            y2={50 + sin * 48.5}
            strokeWidth="2.5"
            className="stroke-popover"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl font-medium tabular-nums tracking-tight">
          {Math.round(remainingPercent)}%
        </span>
        <span className="text-xs tracking-wide text-muted-foreground">left</span>
      </div>
    </div>
  );
}

function LimitRow({ limit }: { limit: Limit }) {
  const elapsed = elapsedPercent(limit);
  const fill = limit.usedPercent >= 90 ? "bg-destructive" : limit.usedPercent >= 75 ? "bg-warning" : "bg-foreground";

  return (
    <section aria-label={limit.label}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 truncate text-sm font-medium">{limit.label}</p>
        <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {Math.round(100 - limit.usedPercent)}% left
        </p>
      </div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${limit.usedPercent}%` }} />
        {elapsed === undefined ? null : (
          <div className="absolute inset-y-0 w-0.5 bg-popover" style={{ left: `${elapsed}%` }} />
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground" title={resetTitle(limit.resetAt)}>
        {countdown(limit.resetAt) ?? "No reset time reported"}
        {elapsed === undefined ? "" : ` · ${verdict(limit.usedPercent, elapsed)} · ${Math.round(elapsed)}% of the window gone`}
      </p>
    </section>
  );
}
