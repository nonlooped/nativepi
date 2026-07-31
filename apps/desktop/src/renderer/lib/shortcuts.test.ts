import { describe, expect, test } from "bun:test";
import {
  SHORTCUTS,
  bindingFor,
  bindings,
  conflictFor,
  defaultBindingFor,
  hintFor,
  isCustomized,
  parseKeyEvent,
  sanitizeOverrides,
  shortcutsByGroup,
} from "./shortcuts.ts";

describe("hints", () => {
  test("reads a binding back the way a person writes it", () => {
    // No `navigator` under the test runner, so `$mod` renders as Ctrl.
    expect(hintFor("newChat")).toBe("Ctrl+Shift+N");
    expect(hintFor("stopTurn")).toBe("Escape");
    expect(hintFor("openSettings")).toBe("Ctrl+,");
    expect(hintFor("cycleThinking")).toBe("Ctrl+.");
    expect(hintFor("jumpToLatest")).toBe("Ctrl+End");
  });

  test("names arrow keys the short way", () => {
    expect(hintFor("nextProject")).toBe("Ctrl+Alt+Down");
    expect(hintFor("previousProject")).toBe("Ctrl+Alt+Up");
  });
});

describe("the registry", () => {
  test("declares every shortcut exactly once and gives each a hint", () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(hintFor(id)).not.toBe("");
  });

  test("no two shortcuts claim the same binding", () => {
    const all = SHORTCUTS.map((shortcut) => shortcut.binding);
    expect(new Set(all).size).toBe(all.length);
  });

  test("every binding names a key, not just modifiers", () => {
    for (const { binding } of SHORTCUTS) {
      const key = binding.split("+").at(-1)!;
      expect(["$mod", "Shift", "Alt", "Meta", "Control"]).not.toContain(key);
    }
  });

  test("grouping loses nothing", () => {
    const grouped = shortcutsByGroup().flatMap(({ shortcuts }) => shortcuts);
    expect(grouped).toHaveLength(SHORTCUTS.length);
  });
});

describe("bindings()", () => {
  test("keys the tinykeys map by binding, not by shortcut id", () => {
    const noop = () => {};
    const map = bindings({ newChat: noop, stopTurn: noop });

    expect(Object.keys(map).sort()).toEqual([bindingFor("newChat"), bindingFor("stopTurn")].sort());
    expect(map[bindingFor("newChat")]).toBe(noop);
  });

  test("omitted shortcuts are not bound", () => {
    expect(bindings({})).toEqual({});
  });

  test("an override changes which key fires the handler", () => {
    const noop = () => {};
    const map = bindings({ newChat: noop }, { newChat: "$mod+KeyG" });
    expect(map).toEqual({ "$mod+KeyG": noop });
  });

  test("an empty-string override disables the shortcut", () => {
    const noop = () => {};
    expect(bindings({ newChat: noop }, { newChat: "" })).toEqual({});
  });
});

describe("overrides", () => {
  test("bindingFor prefers an override over the default", () => {
    expect(bindingFor("newChat")).toBe(defaultBindingFor("newChat"));
    expect(bindingFor("newChat", { newChat: "$mod+KeyG" })).toBe("$mod+KeyG");
  });

  test("isCustomized only looks at overrides, not whether the value differs", () => {
    expect(isCustomized("newChat", {})).toBe(false);
    expect(isCustomized("newChat", { newChat: "$mod+KeyG" })).toBe(true);
    expect(isCustomized("newChat", { newChat: defaultBindingFor("newChat") })).toBe(true);
  });

  test("conflictFor finds the shortcut already holding a binding", () => {
    expect(conflictFor("newChat", defaultBindingFor("importChat"))).toBe("importChat");
    expect(conflictFor("newChat", "$mod+KeyG")).toBeUndefined();
    expect(conflictFor("newChat", "")).toBeUndefined();
  });

  test("conflictFor checks effective bindings, including other overrides", () => {
    const overrides = { importChat: "$mod+KeyG" };
    expect(conflictFor("newChat", "$mod+KeyG", overrides)).toBe("importChat");
    // The binding importChat gave up no longer conflicts with anything.
    expect(conflictFor("newChat", defaultBindingFor("importChat"), overrides)).toBeUndefined();
  });

  test("sanitizeOverrides drops ids the registry no longer declares", () => {
    expect(sanitizeOverrides({ newChat: "$mod+KeyG", ghost: "$mod+KeyX" })).toEqual({ newChat: "$mod+KeyG" });
  });

  test("hintFor reads back an override the same way it reads a default", () => {
    expect(hintFor("newChat", { newChat: "$mod+Alt+KeyG" })).toBe("Ctrl+Alt+G");
  });
});

describe("parseKeyEvent", () => {
  function keydown(init: {
    code: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  }): KeyboardEvent {
    return {
      code: init.code,
      ctrlKey: !!init.ctrlKey,
      shiftKey: !!init.shiftKey,
      altKey: !!init.altKey,
      metaKey: !!init.metaKey,
    } as KeyboardEvent;
  }

  test("a bare modifier press has nothing to bind yet", () => {
    expect(parseKeyEvent(keydown({ code: "ControlLeft", ctrlKey: true }))).toBeNull();
    expect(parseKeyEvent(keydown({ code: "ShiftRight", shiftKey: true }))).toBeNull();
  });

  test("modifiers plus a key become a binding, Ctrl and Cmd both as $mod", () => {
    expect(parseKeyEvent(keydown({ code: "KeyG", ctrlKey: true, shiftKey: true }))).toBe("$mod+Shift+KeyG");
    expect(parseKeyEvent(keydown({ code: "KeyG", metaKey: true }))).toBe("$mod+KeyG");
  });

  test("a plain key with no modifiers binds on its own", () => {
    expect(parseKeyEvent(keydown({ code: "Escape" }))).toBe("Escape");
  });
});
