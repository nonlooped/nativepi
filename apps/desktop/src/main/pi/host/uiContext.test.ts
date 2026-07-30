import { expect, test } from "bun:test";
import type { Component } from "@earendil-works/pi-tui";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { TuiHostFrame } from "../../../shared/tui-frames.ts";
import { hostInternals, withTerminalUi } from "./uiContext.ts";

/**
 * The terminal half of `ctx.ui`, driven without a Pi around it.
 *
 * What is checked here is the bookkeeping rather than the drawing: which frames
 * leave the host, and what Pi's own context is told, for the three moments a
 * component alone cannot answer for — a widget replacing itself with a different
 * kind of widget, a window that has forgotten everything, and a context being
 * unbound with chrome still changed.
 */

function harness() {
  const sent: TuiHostFrame[] = [];
  const widgets: { key: string; content: unknown }[] = [];
  const base = {
    theme: {},
    notify: () => {},
    setWidget: (key: string, content: unknown) => widgets.push({ key, content }),
    setStatus: () => {},
  } as unknown as ExtensionUIContext;

  const ui = withTerminalUi(base, { send: (frame) => sent.push(frame) });
  const internals = hostInternals(ui);
  if (!internals) throw new Error("the wrapper did not install its hooks");
  return { ui, sent, widgets, internals };
}

/** The least a pi-tui component can be, since nothing here looks at the picture. */
function stubComponent(): Component {
  return { render: () => ["probe"], invalidate: () => {} };
}

test("a component takes over a key that was holding lines", () => {
  const { ui, widgets, internals } = harness();

  ui.setWidget("probe", ["one line"]);
  ui.setWidget("probe", (() => stubComponent()) as never);

  // The second call has to clear the first through Pi's own context: a key holds
  // one widget, and the window would otherwise draw the lines and the component.
  expect(widgets).toEqual([
    { key: "probe", content: ["one line"] },
    { key: "probe", content: undefined },
  ]);
  internals.dispose();
});

test("a resync says everything a window arriving late has missed", () => {
  const { ui, sent, internals } = harness();

  ui.setWidget("probe", (() => stubComponent()) as never);
  ui.setWorkingMessage("indexing");
  sent.length = 0;

  internals.handle({ type: "nativepi_tui_sync" });

  // Surfaces were announced once, to a window that has since dropped them, so
  // the open frame and the chrome have to be sent again rather than waited for.
  expect(sent.filter((frame) => frame.type === "nativepi_tui_open")).toHaveLength(1);
  expect(sent.find((frame) => frame.type === "nativepi_tui_state")).toEqual({
    type: "nativepi_tui_state",
    state: { workingMessage: "indexing" },
  });
  internals.dispose();
});

test("unbinding puts the chrome an extension changed back", () => {
  const { ui, sent, internals } = harness();

  ui.setWorkingVisible(false);
  ui.setToolsExpanded(true);
  sent.length = 0;

  internals.dispose();

  // The panes go with the context, but a hidden working row and an expanded tool
  // section are values the window is holding: nothing else would restore them.
  expect(sent.find((frame) => frame.type === "nativepi_tui_state")).toEqual({
    type: "nativepi_tui_state",
    state: {
      workingMessage: null,
      workingVisible: true,
      workingIndicator: null,
      hiddenThinkingLabel: null,
      toolsExpanded: false,
    },
  });
  expect(ui.getToolsExpanded()).toBe(false);
});
