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
          // Sized by content between bounds: a fixed width forced long
          // extension messages into a tall 320px ribbon of wrapped text.
          // The 16rem floor is a comfortable minimum on a desktop window and
          // most of a phone's width, so it yields to the viewport there.
          toast:
            "pointer-events-auto flex w-auto min-w-[min(16rem,calc(100vw-2rem))] max-w-[min(24rem,calc(100vw-2rem))] items-center gap-2.5 rounded-lg border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg",
          content: "min-w-0 flex-1",
          title: "whitespace-pre-wrap font-medium leading-5",
          description: "mt-0.5 leading-4 text-muted-foreground",
          icon: "flex size-4 shrink-0 items-center justify-center self-center",
          actionButton:
            "h-7 shrink-0 rounded-md bg-primary px-2.5 font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring",
          cancelButton:
            "h-7 shrink-0 rounded-md bg-secondary px-2.5 font-semibold text-secondary-foreground outline-none transition-colors hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring",
          closeButton:
            "pointer-events-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
          error: "border-destructive/30 bg-destructive/15 text-destructive",
          warning: "border-warning/30 bg-warning/15 text-warning",
        },
      }}
    />
  );
}
