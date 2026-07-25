import { toast } from "sonner";

/**
 * The two transient messages NativePi raises, named rather than assembled at
 * each call site so their timing and placement stay consistent.
 */

/** The hint pill: brief, compact, and visually distinct from a notification. */
const HINT_CLASSNAMES = {
  toast:
    "pointer-events-none flex w-auto items-center justify-center rounded-full border bg-popover px-3.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg",
  title: "whitespace-nowrap font-medium",
};

/**
 * Acknowledge a keyboard action that changed something off-screen.
 *
 * Deliberately short-lived and non-interactive: it confirms an action the user
 * just took, so it must not queue behind notifications or need dismissing.
 */
export function showHint(text: string): void {
  toast(text, {
    id: "nativepi-hint", // One at a time: rapid cycling replaces, never stacks.
    duration: 1800,
    position: "top-center",
    classNames: HINT_CLASSNAMES,
  });
}

/**
 * Surface a message from a Pi extension.
 *
 * An error stays until dismissed — it reports something that did not happen, and
 * a message that vanishes on its own is one the user can miss entirely.
 */
export function showExtensionNotification(message: string, kind: "info" | "warning" | "error" = "info"): void {
  const options = { closeButton: true } as const;
  if (kind === "error") toast.error(message, { ...options, duration: Infinity });
  else if (kind === "warning") toast.warning(message, { ...options, duration: 10_000 });
  else toast(message, { ...options, duration: 6000 });
}
