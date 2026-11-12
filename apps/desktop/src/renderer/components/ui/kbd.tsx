import { cn } from "@/lib/utils.ts";

const MAC_GLYPHS: Record<string, string> = {
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  shift: "⇧",
  alt: "⌥",
  option: "⌥",
  ctrl: "⌃",
  control: "⌃",
  enter: "↵",
  return: "↵",
  escape: "Esc",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

/** Modifier names read better as the glyphs macOS users already know. */
function keyLabel(children: React.ReactNode): React.ReactNode {
  if (!isMac || typeof children !== "string") return children;
  const label = (part: string) => MAC_GLYPHS[part.trim().toLowerCase()] ?? part;
  const parts = children.split("+");
  // A combo such as "Cmd+." reads as "⌘." the way menus print it.
  if (parts.length > 1 && parts.every(Boolean)) return parts.map(label).join("");
  return label(children);
}

function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[0.3125rem] border border-border/80 bg-muted/70 px-1.5 font-sans text-[0.6875rem] leading-none font-medium text-muted-foreground shadow-[0_1px_0_color-mix(in_oklch,var(--foreground)_9%,transparent)]",
        className,
      )}
    >
      {keyLabel(children)}
    </kbd>
  );
}

export { Kbd };
