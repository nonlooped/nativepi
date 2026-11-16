import { useEffect, useState } from "react";
import { defineRenderer, type RendererContext } from "@nativepi/extension-api";
import { Badge } from "@nativepi/extension-api/ui";
import { protocol } from "./protocol.ts";

function Activity({ context }: { context: RendererContext<typeof protocol> }) {
  const [state, setState] = useState({ tools: 0, lastTool: null as string | null });
  const [error, setError] = useState("");
  const { call, on } = context.channel;
  useEffect(() => {
    let active = true;
    let received = false;
    // Subscribe before reading; a slow initial read must not overwrite a newer event.
    const off = on("changed", value => { received = true; setState(value); setError(""); });
    void call("state").then(value => { if (active && !received) setState(value); })
      .catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; off(); };
  }, [call, on]);
  return <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
    <Badge variant="secondary">{state.tools} tools</Badge>
    <span>{error || (state.lastTool ? `Last: ${state.lastTool}` : "No tools used in this runtime")}</span>
  </div>;
}
export default defineRenderer({ apiVersion: 1, requires: ["scoped-handles", "host-dispose"], protocol,
  composerWidgets: [{ id: "activity", placement: "aboveComposer", render: context => <Activity context={context} /> }],
});
