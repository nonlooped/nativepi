import { expect, test } from "bun:test";
import { contextInspectorSchema, isTuiFrameType, tuiClientFrameSchema, tuiHostFrameSchema } from "./tui-frames.ts";

/**
 * What keeps the side channel and Pi's protocol apart, and what keeps extension
 * code from reaching the window unchecked.
 *
 * Both directions share one pipe, so a routing mistake is not cosmetic: a Pi
 * event mistaken for a frame would vanish from the transcript, and a frame
 * mistaken for a Pi command would come back as a parse error.
 */

test("Pi's own protocol is never mistaken for this channel", () => {
  expect(isTuiFrameType("agent_start")).toBe(false);
  expect(isTuiFrameType("extension_ui_request")).toBe(false);
  expect(isTuiFrameType("response")).toBe(false);
  expect(isTuiFrameType(undefined)).toBe(false);
  expect(isTuiFrameType(42)).toBe(false);
});

test("a frame type this build does not know is still claimed, not passed on", () => {
  // Routing is decided before validity in both directions: an unrecognised frame
  // must be dropped rather than handed to Pi's command parser or to the window's
  // event reducer, either of which would treat it as something it is not.
  expect(isTuiFrameType("nativepi_tui_invented_later")).toBe(true);
  expect(tuiHostFrameSchema.safeParse({ type: "nativepi_tui_invented_later" }).success).toBe(false);
});

test("a well-formed write parses and a truncated one does not", () => {
  expect(tuiHostFrameSchema.safeParse({ type: "nativepi_tui_write", surfaceId: "s1", data: "x" }).success).toBe(true);
  // Extension code decides what a component draws, so a frame missing the thing
  // the window would write into a terminal has to fail here rather than there.
  expect(tuiHostFrameSchema.safeParse({ type: "nativepi_tui_write", surfaceId: "s1" }).success).toBe(false);
  expect(tuiHostFrameSchema.safeParse({ type: "nativepi_tui_write", surfaceId: "", data: "x" }).success).toBe(false);
});

test("a surface has to name a placement the window has a slot for", () => {
  const parsed = tuiHostFrameSchema.safeParse({
    type: "nativepi_tui_open",
    surface: { id: "s1", placement: "sidebar", key: "probe" },
  });

  expect(parsed.success).toBe(false);
});

test("a resize from the window is bounded", () => {
  expect(
    tuiClientFrameSchema.safeParse({ type: "nativepi_tui_resize", surfaceId: "s1", cols: 80, rows: 24 }).success,
  ).toBe(true);
  expect(
    tuiClientFrameSchema.safeParse({ type: "nativepi_tui_resize", surfaceId: "s1", cols: 0, rows: 24 }).success,
  ).toBe(false);
});

test("the context inspector accepts only a non-negative Pi measurement", () => {
  const inspector = {
    usedTokens: 42,
    contextWindow: 200_000,
  };

  expect(contextInspectorSchema.safeParse(inspector).success).toBe(true);
  expect(contextInspectorSchema.safeParse({ ...inspector, usedTokens: -1 }).success).toBe(false);
});
