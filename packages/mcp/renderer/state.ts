import type { RendererContext } from "@nativepi/extension-api";
import type { mcpProtocol, McpState } from "../types.ts";

export function subscribeState(
  { call, on }: RendererContext<typeof mcpProtocol>["channel"],
  apply: (state: McpState) => void,
  fail: (error: unknown) => void,
) {
  let active = true;
  let changed = false;
  const off = on("changed", (value) => {
    if (!active) return;
    changed = true;
    apply(value);
  });
  void call("state").then((value) => {
    if (active && !changed) apply(value);
  }).catch((error: unknown) => {
    if (active && !changed) fail(error);
  });
  return () => { active = false; off(); };
}
