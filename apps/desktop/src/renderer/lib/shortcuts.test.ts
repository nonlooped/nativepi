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
} from "./shortcuts.ts";

const mac = typeof navigator === "object" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = mac ? "Cmd" : "Ctrl";
const alt = mac ? "Option" : "Alt";

describe("hints", () => {
  test("reads a binding back the way a person writes it", () => {
    // Bun exposes navigator on supported hosts; hints follow the actual platform.
    expect(hintFor("newChat")).toBe(`${mod}+Shift+N`);
    expect(hintFor("stopTurn")).toBe("Escape");
    expect(hintFor("openSettings")).toBe(`${mod}+,`);
    expect(hintFor("cycleThinking")).toBe(`${mod}+.`);
    expect(hintFor("jumpToLatest")).toBe(`${mod}+End`);
  });

  test("names arrow keys the short way", () => {
    expect(hintFor("nextProject")).toBe(`${mod}+${alt}+Down`);
    expect(hintFor("previousProject")).toBe(`${mod}+${alt}+Up`);
  });
});

describe("the registry", () => {
  test("no two shortcuts claim the same binding", () => {
    const all = SHORTCUTS.map((shortcut) => shortcut.binding);
    expect(new Set(all).size).toBe(all.length);
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
    expect(hintFor("newChat", { newChat: "$mod+Alt+KeyG" })).toBe(`${mod}+${alt}+G`);
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

  test("modifiers plus a key become a binding", () => {
    expect(parseKeyEvent(keydown({ code: "KeyG", ctrlKey: true, shiftKey: true }))).toBe(mac ? "Control+Shift+KeyG" : "$mod+Shift+KeyG");
    expect(parseKeyEvent(keydown({ code: "KeyG", metaKey: true }))).toBe(mac ? "$mod+KeyG" : "Meta+KeyG");
  });

  // Off a Mac, `$mod` is Ctrl and Meta is the Windows key. The two are never the
  // same key, so recording one must never produce the other: Ctrl+K used to be
  // written as `$mod+KeyK` on macOS as well, where it fires on Cmd+K.
  test("keeps the command modifier and the other one apart", () => {
    expect(parseKeyEvent(keydown({ code: "KeyK", ctrlKey: true }))).toBe(mac ? "Control+KeyK" : "$mod+KeyK");
    expect(parseKeyEvent(keydown({ code: "KeyK", ctrlKey: true, metaKey: true }))).toBe(mac ? "$mod+Control+KeyK" : "$mod+Meta+KeyK");
  });

  test("a plain key with no modifiers binds on its own", () => {
    expect(parseKeyEvent(keydown({ code: "Escape" }))).toBe("Escape");
  });
});

describe("interface scale shortcuts", () => {
  test("accepts equals and shifted plus without stealing a rebound key", () => {
    const increase = () => {};
    expect(bindings({ increaseScale: increase })).toEqual({
      "$mod+Equal": increase, "$mod+Shift+Equal": increase,
    });
    expect(bindings({ increaseScale: increase }, { increaseScale: "" })).toEqual({});
    expect(bindings({ increaseScale: increase }, { increaseScale: "$mod+KeyG" })).toEqual({ "$mod+KeyG": increase });
    expect(bindings({ increaseScale: increase }, { newChat: "$mod+Shift+Equal" })).toEqual({ "$mod+Equal": increase });
  });
});
