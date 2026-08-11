import { expect, test } from "bun:test";
import { stubInvoke } from "./store/testBridge.ts";

const responses: Record<string, unknown> = {
  setModel: { ok: true },
  getThinkingLevels: { levels: ["low", "medium", "high"] },
};

test("selecting a model loads only its supported reasoning levels", async () => {
  stubInvoke(async (channel) => responses[channel] ?? {});
  const { useAppStore } = await import("./store.ts");
  useAppStore.setState({ activeProjectPath: "C:\\project" });

  await useAppStore.getState().setModel({ provider: "xai", id: "grok-4.5", name: "Grok 4.5", reasoning: true });

  expect(useAppStore.getState().thinkingLevels).toEqual(["low", "medium", "high"]);

  useAppStore.setState({ thinkingLevel: "high" });
  await useAppStore.getState().cycleThinkingLevel();
  expect(useAppStore.getState().thinkingLevel).toBe("low");
});

test("chat history exposes a retryable failure before an empty successful load", async () => {
  let fail = true;
  stubInvoke(async (channel) => {
    if (channel !== "listSessions") return {};
    if (fail) throw new Error("session list unavailable");
    return { sessions: [] };
  });

  const { useAppStore } = await import("./store.ts");
  const projectPath = "C:\\project-without-chats";
  useAppStore.setState({ sessionLoadStates: {}, sessionsByProject: {} });

  await useAppStore.getState().refreshSessions(projectPath);
  expect(useAppStore.getState().sessionLoadStates[projectPath]).toBe("failed");

  fail = false;
  await useAppStore.getState().refreshSessions(projectPath);
  expect(useAppStore.getState().sessionLoadStates[projectPath]).toBe("loaded");
  expect(useAppStore.getState().sessionsByProject[projectPath]).toEqual([]);
});

test("selecting a project ignores a remembered chat outside its session list", async () => {
  const projectPath = "C:\\project-with-stale-chat";
  const staleSession = "C:\\sessions\\stale.jsonl";
  const reads: string[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "listSessions") return { sessions: [] };
    if (channel === "readSession") {
      reads.push((params as { sessionFile: string }).sessionFile);
      return { entries: [] };
    }
    if (channel === "checkTrust") return { required: true, trusted: false };
    return {};
  });

  const [{ useAppStore }, { replaceLastChats }] = await Promise.all([
    import("./store.ts"),
    import("./store/internals.ts"),
  ]);
  replaceLastChats({ [projectPath]: staleSession });

  await useAppStore.getState().selectProject(projectPath);

  expect(reads).toEqual([]);
  expect(useAppStore.getState().activeSessionFile).toBeNull();
  expect(useAppStore.getState().isNewChat).toBeTrue();
});

test("local sidebar mutations do not wait for a session rescan", async () => {
  let finishRename!: (response: { ok: true }) => void;
  let finishDelete!: (response: { ok: true }) => void;
  stubInvoke(async (channel) => {
    if (channel === "renameChat") return new Promise((resolve) => { finishRename = resolve as (response: { ok: true }) => void; });
    if (channel === "deleteChat") return new Promise((resolve) => { finishDelete = resolve as (response: { ok: true }) => void; });
    if (channel === "listSessions") throw new Error("The sidebar should not rescan for a local mutation");
    return {};
  });

  const { useAppStore } = await import("./store.ts");
  const projectPath = "C:\\instant-sidebar";
  const session = {
    path: "C:\\instant-sidebar\\chat.jsonl",
    id: "chat",
    name: "Original name",
    firstMessage: "First prompt",
    lastPrompt: "First prompt",
    providers: [],
    messageCount: 1,
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
  };
  useAppStore.setState({
    activeProjectPath: projectPath,
    activeSessionFile: session.path,
    sessionsByProject: { [projectPath]: [session] },
    sessionLoadStates: { [projectPath]: "loaded" },
  });

  const renaming = useAppStore.getState().renameChat(session.path, "Renamed instantly");
  expect(useAppStore.getState().sessionsByProject[projectPath]?.[0]?.name).toBe("Renamed instantly");
  finishRename({ ok: true });
  await renaming;

  const deleting = useAppStore.getState().deleteChat(session.path);
  expect(useAppStore.getState().sessionsByProject[projectPath]).toEqual([]);
  finishDelete({ ok: true });
  await deleting;
});

test("the first message appears in the sidebar before the watcher refreshes", async () => {
  stubInvoke(async (channel) => (channel === "submit" ? { ok: true, sessionFile: "C:\\new-sidebar\\chat.jsonl" } : {}));

  const { useAppStore } = await import("./store.ts");
  const projectPath = "C:\\new-sidebar";
  useAppStore.setState({
    activeProjectPath: projectPath,
    activeSessionFile: null,
    isNewChat: true,
    sessionsByProject: { [projectPath]: [] },
    sessionLoadStates: { [projectPath]: "loaded" },
    conversations: {},
    drafts: {},
    attachments: {},
  });
  useAppStore.getState().setDraft("Start this chat now");

  await useAppStore.getState().send();

  expect(useAppStore.getState().sessionsByProject[projectPath]?.[0]).toMatchObject({
    path: "C:\\new-sidebar\\chat.jsonl",
    firstMessage: "Start this chat now",
  });
});
