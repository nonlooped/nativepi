import { expect, test } from "bun:test";
import { createPaneStore, releasePaneStore } from "../store.ts";
import { paneArrangementSchema, restorePaneSelection } from "../paneArrangement.ts";

test("startup restoration respects the Work preference for every pane while preserving Chat", async () => {
  const stores = [createPaneStore(), createPaneStore()];
  try {
    for (const store of stores) {
      store.setState({ reopenLastProject: false, chatRoot: "/chat", activeProjectPath: null, activeSessionFile: null,
        selectChat: async (session, project) => { store.setState({ activeProjectPath: project, activeSessionFile: session }); },
        selectProject: async project => { store.setState({ activeProjectPath: project, activeSessionFile: "remembered" }); },
      });
    }
    await restorePaneSelection(stores[0]!, { project: "/work-project", session: "saved" });
    await restorePaneSelection(stores[1]!, { project: "/other-project", session: null });
    expect(stores.map(store => store.getState().activeProjectPath)).toEqual([null, null]);
    stores[0]!.setState({ reopenLastProject: true });
    await restorePaneSelection(stores[0]!, { project: "/work-project", session: "saved" });
    expect(stores[0]!.getState()).toMatchObject({ activeProjectPath: "/work-project", activeSessionFile: "saved" });
    await restorePaneSelection(stores[1]!, { project: "/chat", session: "chat-session" });
    expect(stores[1]!.getState()).toMatchObject({ activeProjectPath: "/chat", activeSessionFile: "chat-session" });
  } finally { stores.forEach(releasePaneStore); }
});


test("corrupt tab metadata cannot destroy a valid pane arrangement, and stale active ids fall back to an open tab", () => {
  const base = { orientation: "horizontal", active: 0, panes: [{ project: "/project", session: "a", tabs: { work: { tabs: [{ kind: "unknown" }], active: "stale" } } }] };
  const restored = paneArrangementSchema.parse(base);
  expect(restored.panes[0]).toEqual({ project: "/project", session: "a", tabs: {} });
  const clean = paneArrangementSchema.parse({ ...base, panes: [{ project: "/project", session: "a", tabs: { work: { tabs: [{ kind: "thread", projectDir: "/project", session: "a" }, { kind: "thread", projectDir: "/project", session: "a" }], active: "missing" } } }] });
  expect(clean.panes[0]?.tabs?.work).toEqual({ tabs: [{ kind: "thread", session: "a", projectDir: "/project" }], active: '["thread","/project","a"]' });
});
