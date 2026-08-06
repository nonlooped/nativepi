import { useEffect, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { ChartDonutIcon } from "@phosphor-icons/react/ChartDonut";
import { defineRenderer } from "@nativepi/extension-api";
import type { NativePiContext } from "@nativepi/extension-api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nativepi/extension-api/ui";
import {
  isUsageReading,
  type SubscriptionUsage,
  type SubscriptionUsageLimit,
  type UsageReading,
} from "../types.ts";

const MUTED = "var(--muted-foreground)";

function providerLabel(provider: string) {
  return provider === "github-copilot"
    ? "GitHub Copilot"
    : provider === "openai-codex"
      ? "OpenAI"
      : provider === "kimi-coding"
        ? "Kimi Code"
        : "Anthropic";
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function elapsedPercent(limit: SubscriptionUsageLimit) {
  if (!limit.resetAt || !limit.windowSeconds) return undefined;
  const reset = Date.parse(limit.resetAt);
  if (Number.isNaN(reset)) return undefined;
  const elapsed =
    ((Date.now() - (reset - limit.windowSeconds * 1000)) /
      (limit.windowSeconds * 1000)) *
    100;
  return elapsed > 0 && elapsed < 100 ? elapsed : undefined;
}

function tone(usedPercent: number) {
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
  const elapsed = elapsedPercent(limit);
  if (elapsed === undefined) return undefined;
  const drift = limit.usedPercent - elapsed;
  return {
    elapsed,
    label: drift > 12 ? "At risk" : drift < -12 ? "Ahead of pace" : "On track",
    color:
      drift > 12
        ? "var(--destructive)"
        : drift < -12
          ? "var(--success)"
          : "var(--foreground)",
  };
}

type Reading = {
  loading: boolean;
  reading?: UsageReading;
  error?: string;
};

function useUsage(ctx: NativePiContext) {
  const { call, on } = ctx;
  const [state, setState] = useState<Reading>({ loading: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setState((previous) => ({
        ...previous,
        loading: true,
        error: undefined,
      }));
      void call("usage")
        .then((result) => {
          if (!isUsageReading(result))
            throw new Error("Extension returned an invalid usage reading.");
          if (!cancelled) setState({ loading: false, reading: result });
        })
        .catch((error: unknown) => {
          if (!cancelled)
            setState({
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            });
        });
    };
    load();
    const off = on("changed", load);
    return () => {
      cancelled = true;
      off();
    };
  }, [call, nonce, on]);

  return { ...state, reload: () => setNonce((value) => value + 1) };
}

function UsageControl({ ctx }: { ctx: NativePiContext }) {
  const { loading, reading, error, reload } = useUsage(ctx);
  const [open, setOpen] = useState(false);

  if (reading?.supported === false) return null;

  const limits = reading?.usage?.limits ?? [];
  const used = limits.reduce(
    (highest, limit) => Math.max(highest, limit.usedPercent),
    0,
  );
  const remaining = Math.max(0, 100 - used);
  const known = !loading && !error && limits.length > 0;
  const tight = known && used >= 75;
  const provider = reading?.usage
    ? providerLabel(reading.usage.provider)
    : "This provider";
  const color = !known
    ? "color-mix(in oklch, var(--muted-foreground) 50%, transparent)"
    : used >= 90
      ? "var(--destructive)"
      : used >= 75
        ? "var(--warning)"
        : MUTED;
  const label = loading
    ? `Reading ${provider} subscription usage`
    : error
      ? `${provider} subscription usage is unavailable`
      : limits.length > 0
        ? `${provider} subscription usage: ${Math.round(remaining)}% left in the limit closest to exhaustion`
        : `${provider} did not report subscription usage`;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Button
        variant="ghost"
        size={tight ? "lg" : "icon-lg"}
        aria-label={label}
        title={known ? "Subscription usage" : label}
        onClick={() => {
          setOpen(true);
          reload();
        }}
        style={{ color }}
      >
        <UsageRing remaining={remaining} known={known} />
        {tight ? (
          <span
            style={{ fontVariantNumeric: "tabular-nums" }}
            aria-hidden="true"
          >
            {Math.round(remaining)}% left
          </span>
        ) : null}
      </Button>
      <UsageDialog
        open={open}
        onOpenChange={setOpen}
        providerName={provider}
        usage={reading?.usage}
        loading={loading}
        error={error}
        refresh={reload}
      />
    </div>
  );
}

