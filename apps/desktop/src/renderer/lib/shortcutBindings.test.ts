import { describe, expect, test } from "bun:test";
import { createKeybindingsHandler } from "tinykeys";
import { bindings, type ShortcutId } from "./shortcuts.ts";

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
  const ids: ShortcutId[] = [
    "newChat",
    "importChat",
    "search",
    "stopTurn",
    "toggleSidebar",
    "toggleContextPane",
    "openSettings",
    "cycleThinking",
    "jumpToLatest",
    "nextProject",
    "previousProject",
  ];
  const handlers = Object.fromEntries(ids.map((id) => [id, () => (hit = id)]));
  const handle = createKeybindingsHandler(bindings(handlers), { ignore: () => false });
  handle(press(stroke));
  return hit;
}

describe("every shortcut fires on the keystroke it advertises", () => {
  const cases: [ShortcutId, Keystroke][] = [
    ["newChat", { key: "N", code: "KeyN", ctrl: true, shift: true }],
    ["importChat", { key: "O", code: "KeyO", ctrl: true, shift: true }],
    ["search", { key: "k", code: "KeyK", ctrl: true }],
    ["stopTurn", { key: "Escape", code: "Escape" }],
    ["toggleSidebar", { key: "b", code: "KeyB", ctrl: true }],
    ["toggleContextPane", { key: "j", code: "KeyJ", ctrl: true }],
    ["openSettings", { key: ",", code: "Comma", ctrl: true }],
    ["cycleThinking", { key: ".", code: "Period", ctrl: true }],
    ["jumpToLatest", { key: "End", code: "End", ctrl: true }],
    ["nextProject", { key: "ArrowDown", code: "ArrowDown", ctrl: true, alt: true }],
    ["previousProject", { key: "ArrowUp", code: "ArrowUp", ctrl: true, alt: true }],
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
