import { useEffect, useState } from "react";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext } from "@nativepi/extension-api";
import { FieldError, SettingsSliderRow } from "@nativepi/extension-api/ui";
import { subagentsProtocol, type SubagentSettings } from "../types.ts";

function SubagentSettingsControl({
  context,
}: {
  context: RendererContext<typeof subagentsProtocol>;
}) {
  const { call, on } = context.channel;
  const [state, setState] = useState<SubagentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (value: SubagentSettings) => {
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

  const changeMaxConcurrency = (maxConcurrency: number) => {
    if (!state || maxConcurrency === state.userMaxConcurrency) return;
    setState({ ...state, userMaxConcurrency: maxConcurrency });
    setError(null);
    void call("setMaxConcurrency", { maxConcurrency })
      .then(setState)
      .catch(() => setError("Unable to save the subagent limit. Try again."));
  };

  const isOverridden = state?.projectMaxConcurrency !== null && state?.projectMaxConcurrency !== undefined;
  const description = isOverridden
    ? `User default is ${state?.userMaxConcurrency}. This project overrides it to ${state?.projectMaxConcurrency} (effective: ${state?.effectiveMaxConcurrency}).`
    : "Maximum child agents that may run at once. Additional children wait in the queue.";

  return (
    <>
      <SettingsSliderRow
        label="Concurrent subagents"
        description={description}
        value={state?.userMaxConcurrency ?? 6}
        min={1}
        max={32}
        step={1}
        format={(value) => `${value}`}
        onChange={changeMaxConcurrency}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </>
  );
}

export default defineRenderer({
  apiVersion: 1,
  protocol: subagentsProtocol,
  settings: [
    {
      id: "subagents",
      heading: "Subagents",
      description: "Run isolated Pi sessions in parallel without sharing the parent conversation.",
      render: (context) => <SubagentSettingsControl context={context} />,
    },
  ],
});
