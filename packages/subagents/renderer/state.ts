import type { RendererContext } from "@nativepi/extension-api";
import type { subagentsProtocol, SubagentOverview } from "../types.ts";

export function subscribeState(
  { call, on }: RendererContext<typeof subagentsProtocol>["channel"],
  apply: (state: SubagentOverview) => void,
  fail: (error: unknown) => void,
) {
  let active = true;
  let changed = false;
  const off = on("changed", (value) => {
    if (!active) return;
    changed = true;
    apply(value);
  });
  void call("overview").then((value) => {
    if (active && !changed) apply(value);
  }).catch((error: unknown) => {
    if (active && !changed) fail(error);
  });
  return () => { active = false; off(); };
}
