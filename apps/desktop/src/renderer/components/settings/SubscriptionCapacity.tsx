import { useEffect, useState } from "react";
import { rpc } from "../../lib/rpc.ts";
import { useRequest } from "../../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { SettingsSection } from "./rows.tsx";

export default function SubscriptionCapacity() {
  const request = useRequest(() => rpc.request.subscriptionCapacity({}), [], { keepPreviousData: true });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  return <SettingsSection heading="Subscription capacity">
    <div className="flex items-start justify-between gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">Account limits reported by your provider. These are separate from local tokens and API-equivalent costs below. Refreshes are limited to once a minute.</p>
      <Button variant="outline" size="sm" disabled={request.loading} onClick={request.reload}>{request.loading ? "Refreshing…" : "Refresh capacity"}</Button>
    </div>
    {request.error && <p role="alert" className="text-sm text-destructive">Unable to load capacity. {request.error}</p>}
    {!request.data && request.loading && <p role="status" className="text-sm text-muted-foreground">Loading provider limits…</p>}
    {request.data?.providers.length === 0 && <p className="text-sm text-muted-foreground">Connect a provider in Settings → Providers to check its capacity.</p>}
    {request.data?.providers.map(provider => {
      const stale = provider.stale || !!provider.fetchedAt && now - Date.parse(provider.fetchedAt) > 300_000;
      return <div key={provider.provider} className="flex flex-col gap-3 border-b border-border/40 py-4 last:border-0">
        <div className="flex flex-wrap items-baseline gap-2"><h3 className="text-sm font-medium">{provider.name}</h3>{provider.plan && <span className="text-xs text-muted-foreground">{provider.plan}</span>}<span className="ml-auto text-xs text-muted-foreground">{stale ? "Stale · " : ""}{provider.fetchedAt ? `Updated ${new Date(provider.fetchedAt).toLocaleTimeString()}` : provider.status === "unsupported" ? "Unsupported" : "Unavailable"}</span></div>
        {provider.details?.map(detail => <p key={detail} className="text-xs text-muted-foreground">{detail}</p>)}
        {provider.message && <p role={provider.status === "error" ? "alert" : undefined} className="text-sm text-muted-foreground">{provider.message}</p>}
        {provider.windows.map((window, index) => <div key={`${window.label}-${index}`} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-xs"><span>{window.label}</span><span>{window.usedPercent.toFixed(0)}% used · {(100 - window.usedPercent).toFixed(0)}% remaining</span></div>
          <meter className="h-2 w-full accent-primary" min={0} max={100} value={window.usedPercent} aria-label={`${provider.name} ${window.label} used`} />
          {window.resetAt && <p className="text-xs text-muted-foreground">Resets {new Date(window.resetAt).toLocaleString()}</p>}
        </div>)}
      </div>;
    })}
  </SettingsSection>;
}
