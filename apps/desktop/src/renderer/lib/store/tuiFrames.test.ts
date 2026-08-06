import { expect, test } from "bun:test";
import type { TuiHostFrame } from "../../../shared/tui-frames.ts";

import { stubInvoke } from "./testBridge.ts";

const { useAppStore } = await import("../store.ts");
const { onSurfaceWrite, surfaceBuffer } = await import("../tuiSurfaces.ts");
const { registerComposerInserter } = await import("../composerInsert.ts");

stubInvoke(async () => ({}));

function open(id: string, placement: TuiHostFrame extends never ? never : "overlay" | "footer" | "aboveEditor" | "timeline"): TuiHostFrame {
  return { type: "nativepi_tui_open", surface: { id, placement, key: id } };
}

test("a surface opened by the project on screen is mounted", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", extSurfaces: [] });

  useAppStore.getState().onTuiFrame({ projectDir: "A:\\proj-a", frame: open("s1", "overlay") });

  expect(useAppStore.getState().extSurfaces.map((surface) => surface.id)).toEqual(["s1"]);
});

test("a duplicate open preserves a mounted surface's write listener", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", extSurfaces: [] });
  const store = useAppStore.getState();
  const seen: string[] = [];
  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: open("s1", "footer") });
  const off = onSurfaceWrite("s1", (data) => seen.push(data));
  store.onTuiFrame({
    projectDir: "A:\\proj-a",
    frame: { type: "nativepi_tui_write", surfaceId: "s1", data: "$2.64" },
  });

  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: open("s1", "footer") });
  store.onTuiFrame({
    projectDir: "A:\\proj-a",
    frame: { type: "nativepi_tui_write", surfaceId: "s1", data: "$3.51" },
  });
  off();

  expect(surfaceBuffer("s1")).toBe("$2.64$3.51");
  expect(seen).toEqual(["$2.64", "$3.51"]);
});

test("a timeline surface retains its complete history", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", extSurfaces: [] });
  const store = useAppStore.getState();
  const output = "x".repeat(256 * 1024 + 1);

  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: open("timeline", "timeline") });
  store.onTuiFrame({
    projectDir: "A:\\proj-a",
    frame: { type: "nativepi_tui_write", surfaceId: "timeline", data: output },
  });

  expect(surfaceBuffer("timeline")).toBe(output);
});

test("a background project's surface is ignored", () => {
  // Same rule the extension dialogs follow: chrome belongs to the project the
  // user is looking at, and a footer for another one has nothing to attach to.
  useAppStore.setState({ activeProjectPath: "B:\\proj-b", extSurfaces: [] });

  useAppStore.getState().onTuiFrame({ projectDir: "A:\\proj-a", frame: open("s1", "footer") });

  expect(useAppStore.getState().extSurfaces).toEqual([]);
});

test("a blank chat accepts draft frames that carry no session file", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", activeSessionFile: null, extSurfaces: [] });

  useAppStore.getState().onTuiFrame({
    projectDir: "A:\\proj-a",
    frame: open("footer-draft", "footer"),
  });

  expect(useAppStore.getState().extSurfaces.map((surface) => surface.id)).toEqual(["footer-draft"]);
});

test("a blank chat rejects frames tagged for another session", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", activeSessionFile: null, extSurfaces: [] });

  useAppStore.getState().onTuiFrame({
    projectDir: "A:\\proj-a",
    sessionFile: "hidden-draft.jsonl",
    frame: open("footer-other", "footer"),
  });

  expect(useAppStore.getState().extSurfaces).toEqual([]);
});

