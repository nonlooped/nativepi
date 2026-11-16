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

export default function SubscriptionCapacity() {
  const request = useRequest(() => rpc.request.subscriptionCapacity({}), [], { keepPreviousData: true });
  const openSettings = useAppStore(s => s.openSettings);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const supported = request.data?.providers.filter(provider => provider.status !== "unsupported" || provider.windows.length) ?? [];
  const unsupported = request.data?.providers.filter(provider => provider.status === "unsupported" && !provider.windows.length) ?? [];
  return <section aria-label="Subscription capacity" className="min-w-0">
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
      <h2 className="text-sm font-semibold">Subscription capacity</h2>
      <Button variant="ghost" size="icon-sm" disabled={request.loading} onClick={request.reload} aria-label="Refresh capacity" title="Refresh capacity"><ArrowClockwiseIcon className={request.loading ? "animate-spin motion-reduce:animate-none" : undefined} /></Button>
    </div>
    {request.error && <StateNotice title="Could not refresh capacity" detail={request.error} retry={request.reload} />}
    {!request.data && request.loading && <StateNotice title="Loading provider limits…" loading />}
    {request.data?.providers.length === 0 && <div className="flex items-center justify-between gap-3 py-3"><p className="text-[0.8125rem] text-body-muted-foreground">Connect a subscription account to see its limits.</p><Button variant="ghost" size="sm" onClick={() => openSettings("Providers")}>Connect</Button></div>}
    <div>{supported.map(provider => <ProviderCapacity key={provider.provider} provider={provider} now={now} expanded={expanded === provider.provider} onExpand={() => setExpanded(expanded === provider.provider ? null : provider.provider)} />)}</div>
    {unsupported.length > 0 && <details className="py-3 text-xs text-muted-foreground"><summary className="cursor-pointer">{unsupported.length === 1 ? `${unsupported[0]!.name}: quota unavailable` : `Quota unavailable for ${unsupported.length} connections`}</summary><div className="space-y-1 pt-2">{unsupported.map(provider => <p key={provider.provider}>{provider.name} — {provider.message ?? "No subscription quota endpoint."}</p>)}</div></details>}
    {supported.length > 0 && <p className="pt-2 text-xs leading-5 text-muted-foreground">Provider account limits. Local tokens and API-equivalent costs are shown below.</p>}
  </section>;
}

function ProviderCapacity({ provider, now, expanded, onExpand }: { provider: Capacity; now: number; expanded: boolean; onExpand: () => void }) {
  const stale = provider.stale || !!provider.fetchedAt && now - Date.parse(provider.fetchedAt) > 300_000;
  return <div className="border-t border-border/40 py-3 first:border-t-0">
    <button type="button" className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded} onClick={onExpand}>
      <span className="flex size-8 shrink-0 items-center justify-center"><BrandIcon name={providerIconName(provider.provider)} size={19} color /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{provider.name}</span>{provider.plan && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{provider.plan}</span>}</span>
      {stale || provider.status === "error" ? <span className="shrink-0 text-xs text-warning">{stale ? "Stale" : "Unavailable"}</span> : null}
      <CaretDownIcon className={cn("shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
    </button>
    <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-2 pt-3 @min-[36rem]/settings-content:grid-cols-2">
      {provider.windows.map((window, index) => <div key={`${window.label}-${index}`} className="min-w-0">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs"><span className="min-w-0 truncate text-body-muted-foreground" title={window.label}>{window.label.replace(/^Usage · /, "").replace(/^168 hours$/, "Weekly").replace(/^5 hours$/, "5-hour limit")}</span><span className="shrink-0 tabular-nums">{(100 - window.usedPercent).toFixed(0)}% left</span></div>
        <div role="progressbar" aria-label={`${provider.name} ${window.label} remaining`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={100 - window.usedPercent} aria-valuetext={`${window.usedPercent.toFixed(0)}% used · ${(100 - window.usedPercent).toFixed(0)}% remaining`} className="h-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", window.usedPercent >= 90 ? "bg-warning" : "bg-primary/60")} style={{ width: `${100 - window.usedPercent}%` }} /></div>
        {window.resetAt && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Resets {new Date(window.resetAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
      </div>)}
    </div>
    {provider.status === "error" && <p role="alert" className="px-2 pt-2 text-xs leading-5 text-body-muted-foreground">{provider.message}</p>}
    {expanded && <div className="space-y-1 px-2 pt-3 text-xs leading-5 text-body-muted-foreground">
      {provider.fetchedAt && <p>{stale ? "Stale · " : ""}Updated {new Date(provider.fetchedAt).toLocaleString()}</p>}
      {provider.details?.map(detail => <p key={detail}>{detail}</p>)}
      {provider.status !== "error" && provider.message && <p>{provider.message}</p>}
      {provider.windows.map((window, index) => <p key={index} className="[overflow-wrap:anywhere]">{window.label}: {window.usedPercent.toFixed(0)}% used · {(100 - window.usedPercent).toFixed(0)}% remaining</p>)}
      <p>Refreshes at most once a minute. Provider retry delays may take longer.</p>
    </div>}
  </div>;
}
