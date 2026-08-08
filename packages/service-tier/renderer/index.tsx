import { useEffect, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { GaugeIcon } from "@phosphor-icons/react/Gauge";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext } from "@nativepi/extension-api";
import {
  Button,
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuTrigger,
} from "@nativepi/extension-api/ui";
import { serviceTierProtocol, type ServiceTier, type TierState } from "../types.ts";

const MUTED = "var(--muted-foreground)";

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

  const selected =
    CHOICES.find((choice) => choice.tier === state.tier) ?? CHOICES[0];

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
        render={
          <Button variant="ghost" size="lg" style={{ maxWidth: "8.5rem" }} />
        }
      >
        <GaugeIcon data-icon="inline-start" />
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selected.label}
        </span>
        <CaretDownIcon data-icon="inline-end" />
      </MenuTrigger>
      <MenuContent side="top" style={{ width: "17rem", padding: "0.375rem" }}>
        <MenuLabel>Response speed</MenuLabel>
        <MenuGroup>
          {CHOICES.map((choice) => {
            const active = state.tier === choice.tier;
            const pending = saving === choice.tier;
            return (
              <MenuItem
                key={choice.tier}
                disabled={saving !== null}
                onClick={() => choose(choice.tier)}
                style={{
                  alignItems: "flex-start",
                  gap: "0.5rem",
                  borderRadius: "0.375rem",
                  padding: "0.5rem",
                  background: active ? "var(--accent)" : undefined,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    minWidth: 0,
                    flex: 1,
                    flexDirection: "column",
                    gap: "0.125rem",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                    {choice.label}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      lineHeight: 1.5,
                      color: MUTED,
                    }}
                  >
                    {pending ? "Updating response speed…" : choice.description}
                  </span>
                </div>
                {active ? (
                  <CheckIcon
                    style={{
                      marginTop: "0.125rem",
                      flexShrink: 0,
                      color: "var(--success)",
                    }}
                  />
                ) : null}
              </MenuItem>
            );
          })}
        </MenuGroup>
        {error ? (
          <p
            role="alert"
            style={{
              padding: "0.5rem",
              fontSize: "0.75rem",
              lineHeight: 1.5,
              color: "var(--destructive)",
            }}
          >
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
