import { Toaster as SonnerToaster } from "sonner";

/**
 * The one transient-message surface.
 *
 * NativePi raises two kinds of transient message — an extension notification and
 * a keyboard-action hint — and they used to be two hand-rolled stacks plus a
 * third timer in the store. Sonner owns the queueing, dismissal timers, exit
 * animation and live-region semantics; what stays here is only how they look.
 *
 * Styled through `classNames` rather than sonner's default palette so the toasts
 * read as the same popover surface used by menus and dialogs.
 */
export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      // z-[70] clears the window controls at z-[60]: a toast may overlap chrome,
      // but it must never sit under the close button in a frameless window.
      className="z-[70]"
      offset={16}
      gap={8}
      visibleToasts={4}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "pointer-events-auto flex w-80 items-start gap-2 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg",
          title: "min-w-0 flex-1 whitespace-pre-wrap font-normal",
          description: "text-muted-foreground",
          icon: "mt-0.5 shrink-0",
          closeButton:
            "pointer-events-auto rounded-sm p-0.5 opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
          error: "border-destructive/30 bg-destructive/15 text-destructive",
          warning: "border-warning/30 bg-warning/15 text-warning",
        },
      }}
    />
  );
}
