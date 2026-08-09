import { useEffect, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext } from "@nativepi/extension-api";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuTrigger,
} from "@nativepi/extension-api/ui";
import { serviceTierProtocol, type ServiceTier, type TierState } from "../types.ts";

const CHOICES: { tier: ServiceTier; label: string; description: string }[] = [
  {
    tier: "standard",
    label: "Standard",
    description: "Balanced response speed and usage",
  },
  {
    tier: "fast",
    label: "Fast",
    description: "Prioritizes speed and uses more subscription usage",
  },
];

function ServiceTierControl({ context }: { context: RendererContext<typeof serviceTierProtocol> }) {
  const { call, on } = context.channel;
  const [state, setState] = useState<TierState | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<ServiceTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (value: TierState) => {
      if (!cancelled) setState(value);
    };
    void call("state")
      .then(apply)
      .catch(() => {});
    return on("changed", apply);
  }, [call, on]);

  if (!state?.supported) return null;

  const selected = CHOICES.find((choice) => choice.tier === state.tier) ?? CHOICES[0];

  const choose = (tier: ServiceTier) => {
    if (tier === state.tier || saving) return;
    setSaving(tier);
    setError(null);
    void call("set", { tier })
      .then((value) => {
        setState(value);
        setOpen(false);
      })
      .catch(() => {
        setError("Unable to change response speed. Try again.");
        setOpen(true);
      })
      .finally(() => setSaving(null));
  };

  return (
    <Menu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <MenuTrigger
        aria-label={`Response speed: ${selected.label}`}
        title={`Response speed: ${selected.label}`}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{selected.label}</span>
        <CaretDownIcon className="shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuContent side="top" className="w-64 p-1.5">
        <MenuGroup>
          <MenuLabel>Response speed</MenuLabel>
          {CHOICES.map((choice) => {
            const active = state.tier === choice.tier;
            const pending = saving === choice.tier;
            return (
              <MenuItem
                key={choice.tier}
                disabled={saving !== null}
                onClick={() => choose(choice.tier)}
                className="items-start gap-2 rounded-md"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{choice.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {pending ? "Updating response speed…" : choice.description}
                  </span>
                </div>
                {active ? <CheckIcon className="mt-0.5 shrink-0 text-success" /> : null}
              </MenuItem>
            );
          })}
        </MenuGroup>
        {error ? (
          <p role="alert" className="px-2 py-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

export default defineRenderer({
  apiVersion: 1,
  protocol: serviceTierProtocol,
  composerControls: [
    {
      id: "service-tier",
      render: (context) => <ServiceTierControl context={context} />,
    },
  ],
});
