import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

// Settings retains its existing presentation, including dialogs rendered through portals.
export const SettingsDialogAppearance = createContext(false);

// Geometry and motion are shared; dismissal semantics stay with the Base UI primitives.
const surface = "fixed top-1/2 left-1/2 z-50 max-h-[calc(var(--app-height,100dvh)-2rem)] w-[calc(100vw-2rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px))] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border outline-none transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-[ending-style]:scale-98 data-[ending-style]:opacity-0 data-[starting-style]:scale-98 data-[starting-style]:opacity-0";
const overlay = "fixed inset-0 z-50 transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";
const footer = "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end";

export function useDialogStyles(alert = false) {
  const settings = useContext(SettingsDialogAppearance);
  return {
    surface: cn(surface, settings
      ? cn("border-border/70 bg-popover text-popover-foreground shadow-xl", alert ? "grid p-7" : "flex flex-col p-5 sm:p-6")
      : "flex flex-col border-border/40 bg-background/95 p-6 text-foreground shadow-lg backdrop-blur-xl"),
    overlay: cn(overlay, settings ? "bg-overlay" : "bg-overlay/40 backdrop-blur-[2px]"),
    header: settings && alert ? "flex flex-col gap-3" : "flex shrink-0 flex-col gap-2",
    footer: cn(footer, settings ? "sm:border-t sm:border-border/60 sm:pt-5" : "pt-2", (!settings || !alert) && "shrink-0"),
    close: settings ? "absolute top-4 right-4" : "absolute top-5 right-5",
  };
}
