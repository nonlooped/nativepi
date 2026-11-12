import type { RendererContext } from "@nativepi/extension-api";
import type { serviceTierProtocol, TierState } from "../types.ts";

export function subscribeState(
  { call, on }: RendererContext<typeof serviceTierProtocol>["channel"],
  apply: (state: TierState) => void,
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