test("a live timeline surface puts its entry into the transcript", () => {
  useAppStore.setState({
    activeProjectPath: "A:\\proj-a",
    activeSessionFile: "chat.jsonl",
    conversations: {},
    extSurfaces: [],
  });

  useAppStore.getState().onTuiFrame({
    projectDir: "A:\\proj-a",
    sessionFile: "chat.jsonl",
    frame: {
      type: "nativepi_tui_open",
      surface: { id: "notice-surface", placement: "timeline", key: "build-notice", entryId: "notice-1" },
    },
  });

  const entries = useAppStore.getState().conversations["chat.jsonl"]?.entries ?? [];
  expect(entries).toMatchObject([{ id: "notice-1", type: "custom_message", customType: "build-notice" }]);
  expect(useAppStore.getState().extSurfaces.map((surface) => surface.id)).toEqual(["notice-surface"]);
});

test("closing a surface unmounts it and forgets what it drew", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", extSurfaces: [] });
  const store = useAppStore.getState();

  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: open("s1", "aboveEditor") });
  store.onTuiFrame({
    projectDir: "A:\\proj-a",
    frame: { type: "nativepi_tui_write", surfaceId: "s1", data: "hello" },
  });
  expect(surfaceBuffer("s1")).toBe("hello");

  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: { type: "nativepi_tui_close", surfaceId: "s1" } });

  expect(useAppStore.getState().extSurfaces).toEqual([]);
  expect(surfaceBuffer("s1")).toBe("");
});

test("a Pi that exits takes its panes with it", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", extSurfaces: [], extTriggers: ["#"] });
  const store = useAppStore.getState();
  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: open("s1", "overlay") });

  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: { type: "nativepi_tui_reset" } });

  const state = useAppStore.getState();
  expect(state.extSurfaces).toEqual([]);
  expect(state.extTriggers).toEqual([]);
});

test("an extension paste goes to the caret, and to the end when there is none", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", drafts: {} });
  const store = useAppStore.getState();

  // No composer mounted: the store's own append is the only place text can go.
  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: { type: "nativepi_tui_paste", text: "at the end" } });
  expect(Object.values(useAppStore.getState().drafts)).toEqual(["at the end"]);

  const seen: string[] = [];
  const unregister = registerComposerInserter((text) => {
    seen.push(text);
    return true;
  });
  store.onTuiFrame({ projectDir: "A:\\proj-a", frame: { type: "nativepi_tui_paste", text: "#412" } });
  unregister();

  // `pasteToEditor` means where the user is writing, as it does in the terminal.
  expect(seen).toEqual(["#412"]);
  expect(Object.values(useAppStore.getState().drafts)).toEqual(["at the end"]);
});

test("a state patch changes only the fields it carries", () => {
  useAppStore.setState({
    activeProjectPath: "A:\\proj-a",
    extUiState: {
      workingMessage: "Thinking deeply",
      workingVisible: true,
      workingIndicator: null,
      hiddenThinkingLabel: null,
      toolsExpanded: false,
    },
  });

  useAppStore.getState().onTuiFrame({
    projectDir: "A:\\proj-a",
    frame: { type: "nativepi_tui_state", state: { workingVisible: false } },
  });

  const ui = useAppStore.getState().extUiState;
  expect(ui.workingVisible).toBe(false);
  expect(ui.workingMessage).toBe("Thinking deeply");
});

test("null in a state patch is a value, not an absence", () => {
  useAppStore.setState({
    activeProjectPath: "A:\\proj-a",
    extUiState: {
      workingMessage: "Thinking deeply",
      workingVisible: true,
      workingIndicator: { frames: ["a"], intervalMs: 90 },
      hiddenThinkingLabel: null,
      toolsExpanded: false,
    },
  });

  // `setWorkingMessage()` with no argument means "restore Pi's default wording",
  // which has to reach the window as a cleared field rather than be merged away.
  useAppStore.getState().onTuiFrame({
    projectDir: "A:\\proj-a",
    frame: { type: "nativepi_tui_state", state: { workingMessage: null, workingIndicator: null } },
  });

  const ui = useAppStore.getState().extUiState;
  expect(ui.workingMessage).toBeNull();
  expect(ui.workingIndicator).toBeNull();
});
