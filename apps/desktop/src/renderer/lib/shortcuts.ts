export type ShortcutId =
  | "newChat"
  | "importChat"
  | "search"
  | "stopTurn"
  | "toggleSidebar"
  | "toggleContextPane"
  | "toggleTerminal"
  | "openSettings"
  | "cycleThinking"
  | "jumpToLatest"
  | "nextProject"
  | "previousProject";

export interface ShortcutDef {
  id: ShortcutId;
  /**
   * A tinykeys binding. `$mod` is Ctrl everywhere except macOS, where it is
   * Cmd; letters and punctuation are given as `KeyboardEvent.code` so a
   * shortcut lands on the same physical key regardless of keyboard layout.
   */
  binding: string;
  label: string;
  description: string;
  group: "Chat" | "Navigation" | "Application";
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "newChat",
    binding: "$mod+Shift+KeyN",
    label: "New chat",
    description: "Start a fresh chat in the active project.",
    group: "Chat",
  },
  {
    id: "importChat",
    binding: "$mod+Shift+KeyO",
    label: "Import chat",
    description: "Open an existing Pi session file into this project.",
    group: "Chat",
  },
  {
    id: "stopTurn",
    binding: "Escape",
    label: "Stop the current turn",
    description: "Abort the running agent turn, including while typing in the composer. Also closes Settings.",
    group: "Chat",
  },
  {
    id: "cycleThinking",
    binding: "$mod+Period",
    label: "Cycle reasoning level",
    description: "Step through the reasoning levels supported by the current model.",
    group: "Chat",
  },
  {
    id: "search",
    binding: "$mod+KeyK",
    label: "Search chats",
    description: "Focus the sidebar search box, opening the sidebar if it is closed.",
    group: "Navigation",
  },
  {
    id: "jumpToLatest",
    binding: "$mod+End",
    label: "Jump to latest",
    description: "Scroll the transcript to the newest message and resume auto-follow.",
    group: "Navigation",
  },
  {
    id: "nextProject",
    binding: "$mod+Alt+ArrowDown",
    label: "Next project",
    description: "Open the next project in the sidebar without reaching for the mouse.",
    group: "Navigation",
  },
  {
    id: "previousProject",
    binding: "$mod+Alt+ArrowUp",
    label: "Previous project",
    description: "Open the previous project in the sidebar.",
    group: "Navigation",
  },
  {
    id: "toggleSidebar",
    binding: "$mod+KeyB",
    label: "Toggle sidebar",
    description: "Show or hide the projects and chats sidebar.",
    group: "Navigation",
  },
  {
    id: "toggleContextPane",
    binding: "$mod+KeyJ",
    label: "Toggle changes pane",
    description: "Show or hide the Git changes pane.",
    group: "Navigation",
  },
  {
    id: "toggleTerminal",
    binding: "$mod+Backquote",
    label: "Toggle terminal",
    description: "Show or hide the active project's integrated terminal.",
    group: "Navigation",
  },
  {
    id: "openSettings",
    binding: "$mod+Comma",
    label: "Open settings",
    description: "Open NativePi settings.",
    group: "Application",
  },
];

const BY_ID = new Map(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]));

export function bindingFor(id: ShortcutId): string {
  return BY_ID.get(id)?.binding ?? "";
}

/**
 * Whether `$mod` means Cmd here.
 *
 * Detected the same way tinykeys detects it, so the hint shown to the user can
 * never disagree with the key that is actually bound.
 */
const IS_MAC = typeof navigator === "object" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const KEY_LABELS: Record<string, string> = {
  ArrowDown: "Down",
  ArrowUp: "Up",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Period: ".",
  Comma: ",",
  Slash: "/",
};

function partLabel(part: string): string {
  if (part === "$mod") return IS_MAC ? "Cmd" : "Ctrl";
  if (part === "Alt") return IS_MAC ? "Option" : "Alt";
  if (part === "Meta") return IS_MAC ? "Cmd" : "Win";
  if (KEY_LABELS[part]) return KEY_LABELS[part]!;
  // `KeyN` -> `N`, `Digit1` -> `1`; anything else already reads correctly.
  if (/^Key[A-Z]$/.test(part)) return part.slice(3);
  if (/^Digit[0-9]$/.test(part)) return part.slice(5);
  return part;
}

/** The combo as a person reads it, derived from the binding rather than restated. */
export function hintFor(id: ShortcutId): string {
  const binding = bindingFor(id);
  if (!binding) return "";
  return binding.split("+").map(partLabel).join("+");
}

export function withHint(text: string, id: ShortcutId): string {
  const combo = hintFor(id);
  return combo ? `${text} (${combo})` : text;
}

export function shortcutsByGroup(): { group: ShortcutDef["group"]; shortcuts: ShortcutDef[] }[] {
  const groups: ShortcutDef["group"][] = ["Chat", "Navigation", "Application"];
  return groups.map((group) => ({
    group,
    shortcuts: SHORTCUTS.filter((shortcut) => shortcut.group === group),
  }));
}

export type ShortcutHandlers = Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>;

/**
 * Build a tinykeys map from handlers keyed by shortcut id.
 *
 * Call sites name the shortcut they mean rather than restating its keys, so a
 * rebinding happens in the registry above and nowhere else.
 */
export function bindings(handlers: ShortcutHandlers): Record<string, (event: KeyboardEvent) => void> {
  const map: Record<string, (event: KeyboardEvent) => void> = {};
  for (const [id, handler] of Object.entries(handlers) as [ShortcutId, (event: KeyboardEvent) => void][]) {
    const binding = bindingFor(id);
    if (binding) map[binding] = handler;
  }
  return map;
}
