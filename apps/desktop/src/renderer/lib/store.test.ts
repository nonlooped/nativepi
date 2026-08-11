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

  const [{ useAppStore }, { emptyConversation }] = await Promise.all([
    import("./store.ts"),
    import("./store/conversation.ts"),
  ]);
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
    conversations: {
      [session.path]: { ...emptyConversation(), projectDir: projectPath, sessionFile: session.path },
    },
  });

  const renaming = useAppStore.getState().renameChat(session.path, "Renamed instantly");
  expect(useAppStore.getState().sessionsByProject[projectPath]?.[0]?.name).toBe("Renamed instantly");
  finishRename({ ok: true });
  await renaming;

  const deleting = useAppStore.getState().deleteChat(session.path);
  expect(useAppStore.getState().sessionsByProject[projectPath]).toEqual([]);
  finishDelete({ ok: true });
  await deleting;
  expect(useAppStore.getState().conversations[session.path]).toBeUndefined();
});

test("switching chats releases settled transcripts but preserves live background runs", async () => {
  stubInvoke(async (channel) => (channel === "readSession" ? { entries: [] } : {}));
  const { useAppStore } = await import("./store.ts");
  const { emptyConversation } = await import("./store/conversation.ts");
  const projectPath = "C:\\conversation-memory";
  useAppStore.setState({
    activeProjectPath: projectPath,
    activeSessionFile: "old.jsonl",
    conversations: {
      "old.jsonl": { ...emptyConversation(), projectDir: projectPath, sessionFile: "old.jsonl", entries: Array(100).fill({ type: "custom" }) },
      "running.jsonl": { ...emptyConversation(), projectDir: projectPath, sessionFile: "running.jsonl", running: true },
    },
  });

  await useAppStore.getState().selectChat("next.jsonl");

  expect(useAppStore.getState().conversations["old.jsonl"]).toBeUndefined();
  expect(useAppStore.getState().conversations["running.jsonl"]?.running).toBeTrue();
  expect(useAppStore.getState().conversations["next.jsonl"]).toBeDefined();
});

test("the first message appears in the sidebar before the watcher refreshes", async () => {
  stubInvoke(async (channel) => {
    if (channel === "submit") return { ok: true, sessionFile: "C:\\new-sidebar\\chat.jsonl" };
    if (channel === "gitStatus") return { status: { isRepo: false, branch: "", ahead: 0, behind: 0, files: [] } };
    return {};
  });

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
    messageCount: 1,
  });

  useAppStore.getState().onEvent({
    projectDir: projectPath,
    sessionFile: "C:\\new-sidebar\\chat.jsonl",
    event: {
      type: "message_end",
      message: { role: "user", content: "Start this chat now", timestamp: Date.now() },
    },
  });
  expect(useAppStore.getState().sessionsByProject[projectPath]?.[0]?.messageCount).toBe(1);
});

test("Pi message events keep the sidebar summary current without a session rescan", async () => {
  stubInvoke(async (channel) => {
    if (channel === "listSessions") throw new Error("A local turn must not rescan session history");
    if (channel === "gitStatus") return { status: { isRepo: false, branch: "", ahead: 0, behind: 0, files: [] } };
    return {};
  });

  const { useAppStore } = await import("./store.ts");
  const projectPath = "C:\\live-sidebar";
  const sessionFile = "C:\\live-sidebar\\chat.jsonl";
  useAppStore.setState({
    activeProjectPath: projectPath,
    activeSessionFile: sessionFile,
    sessionsByProject: {
      [projectPath]: [{
        path: sessionFile,
        id: "chat",
        firstMessage: "First prompt",
        lastPrompt: "First prompt",
        providers: ["openai"],
        messageCount: 3,
        created: "2026-01-01T00:00:00.000Z",
        modified: "2026-01-01T00:00:00.000Z",
      }],
    },
    sessionLoadStates: { [projectPath]: "loaded" },
    conversations: {},
  });

  useAppStore.getState().onEvent({
    projectDir: projectPath,
    sessionFile,
    event: {
      type: "message_end",
      message: {
        role: "user",
        content: '<skill name="releasing">instructions</skill>\n\nShip it',
        timestamp: Date.parse("2026-02-01T00:00:00.000Z"),
      },
    },
  });
  useAppStore.getState().onEvent({
    projectDir: projectPath,
    sessionFile,
    event: {
      type: "message_end",
      message: {
        role: "assistant",
        content: [],
        provider: "anthropic",
        timestamp: Date.parse("2026-02-01T00:00:01.000Z"),
      },
    },
  });

  expect(useAppStore.getState().sessionsByProject[projectPath]?.[0]).toMatchObject({
    lastPrompt: "Ship it",
    providers: ["anthropic", "openai"],
    messageCount: 5,
    modified: "2026-02-01T00:00:01.000Z",
  });
});
