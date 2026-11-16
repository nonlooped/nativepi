import { expect, test } from "bun:test";
import { createPaneStore, releasePaneStore } from "../store.ts";
import { restorePaneSelection } from "../paneArrangement.ts";

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
