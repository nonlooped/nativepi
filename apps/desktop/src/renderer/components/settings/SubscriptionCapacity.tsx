import { useEffect, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import type { SubscriptionCapacity as Capacity } from "../../../shared/subscription-capacity.ts";
import { rpc } from "../../lib/rpc.ts";
import { useRequest } from "../../lib/useRequest.ts";
import { useAppStore } from "../../lib/store.ts";
import { providerIconName } from "../../lib/providerIcons.ts";
import { Button } from "@/components/ui/button.tsx";
import BrandIcon from "../BrandIcon.tsx";
import StateNotice from "../StateNotice.tsx";
import { cn } from "@/lib/utils.ts";

export default function SubscriptionCapacity({ onManage, dialog }: { onManage?: () => void; dialog?: boolean }) {
  const request = useRequest(() => rpc.request.subscriptionCapacity({}), [], { keepPreviousData: true });
  const openSettings = useAppStore(s => s.openSettings);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const providers = request.data?.providers.filter(provider => provider.status === "ready" && provider.windows.length > 0) ?? [];
  return <section aria-label="Subscription limits" className="min-w-0">
    <header className={cn("flex items-center justify-between gap-3 border-b border-border/50 pb-2", dialog && "pr-8")}>
      <h2 className="text-sm font-semibold">Subscription usage</h2>
      <Button variant="ghost" size="icon-sm" disabled={request.loading} onClick={request.reload} aria-label="Refresh capacity" title="Refresh usage"><ArrowClockwiseIcon className={request.loading ? "animate-spin motion-reduce:animate-none" : undefined} /></Button>
    </header>
    {request.error && <StateNotice title="Could not refresh capacity" detail={request.error} retry={request.reload} />}
    {!request.data && request.loading && <StateNotice title="Loading provider limits…" loading />}
    {providers.map(provider => <ProviderCapacity key={provider.provider} provider={provider} now={now} expanded={expanded === provider.provider} onExpand={() => setExpanded(expanded === provider.provider ? null : provider.provider)} />)}
    {request.data && !request.error && providers.length === 0 && <div className="space-y-3 pt-4">
      <p className="text-sm text-muted-foreground">No subscription usage to show.</p>
      <Button variant="outline" size="sm" onClick={() => { onManage?.(); openSettings("Providers"); }}>Manage accounts</Button>
    </div>}
  </section>;
}

function ProviderCapacity({ provider, now, expanded, onExpand }: { provider: Capacity; now: number; expanded: boolean; onExpand: () => void }) {
  const stale = provider.stale || !!provider.fetchedAt && now - Date.parse(provider.fetchedAt) > 300_000;
  return <div className="border-t border-border/40 pt-3 pb-2 last:pb-0 [&:nth-child(2)]:border-t-0">
    <button type="button" className="flex w-full items-center gap-2 rounded-md py-1 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded} onClick={onExpand}>
      <span className="flex size-5 shrink-0 items-center justify-center"><BrandIcon name={providerIconName(provider.provider)} size={19} color /></span>
      <span className="min-w-0 flex-1"><span className="truncate text-sm font-semibold">{provider.name}</span>{provider.plan && <span className="ml-2 text-xs text-muted-foreground"> {provider.plan}</span>}</span>
      {stale ? <span className="shrink-0 text-xs text-warning">Stale</span> : null}
      <CaretDownIcon className={cn("shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
    </button>
    <div className="grid gap-4 pt-3">
      {provider.windows.map((window, index) => <div key={`${window.label}-${index}`} className="min-w-0">
        <p className="break-words text-xs text-muted-foreground">{window.label.replace(/^Usage · /, "").replace(/^168 hours$|^Weekly$/, "Weekly allowance").replace(/^5 hours$/, "5-hour allowance")}</p>
        <div className="my-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm text-muted-foreground"><strong className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{(100 - window.usedPercent).toFixed(0)}%</strong> left</span>
          {window.resetAt && <ResetTime resetAt={window.resetAt} now={now} />}
        </div>
        <div role="progressbar" aria-label={`${provider.name} ${window.label} remaining`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={100 - window.usedPercent} aria-valuetext={`${window.usedPercent.toFixed(0)}% used · ${(100 - window.usedPercent).toFixed(0)}% remaining`} className="h-1.5 overflow-hidden rounded-full bg-foreground/15"><div className={cn("h-full rounded-full", window.usedPercent >= 90 ? "bg-warning" : "bg-primary")} style={{ width: `${100 - window.usedPercent}%` }} /></div>
      </div>)}
    </div>
    {expanded && <div className="space-y-1 px-2 pt-3 text-xs leading-5 text-body-muted-foreground">
      {provider.fetchedAt && <p>{stale ? "Stale · " : ""}Updated {new Date(provider.fetchedAt).toLocaleString()}</p>}
      {provider.details?.map(detail => <p key={detail}>{detail}</p>)}
      {provider.message && <p>{provider.message}</p>}
    </div>}
  </div>;
}

function ResetTime({ resetAt, now }: { resetAt: string; now: number }) {
  const reset = new Date(resetAt);
  const today = new Date(now);
  const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = (calendarDay(reset) - calendarDay(today)) / 86_400_000;
  const clock = reset.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const exact = reset.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const label = reset.getTime() <= now ? "Reset due" : days === 0 ? `Resets at ${clock}` : days === 1 ? "Resets tomorrow" : `Resets in ${days} days`;
  return <time dateTime={resetAt} tabIndex={0} title={exact} className="group/reset rounded-sm text-xs text-muted-foreground focus-visible:outline-ring">
    <span className="group-focus/reset:hidden">{label}</span><span className="hidden group-focus/reset:inline">{exact}</span>
  </time>;
}
