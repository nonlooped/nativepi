import type { ServiceTier } from "../../shared/service-tier.ts";
import { LightningIcon } from "@phosphor-icons/react/Lightning";
import { useEffect } from "react";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { serviceTierDescriptions, serviceTierLabels, serviceTierSchema, serviceTierTarget } from "../../shared/service-tier.ts";
import { Button } from "./ui/button.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";

export default function ServiceTierSelector({ selection }: { selection?: { tier: ServiceTier; tiers: ServiceTier[]; onChange: (tier: ServiceTier) => void; automatic?: { selected: boolean; label: string; onSelect: () => void } } } = {}) {
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
  const storedSelect = useAppStore(s => s.setServiceTier);
  useEffect(() => { if (!selection) void refresh(); }, [project, session, model, refresh, selection]);
  if (!selection && (!project || !model || target !== serviceTierTarget(project, session, model))) return null;
  if (!selection && error) return (
    <section className="min-w-0 flex-1" aria-label="Speed">
      <Button variant="ghost" className="w-full justify-start px-2 text-xs text-destructive" title={error} onClick={() => void refresh()}>Retry service tier</Button>
    </section>
  );
  if (!(selection?.tiers ?? state?.tiers)?.length) return null;
  // A live store may still contain a removed value after an app update.
  const tier = (selection?.tier ?? state?.tier) === "priority" ? "priority" : "default";
  const tiers = selection?.tiers ?? serviceTierSchema.options;
  const select = selection?.onChange ?? storedSelect;
  const items = [...(selection?.automatic ? [{ value: "auto", label: selection.automatic.label }] : []), ...tiers.map(value => ({ value, label: serviceTierLabels[value] }))];
  return (
    <section className="min-w-0 flex-1" aria-label="Speed">
      <Select value={selection?.automatic?.selected ? "auto" : tier} items={items} disabled={!selection && (busy || loading || saving)}
        onValueChange={value => { if (value === "auto") selection?.automatic?.onSelect(); else if ((value === "default" || value === "priority") && (value !== tier || selection?.automatic?.selected)) void select(value); }}>
        <SelectTrigger aria-label="Service tier" title={!selection && busy ? "Service tier can be changed when Pi is idle" : "Change service tier"}
          className="h-8 w-full gap-2 rounded-full border-border/50 bg-foreground/3 px-3 text-xs font-normal shadow-none hover:bg-muted dark:bg-foreground/3 dark:hover:bg-muted">
          <LightningIcon className="size-4 text-muted-foreground" weight={tier === "priority" ? "fill" : "regular"} aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="top" align="start" alignItemWithTrigger={false} className="w-72 max-w-[calc(100vw-2rem)]">
          <SelectGroup>
            {selection?.automatic ? <SelectItem value="auto"><span className="flex flex-col gap-0.5"><span>{selection.automatic.label}</span><span className="text-xs font-normal text-muted-foreground">Priority can increase cost or subscription usage.</span></span></SelectItem> : null}
            {tiers.map(tier => <SelectItem key={tier} value={tier} className="py-2">
              <span className="flex flex-col gap-0.5">
                <span>{serviceTierLabels[tier]}</span>
                <span className="text-xs font-normal text-muted-foreground">{serviceTierDescriptions[tier]}</span>
              </span>
            </SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </section>
  );
}
