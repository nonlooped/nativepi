import { useEffect, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { TextTIcon } from "@phosphor-icons/react/TextT";
import { defineRenderer } from "@nativepi/extension-api";
import type { NativePiContext } from "@nativepi/extension-api";
import {
  Button,
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuTrigger,
  SettingsActionRow,
} from "@nativepi/extension-api/ui";
import type { TitleGeneratorState } from "../types.ts";

const MUTED = "var(--muted-foreground)";

function titleState(value: unknown): TitleGeneratorState | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("modelSetting" in value) ||
    !("models" in value)
  )
    return undefined;
  const { modelSetting, models } = value;
  if (typeof modelSetting !== "string" || !Array.isArray(models))
    return undefined;
  const parsedModels = models.flatMap((model) => {
    if (
      typeof model !== "object" ||
      model === null ||
      !("key" in model) ||
      !("label" in model)
    )
      return [];
    return typeof model.key === "string" && typeof model.label === "string"
      ? [{ key: model.key, label: model.label }]
      : [];
  });
  return parsedModels.length === models.length
    ? { modelSetting, models: parsedModels }
    : undefined;
}

function TitleGeneratorSetting({ ctx }: { ctx: NativePiContext }) {
  const { call, on } = ctx;
  const [state, setState] = useState<TitleGeneratorState | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (value: unknown) => {
      const next = titleState(value);
      if (!cancelled && next) setState(next);
    };
    void call("state")
      .then(apply)
      .catch(() => {});
    return on("changed", apply);
  }, [call, on]);

  const selected = state?.models.find(
    (model) => model.key === state.modelSetting,
  );
  const label = selected?.label ?? "Loading title models…";

  const choose = (modelSetting: string) => {
    if (!state || modelSetting === state.modelSetting || saving) return;
    setSaving(modelSetting);
    setError(null);
    void call("set", { modelSetting })
      .then((value) => {
        const next = titleState(value);
        if (!next) throw new Error("The title model was not updated.");
        setState(next);
        setOpen(false);
      })
      .catch(() => {
        setError("Unable to change the title model. Try again.");
        setOpen(true);
      })
      .finally(() => setSaving(null));
  };

  return (
    <SettingsActionRow
      label="Title model"
      description="Used once to name a new chat after your first message."
    >
      <Menu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setError(null);
        }}
      >
        <MenuTrigger
          disabled={!state}
          aria-label={`Title model: ${label}`}
          title={state ? `Title model: ${label}` : "Loading title models"}
          render={
            <Button variant="outline" size="xl" style={{ maxWidth: "20rem" }} />
          }
        >
          <TextTIcon data-icon="inline-start" />
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
          <CaretDownIcon data-icon="inline-end" />
        </MenuTrigger>
        <MenuContent
          align="end"
          style={{
            width: "22rem",
            maxHeight: "min(30rem, 70vh)",
            overflowY: "auto",
            padding: "0.375rem",
          }}
        >
          <MenuLabel>Title model</MenuLabel>
          <MenuGroup>
            {state?.models.map((model) => {
              const active = model.key === state.modelSetting;
              const pending = saving === model.key;
              return (
                <MenuItem
                  key={model.key}
                  disabled={saving !== null}
                  onClick={() => choose(model.key)}
                  style={{
                    gap: "0.5rem",
                    minHeight: "2.25rem",
                    borderRadius: "0.375rem",
                    background: active ? "var(--accent)" : undefined,
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pending ? "Updating title model…" : model.label}
                  </span>
                  {active ? (
                    <CheckIcon
                      style={{ flexShrink: 0, color: "var(--success)" }}
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
    </SettingsActionRow>
  );
}

export default defineRenderer({
  settings: [
    {
      key: "title-generator",
      heading: "Chat titles",
      description:
        "Pi creates a concise title from the first message. Choose a smaller model when you want that request to cost less.",
      render: (ctx) => <TitleGeneratorSetting ctx={ctx} />,
    },
  ],
});
