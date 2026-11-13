import { expect, test } from "bun:test";
import { nativePiStateSchema } from "../../../shared/rpc-schema.ts";
import { stubInvoke } from "./testBridge.ts";

test("all pane dimensions persist through workspace initialization", async () => {
  let saved = nativePiStateSchema.parse({});
  stubInvoke(async (channel, params) => {
    if (channel === "saveState") {
      saved = nativePiStateSchema.parse((params as { state: unknown }).state);
      return { ok: true };
    }
    if (channel === "loadState") return saved;
    if (channel === "updateState") return { status: "unsupported", channel: "stable" };
    if (channel === "listProviders") return { providers: [] };
    return {};
  });
  const { useAppStore } = await import("../store.ts");
  const { flushPersist } = await import("./internals.ts");
  useAppStore.setState({ onUpdateState: () => {}, loadProviders: async () => {} });
  const state = useAppStore.getState();
  await state.init();
  state.setSidebarWidth(328);
  state.setContextPaneWidth(352);
  state.setTerminalHeight(296);
  await flushPersist(useAppStore.getState);
  expect(saved.panes).toMatchObject({ sidebarWidth: 328, contextPaneWidth: 352, terminalHeight: 296 });
  useAppStore.setState({ sidebarWidth: 304, contextPaneWidth: 304, terminalHeight: undefined });
  await state.init();
  expect(useAppStore.getState()).toMatchObject({ sidebarWidth: 328, contextPaneWidth: 352, terminalHeight: 296 });
  await flushPersist(useAppStore.getState);
});
