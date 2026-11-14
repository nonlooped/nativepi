import { describe, expect, test } from "bun:test";
import { createKeybindingsHandler } from "tinykeys";
import { bindings, SHORTCUTS, type ShortcutId } from "./shortcuts.ts";

/**
 * Exercises the real tinykeys matcher against the real binding strings.
 *
 * The registry is only correct if these strings fire on the keystrokes people
 * actually press, and a typo like `Key.` or `Ctrl+` would otherwise sit there
 * silently doing nothing.
 */

interface Keystroke {
  key: string;
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

function press(stroke: Keystroke): KeyboardEvent {
  const state: Record<string, boolean> = {
    Control: !!stroke.ctrl,
    Shift: !!stroke.shift,
    Alt: !!stroke.alt,
    Meta: !!stroke.meta,
    AltGraph: false,
  };
  return {
    key: stroke.key,
    code: stroke.code,
    getModifierState: (mod: string) => state[mod] ?? false,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
}

/** Which shortcut, if any, a keystroke triggers. */
function fired(stroke: Keystroke): ShortcutId | null {
  let hit: ShortcutId | null = null;
  const ids = SHORTCUTS.map(shortcut => shortcut.id);
  const handlers = Object.fromEntries(ids.map((id) => [id, () => (hit = id)]));
  const handle = createKeybindingsHandler(bindings(handlers), { ignore: () => false });
  handle(press(stroke));
  return hit;
}

describe("every shortcut fires on the keystroke it advertises", () => {
  // tinykeys resolves $mod from the runtime's navigator (Bun exposes the host OS).
  const mod = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? { meta: true } : { ctrl: true };
  const cases: [ShortcutId, Keystroke][] = [
    ...Array.from({ length: 10 }, (_, index): [ShortcutId, Keystroke] => [`thread${index + 1}` as ShortcutId, { key: String((index + 1) % 10), code: `Digit${(index + 1) % 10}`, ...mod }]),
    ["focusTerminal", { key: "~", code: "Backquote", ...mod, shift: true }],
    ["newTerminal", { key: "T", code: "KeyT", ...mod, shift: true }],
    ["splitTerminal", { key: "D", code: "KeyD", ...mod, shift: true }],
    ["splitTerminalVertical", { key: "D", code: "KeyD", ...mod, alt: true, shift: true }],
    ["nextTerminal", { key: "ArrowRight", code: "ArrowRight", ...mod, alt: true }],
    ["previousTerminal", { key: "ArrowLeft", code: "ArrowLeft", ...mod, alt: true }],
    ["closeTerminal", { key: "w", code: "KeyW", ...mod, alt: true }],
    ["openSourceControl", { key: "G", code: "KeyG", ...mod, shift: true }],
    ["refreshSourceControl", { key: "R", code: "KeyR", ...mod, shift: true }],
    ["commitChanges", { key: "Enter", code: "Enter", ...mod }],
    ["resetScale", { key: "0", code: "Digit0", ...mod, alt: true }],
    ["focusComposer", { key: "l", code: "KeyL", ...mod }],
    ["selectModel", { key: "M", code: "KeyM", ...mod, shift: true }],
    ["nextChat", { key: "}", code: "BracketRight", ...mod, shift: true }],
    ["previousChat", { key: "{", code: "BracketLeft", ...mod, shift: true }],
    ["showChat", { key: "1", code: "Digit1", ...mod, alt: true }],
    ["showWork", { key: "2", code: "Digit2", ...mod, alt: true }],
    ["openProject", { key: "o", code: "KeyO", ...mod }],
    ["newChat", { key: "N", code: "KeyN", ...mod, shift: true }],
    ["importChat", { key: "O", code: "KeyO", ...mod, shift: true }],
    ["search", { key: "k", code: "KeyK", ...mod }],
    ["stopTurn", { key: "Escape", code: "Escape" }],
    ["toggleSidebar", { key: "b", code: "KeyB", ...mod }],
    ["toggleContextPane", { key: "j", code: "KeyJ", ...mod }],
    ["toggleTerminal", { key: "`", code: "Backquote", ...mod }],
    ["openSettings", { key: ",", code: "Comma", ...mod }],
    ["cycleThinking", { key: ".", code: "Period", ...mod }],
    ["jumpToLatest", { key: "End", code: "End", ...mod }],
    ["nextProject", { key: "ArrowDown", code: "ArrowDown", ...mod, alt: true }],
    ["previousProject", { key: "ArrowUp", code: "ArrowUp", ...mod, alt: true }],
  ];

  for (const [id, stroke] of cases) {
    test(id, () => expect(fired(stroke)).toBe(id));
  }
});

describe("shortcuts do not fire on near misses", () => {
  test("a bare Escape is not confused with a modified one", () => {
    expect(fired({ key: "Escape", code: "Escape", ctrl: true })).toBeNull();
  });

  test("Ctrl+N alone does not start a new chat", () => {
    expect(fired({ key: "n", code: "KeyN", ctrl: true })).toBeNull();
  });

  test("an unexpected extra modifier blocks the match", () => {
    // The hand-rolled matcher this replaced never looked at the Meta key, so
    // Win+Ctrl+B toggled the sidebar.
    expect(fired({ key: "b", code: "KeyB", ctrl: true, meta: true })).toBeNull();
  });

  test("the two project shortcuts do not collide", () => {
    expect(fired({ key: "ArrowUp", code: "ArrowUp", ctrl: true, alt: true })).not.toBe("nextProject");
  });
});
