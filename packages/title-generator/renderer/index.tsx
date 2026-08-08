import { useEffect, useState } from "react";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext } from "@nativepi/extension-api";
import { FieldError, SettingsSelectRow } from "@nativepi/extension-api/ui";
import {
  titleGeneratorProtocol,
  type TitleGeneratorState,
} from "../types.ts";

function TitleGeneratorSetting({
  context,
}: {
  context: RendererContext<typeof titleGeneratorProtocol>;
}) {
  const { call, on } = context.channel;
  const [state, setState] = useState<TitleGeneratorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (value: TitleGeneratorState) => {
      if (!cancelled) setState(value);
    };
    void call("state")
      .then(apply)
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    const off = on("changed", apply);
    return () => {
      cancelled = true;
      off();
    };
  }, [call, on]);

  const choose = (modelSetting: string) => {
    if (!state || saving || modelSetting === state.modelSetting) return;
    setSaving(true);
    setError(null);
    void call("set", { modelSetting })
      .then(setState)
      .catch(() => setError("Unable to change the title model. Try again."))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <SettingsSelectRow
        label="Title model"
        description="Used once to name a new chat after your first message."
        value={state?.modelSetting ?? ""}
        options={(state?.models ?? [{ key: "", label: "Loading title models…" }]).map(({ key, label }) => ({
          value: key,
          label,
        }))}
        onChange={choose}
        disabled={!state || saving}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </>
  );
}

export default defineRenderer({
  apiVersion: 1,
  protocol: titleGeneratorProtocol,
  settings: [
    {
      id: "title-generator",
      heading: "Chat titles",
      description:
        "Pi creates a concise title from the first message. Choose a smaller model when you want that request to cost less.",
      render: (context) => <TitleGeneratorSetting context={context} />,
    },
  ],
});
