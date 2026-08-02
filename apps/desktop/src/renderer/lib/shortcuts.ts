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
    description: "Abort the running agent turn, including while typing in the composer.",
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
    description: "Search chat titles and messages across your projects.",
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

/** A user's rebindings, keyed by shortcut id. An empty string means "disabled". */
export type KeybindingOverrides = Partial<Record<ShortcutId, string>>;

export function defaultBindingFor(id: ShortcutId): string {
  return BY_ID.get(id)?.binding ?? "";
}

/** The binding actually in effect: the user's override if they set one, else the default. */
export function bindingFor(id: ShortcutId, overrides: KeybindingOverrides = {}): string {
  const override = overrides[id];
  return override !== undefined ? override : defaultBindingFor(id);
}

export function isCustomized(id: ShortcutId, overrides: KeybindingOverrides = {}): boolean {
  return overrides[id] !== undefined;
}

/** Drop entries for ids the current registry no longer declares. */
export function sanitizeOverrides(raw: Record<string, string>): KeybindingOverrides {
  const overrides: KeybindingOverrides = {};
  for (const shortcut of SHORTCUTS) {
    const value = raw[shortcut.id];
    if (typeof value === "string") overrides[shortcut.id] = value;
  }
  return overrides;
}

/** The other shortcut currently holding this binding, if any. */
export function conflictFor(
  id: ShortcutId,
  binding: string,
  overrides: KeybindingOverrides = {},
): ShortcutId | undefined {
  if (!binding) return undefined;
  return SHORTCUTS.find((shortcut) => shortcut.id !== id && bindingFor(shortcut.id, overrides) === binding)?.id;
}

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/**
 * Turn a captured keydown into a tinykeys binding string, or `null` if the key
 * pressed was only a modifier (nothing to bind yet).
 *
 * `$mod` is whichever key is the platform's command modifier: Cmd on macOS,
 * Ctrl everywhere else. The other one keeps its own name, because the two are
 * distinct keys on a Mac and mapping Ctrl onto `$mod` there recorded Ctrl+K and
 * bound Cmd+K — a shortcut the user never pressed. On Windows the same applies
 * to Meta, which is the Windows key.
 */
export function parseKeyEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(event.code)) return null;
  const parts: string[] = [];
  if (IS_MAC) {
    if (event.metaKey) parts.push("$mod");
    if (event.ctrlKey) parts.push("Control");
  } else {
    if (event.ctrlKey) parts.push("$mod");
    if (event.metaKey) parts.push("Meta");
  }
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(event.code);
  return parts.join("+");
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
  if (part === "Control") return "Ctrl";
  if (KEY_LABELS[part]) return KEY_LABELS[part]!;
  // `KeyN` -> `N`, `Digit1` -> `1`; anything else already reads correctly.
  if (/^Key[A-Z]$/.test(part)) return part.slice(3);
  if (/^Digit[0-9]$/.test(part)) return part.slice(5);
  return part;
}

/** The combo as a person reads it, derived from the binding rather than restated. */
export function hintFor(id: ShortcutId, overrides: KeybindingOverrides = {}): string {
  const binding = bindingFor(id, overrides);
  if (!binding) return "";
  return binding.split("+").map(partLabel).join("+");
}

export function withHint(text: string, id: ShortcutId, overrides: KeybindingOverrides = {}): string {
  const combo = hintFor(id, overrides);
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
export function bindings(
  handlers: ShortcutHandlers,
  overrides: KeybindingOverrides = {},
): Record<string, (event: KeyboardEvent) => void> {
  const map: Record<string, (event: KeyboardEvent) => void> = {};
  for (const [id, handler] of Object.entries(handlers) as [ShortcutId, (event: KeyboardEvent) => void][]) {
    const binding = bindingFor(id, overrides);
    if (binding) map[binding] = handler;
  }
  return map;
}
