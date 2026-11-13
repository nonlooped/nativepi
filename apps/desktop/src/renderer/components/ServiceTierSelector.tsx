import { useEffect } from "react";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { serviceTierDescriptions, serviceTierLabels, serviceTierSchema, serviceTierTarget } from "../../shared/service-tier.ts";
import { Button } from "./ui/button.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";

export default function ServiceTierSelector() {
  const project = useAppStore(s => s.activeProjectPath);
  const session = useAppStore(s => s.activeSessionFile);
  const model = useAppStore(s => s.model);
  const state = useAppStore(s => s.serviceTier);
  const target = useAppStore(s => s.serviceTierTarget);
  const loading = useAppStore(s => s.serviceTierLoading);
  const saving = useAppStore(s => s.serviceTierSaving);
  const error = useAppStore(s => s.serviceTierError);
  const busy = useAppStore(s => { const chat = activeConversation(s); return chat.running || chat.compacting || Boolean(chat.externalChange); });
  const refresh = useAppStore(s => s.refreshServiceTier);
  const select = useAppStore(s => s.setServiceTier);
  useEffect(() => { void refresh(); }, [project, session, model, refresh]);
  if (!project || !model || target !== serviceTierTarget(project, session, model)) return null;
  if (error) return <Button variant="ghost" className="px-2 text-destructive" title={error} onClick={() => void refresh()}>Retry service tier</Button>;
  if (!state?.tiers.length) return null;
  // A live store may still contain a removed value after an app update.
  const tier = state.tier === "priority" ? "priority" : "default";
  const tiers = serviceTierSchema.options;
  const items = tiers.map(value => ({ value, label: serviceTierLabels[value] }));
  return (
    <Select value={tier} items={items} disabled={busy || loading || saving}
      onValueChange={value => { if ((value === "default" || value === "priority") && value !== tier) void select(value); }}>
      <SelectTrigger aria-label="Service tier" title={busy ? "Service tier can be changed when Pi is idle" : "Change service tier"}
        className="h-8 w-auto gap-1.5 border-0 bg-transparent px-2 text-sm font-normal shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted">
        <span className="text-muted-foreground">Speed</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent side="top" align="start" alignItemWithTrigger={false} className="w-72 max-w-[calc(100vw-2rem)]">
        <SelectGroup>
          {tiers.map(tier => <SelectItem key={tier} value={tier} className="py-2">
            <span className="flex flex-col gap-0.5">
              <span>{serviceTierLabels[tier]}</span>
              <span className="text-xs font-normal text-muted-foreground">{serviceTierDescriptions[tier]}</span>
            </span>
          </SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
