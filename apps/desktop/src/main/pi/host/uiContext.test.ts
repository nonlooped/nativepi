import { expect, test } from "bun:test";
import type { Component } from "@earendil-works/pi-tui";
import type { AgentSession, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
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
  const notices: { message: string; type: string }[] = [];
  const base = {
    theme: {},
    notify: (message: string, type: string) => notices.push({ message, type }),
    setWidget: (key: string, content: unknown) => widgets.push({ key, content }),
    setStatus: () => {},
  } as unknown as ExtensionUIContext;

  const ui = withTerminalUi(base, { send: (frame) => sent.push(frame) });
  const internals = hostInternals(ui);
  if (!internals) throw new Error("the wrapper did not install its hooks");
  return { ui, sent, widgets, notices, internals };
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

test("custom components replace the editor unless they explicitly request an overlay", async () => {
  const { ui, sent, internals } = harness();

  await ui.custom((_tui, _theme, _keybindings, done) => {
    done(undefined);
    return stubComponent();
  });

  await ui.custom(
    (_tui, _theme, _keybindings, done) => {
      done(undefined);
      return stubComponent();
    },
    { overlay: true },
  );

  expect(sent.filter((frame) => frame.type === "nativepi_tui_open")).toMatchObject([
    { surface: { placement: "editor" } },
    { surface: { placement: "overlay" } },
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

test("registered Pi entry renderers open durable transcript surfaces", () => {
  const { sent, internals } = harness();
  const entry = {
    type: "custom" as const,
    id: "recap-1",
    parentId: null,
    timestamp: new Date().toISOString(),
    customType: "summary-recap",
    data: { recap: "Done" },
  };
  const session = {
    sessionManager: { getBranch: () => [entry] },
    extensionRunner: {
      getEntryRenderer: (customType: string) =>
        customType === "summary-recap" ? () => stubComponent() : undefined,
      getMessageRenderer: () => undefined,
    },
    subscribe: () => () => {},
  } as unknown as AgentSession;

  internals.bindSession(session);

  expect(sent.find((frame) => frame.type === "nativepi_tui_open")).toMatchObject({
    surface: { placement: "timeline", entryId: "recap-1", key: "summary-recap" },
  });
  internals.dispose();
});

test("a live custom message opens its terminal renderer after Pi persists it", async () => {
  const { sent, internals } = harness();
  const entry = {
    type: "custom_message" as const,
    id: "notice-1",
    parentId: null,
    timestamp: new Date().toISOString(),
    customType: "build-notice",
    content: "Build finished",
    display: true,
  };
  let branch: typeof entry[] = [];
  let notify: (event: { type: string; message?: { role?: string } }) => void = () => {};
  const session = {
    sessionManager: { getBranch: () => branch },
    extensionRunner: {
      getEntryRenderer: () => undefined,
      getMessageRenderer: (customType: string) =>
        customType === "build-notice" ? () => stubComponent() : undefined,
    },
    subscribe: (handler: typeof notify) => {
      notify = handler;
      return () => {};
    },
  } as unknown as AgentSession;

  internals.bindSession(session);
  // AgentSession emits message_end before appendCustomMessageEntry(), which was
  // why this renderer previously waited for another append or a re-open.
  notify({ type: "message_end", message: { role: "custom" } });
  branch = [entry];
  await Promise.resolve();

  expect(sent.find((frame) => frame.type === "nativepi_tui_open")).toMatchObject({
    surface: { placement: "timeline", entryId: "notice-1", key: "build-notice" },
  });
  internals.dispose();
});

test("a malformed persisted entry does not stop the session from binding", () => {
  const { sent, notices, internals } = harness();
  const entry = {
    type: "custom" as const,
    id: "recap-1",
    parentId: null,
    timestamp: new Date().toISOString(),
    customType: "summary-recap",
    data: { unexpected: true },
  };
  const session = {
    sessionManager: { getBranch: () => [entry] },
    extensionRunner: {
      getEntryRenderer: () => () => {
        throw new Error("expected a recap string");
      },
      getMessageRenderer: () => undefined,
    },
    subscribe: () => () => {},
  } as unknown as AgentSession;

  expect(() => internals.bindSession(session)).not.toThrow();
  expect(sent.find((frame) => frame.type === "nativepi_tui_open")).toBeUndefined();
  expect(notices).toEqual([{ message: "Extension entry failed: expected a recap string", type: "error" }]);
  internals.dispose();
});

test("an entry rewound off the branch takes its transcript surface with it", () => {
  const { sent, internals } = harness();
  const entry = (id: string) => ({
    type: "custom" as const,
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
    customType: "summary-recap",
    data: {},
  });

  let branch = [entry("recap-1")];
  let notify: (event: { type: string; entry: unknown }) => void = () => {};
  const session = {
    sessionManager: { getBranch: () => branch },
    extensionRunner: {
      getEntryRenderer: () => () => stubComponent(),
      getMessageRenderer: () => undefined,
    },
    subscribe: (handler: typeof notify) => {
      notify = handler;
      return () => {};
    },
  } as unknown as AgentSession;

  internals.bindSession(session);
  const opened = sent.find((frame) => frame.type === "nativepi_tui_open");
  const surfaceId = opened?.type === "nativepi_tui_open" ? opened.surface.id : undefined;

  // A fork replaces the branch. Pi only announces the append, so the entry that
  // is no longer there has to be noticed rather than waited for.
  branch = [entry("recap-2")];
  notify({ type: "entry_appended", entry: branch[0] });

  expect(sent.filter((frame) => frame.type === "nativepi_tui_close")).toMatchObject([
    { surfaceId },
  ]);
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
