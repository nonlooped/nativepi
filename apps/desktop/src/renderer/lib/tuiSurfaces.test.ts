import { expect, test } from "bun:test";
import { dropAllSurfaces, dropSurface, onSurfaceWrite, surfaceBuffer, writeSurface } from "./tuiSurfaces.ts";

/**
 * What a pane replays when it mounts.
 *
 * pi-tui renders differentially, so the buffer is only meaningful from the last
 * point the component drew everything — a screen clear. Keeping less than that
 * would replay half a frame; keeping more grows without bound for a widget that
 * repaints on a timer.
 */

test("writes accumulate so a pane that mounts late catches up", () => {
  dropAllSurfaces();
  writeSurface("s1", "first");
  writeSurface("s1", "second");

  expect(surfaceBuffer("s1")).toBe("firstsecond");
});

test("a full redraw drops the history it replaced", () => {
  dropAllSurfaces();
  writeSurface("s1", "stale frame");
  writeSurface("s1", "\x1b[?2026h\x1b[2J\x1b[Hfresh frame");

  // The redraw is kept from the clear onward, so replaying it paints the same
  // picture the component last drew, with nothing from before it.
  expect(surfaceBuffer("s1")).toBe("\x1b[2J\x1b[Hfresh frame");
});

test("surfaces do not share a buffer", () => {
  dropAllSurfaces();
  writeSurface("s1", "one");
  writeSurface("s2", "two");

  expect(surfaceBuffer("s1")).toBe("one");
  expect(surfaceBuffer("s2")).toBe("two");
});

test("a live pane is written to as well as buffered", () => {
  dropAllSurfaces();
  const seen: string[] = [];
  const off = onSurfaceWrite("s1", (data) => seen.push(data));

  writeSurface("s1", "a");
  off();
  writeSurface("s1", "b");

  expect(seen).toEqual(["a"]);
  expect(surfaceBuffer("s1")).toBe("ab");
});

test("closing a surface forgets it", () => {
  dropAllSurfaces();
  writeSurface("s1", "gone");
  dropSurface("s1");

  expect(surfaceBuffer("s1")).toBe("");
});
