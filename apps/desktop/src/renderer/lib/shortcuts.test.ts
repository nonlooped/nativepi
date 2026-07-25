import { describe, expect, test } from "bun:test";
import { SHORTCUTS, bindingFor, bindings, hintFor, shortcutsByGroup } from "./shortcuts.ts";

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
});
