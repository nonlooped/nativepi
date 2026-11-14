import type { ChipKind } from "./composerText.ts";

export const CHIP_CLASS: Record<ChipKind, string> = {
  skill:
    "mx-px inline-flex translate-y-px items-center gap-1 rounded-md border border-info/40 bg-info/10 px-1.5 py-px align-baseline text-sm font-medium leading-5 text-info",
  file:
    "mx-px inline-flex translate-y-px items-center gap-1 rounded-md border bg-muted px-1.5 py-px align-baseline font-mono text-sm leading-5 text-foreground",
};