function UsageRing({
  remaining,
  known,
}: {
  remaining: number;
  known: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      style={{ flexShrink: 0, transform: "rotate(-90deg)" }}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="3"
      />
      {known ? (
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${remaining} 100`}
        />
      ) : null}
    </svg>
  );
}

function UsageDialog({
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
  error?: string;
  refresh: () => void;
}) {
  const limits = [...(usage?.limits ?? [])].sort(
    (a, b) => b.usedPercent - a.usedPercent,
  );
  const [mostConstrained, ...otherLimits] = limits;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          <DialogHeader>
            <DialogTitle>Subscription usage</DialogTitle>
            <DialogDescription>
              {providerName} limits for this account.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p style={{ fontSize: "0.875rem", color: MUTED }}>
              Updating subscription usage…
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              style={{
                fontSize: "0.875rem",
                lineHeight: 1.5,
                color: "var(--destructive)",
              }}
            >
              Unable to read subscription usage. {error}
            </p>
          ) : null}
          {!loading && !error && limits.length === 0 ? (
            <EmptyUsage providerName={providerName} />
          ) : null}
          {mostConstrained ? (
            <UsageLimit limit={mostConstrained} featured />
          ) : null}
          {otherLimits.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                borderTop: "1px solid var(--border)",
                paddingTop: "1rem",
              }}
            >
              {otherLimits.map((limit) => (
                <UsageLimit
                  key={`${limit.label}-${limit.resetAt ?? ""}`}
                  limit={limit}
                />
              ))}
            </div>
          ) : null}

          <DialogFooter
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "0.75rem",
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
            >
              <ArrowClockwiseIcon data-icon="inline-start" />
              Refresh
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyUsage({ providerName }: { providerName: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.625rem",
        color: MUTED,
      }}
    >
      <ChartDonutIcon style={{ marginTop: "0.125rem", flexShrink: 0 }} />
      <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5 }}>
        {providerName} did not report any subscription limits. Refresh to check
        again.
      </p>
    </div>
  );
}

function UsageLimit({
  limit,
  featured = false,
}: {
  limit: SubscriptionUsageLimit;
  featured?: boolean;
}) {
  const remaining = Math.max(0, 100 - limit.usedPercent);
  const reset = countdown(limit.resetAt);
  const pacing = pace(limit);

  return (
    <section aria-label={limit.label}>
      <div
        style={{
          display: "flex",
          alignItems: featured ? "center" : "baseline",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.875rem",
              fontWeight: featured ? 600 : 500,
            }}
            title={limit.label}
          >
            {limit.label}
          </p>
          <p
            style={{
              margin: "0.125rem 0 0",
              fontSize: "0.75rem",
              color: MUTED,
            }}
            title={resetTitle(limit.resetAt)}
          >
            {reset ?? "No reset time reported"}
          </p>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: featured ? "1.5rem" : "0.875rem",
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.025em",
            }}
          >
            {Math.round(remaining)}%
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: MUTED }}>left</p>
        </div>
      </div>
      <UsageBar used={limit.usedPercent} />
      {pacing ? (
        <p
          style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", lineHeight: 1.5 }}
        >
          <span style={{ fontWeight: 500, color: pacing.color }}>
            {pacing.label}
          </span>
          <span style={{ color: MUTED }}>
            {" "}
            · {Math.round(limit.usedPercent)}% used with{" "}
            {Math.round(pacing.elapsed)}% of this window elapsed
          </span>
        </p>
      ) : null}
    </section>
  );
}

function UsageBar({ used }: { used: number }) {
  return (
    <div
      style={{
        position: "relative",
        marginTop: "0.625rem",
        height: "0.375rem",
        overflow: "hidden",
        borderRadius: "9999px",
        background: "var(--muted)",
      }}
      aria-hidden="true"
    >
      <div
        style={{
          height: "100%",
          width: `${used}%`,
          borderRadius: "inherit",
          background: tone(used),
        }}
      />
    </div>
  );
}

export default defineRenderer({
  composerControls: [
    {
      key: "subscription-usage",
      render: (ctx) => <UsageControl ctx={ctx} />,
    },
  ],
});
