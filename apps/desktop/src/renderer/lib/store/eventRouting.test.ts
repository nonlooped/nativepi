import { expect, test } from "bun:test";
import type { PiEvent } from "../../../shared/pi-types.ts";

import { stubInvoke } from "./testBridge.ts";

const { useAppStore } = await import("../store.ts");
const { emptyConversation } = await import("./conversation.ts");
const { getLastChat } = await import("./internals.ts");

function event(type: string): PiEvent {
  return { type } as PiEvent;
}

test("events from an inactive project fold into that project's own conversation", () => {
  useAppStore.setState({ activeProjectPath: "B:\\proj-b", conversations: {} });

  useAppStore.getState().onEvent({ projectDir: "A:\\proj-a", event: event("agent_start") });

  const s = useAppStore.getState();
  expect(s.conversations["A:\\proj-a"]?.running).toBe(true);
  expect(s.conversations["B:\\proj-b"]).toBeUndefined();
});

test("completion in an inactive project is not lost", () => {
  useAppStore.setState({ activeProjectPath: "B:\\proj-b", conversations: {} });

  useAppStore.getState().onEvent({ projectDir: "A:\\proj-a", event: event("agent_start") });
  useAppStore.getState().onEvent({ projectDir: "A:\\proj-a", event: event("agent_settled") });

  expect(useAppStore.getState().conversations["A:\\proj-a"]?.running).toBe(false);
});

test("coalesced display deltas commit in one conversation update", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", conversations: {} });
  useAppStore.getState().onEvent({
    projectDir: "A:\\proj-a",
    event: { type: "message_start", message: { role: "assistant", content: [], timestamp: 1 } },
  });

  useAppStore.getState().onEvent({
    projectDir: "A:\\proj-a",
    event: {
      type: "nativepi_event_batch",
      events: [
        { type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } },
        { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello" } },
        { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: " world" } },
      ],
    },
  });

  expect(useAppStore.getState().conversations["A:\\proj-a"]?.streaming?.content).toEqual([
    { type: "text", text: "Hello world" },
  ]);
});

test("a Pi error in an inactive project lands on that project's conversation", () => {
  useAppStore.setState({ activeProjectPath: "B:\\proj-b", conversations: {} });

  useAppStore.getState().onPiError("A:\\proj-a", "Pi crashed");

  const conv = useAppStore.getState().conversations["A:\\proj-a"];
  expect(conv?.error).toBe("Pi crashed");
  expect(conv?.errorRecovery).toBe("restartPi");
});

test("an extension confirmation from an inactive project remains available", () => {
  useAppStore.setState({ activeProjectPath: "B:\\proj-b", extensionPromptsByProject: {}, extPrompts: [] });

  useAppStore.getState().onEvent({
    projectDir: "A:\\proj-a",
    event: { type: "extension_ui_request", id: "confirm-1", method: "confirm", title: "Deploy?", message: "Proceed?" },
  });

  expect(useAppStore.getState().extensionPromptsByProject["A:\\proj-a"]?.[0]?.method).toBe("confirm");
  expect(useAppStore.getState().extPrompts).toEqual([]);
});

test("ANSI-styled extension statuses are safe to render as native text", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", activeSessionFile: null, extStatuses: {} });

  useAppStore.getState().onEvent({
    projectDir: "A:\\proj-a",
    event: {
      type: "extension_ui_request",
      id: "status-ansi",
      method: "setStatus",
      statusKey: "subagents",
      statusText: "\u001b[38;2;125;133;144msubagents\u001b[39m · \u001b[38;2;47;129;247m1 running\u001b[39m",
    },
  });

  expect(useAppStore.getState().extStatuses.subagents).toBe("subagents · 1 running");
});

test("non-prompt extension UI from an inactive project cannot alter the active project", () => {
  useAppStore.setState({
    activeProjectPath: "B:\\proj-b",
    activeSessionFile: "b.jsonl",
    drafts: { "b.jsonl": "Keep this draft" },
    extStatuses: { current: "B status" },
  });

  useAppStore.getState().onEvent({
    projectDir: "A:\\proj-a",
    event: { type: "extension_ui_request", id: "editor-1", method: "set_editor_text", text: "Overwrite" },
  });
  useAppStore.getState().onEvent({
    projectDir: "A:\\proj-a",
    event: { type: "extension_ui_request", id: "status-1", method: "setStatus", statusKey: "current", statusText: "A status" },
  });

  expect(useAppStore.getState().drafts["b.jsonl"]).toBe("Keep this draft");
  expect(useAppStore.getState().extStatuses).toEqual({ current: "B status" });
});

test("agent_end keeps a turn running until it settles", () => {
  useAppStore.setState({ activeProjectPath: "A:\\proj-a", conversations: {} });

  useAppStore.getState().onEvent({ projectDir: "A:\\proj-a", event: event("agent_start") });
  const startedAt = useAppStore.getState().conversations["A:\\proj-a"]?.runStartedAt;
  useAppStore.getState().onEvent({ projectDir: "A:\\proj-a", event: event("agent_end") });

  const conversation = useAppStore.getState().conversations["A:\\proj-a"];
  expect(conversation?.running).toBe(true);
  expect(conversation?.runStartedAt).toBe(startedAt);
});

test("events from parallel chats keep their own runtime state", () => {
  useAppStore.setState({
    activeProjectPath: "A:\\proj-a",
    conversations: {},
  });
  useAppStore.getState().onEvent({
    projectDir: "A:\\proj-a",
    sessionFile: "one.jsonl",
    event: event("agent_start"),
  });
  useAppStore.getState().onEvent({
    projectDir: "A:\\proj-a",
    sessionFile: "other.jsonl",
    event: event("agent_start"),
  });

  expect(useAppStore.getState().conversations["one.jsonl"]?.running).toBe(true);
  expect(useAppStore.getState().conversations["other.jsonl"]?.running).toBe(true);
});

test("a new chat starts without the previous chat's extension footer", () => {
  useAppStore.setState({
    activeProjectPath: "A:\\proj-a",
    activeSessionFile: "old.jsonl",
    extStatuses: { usage: "$2.64" },
    extSurfaces: [{ id: "footer-old", placement: "footer", key: "Footer" }],
  });

  useAppStore.getState().newChat();

  const state = useAppStore.getState();
  expect(state.extStatuses).toEqual({});
  expect(state.extSurfaces).toEqual([]);
});

test("a new session is remembered when submit returns after switching projects", async () => {
  let finishSubmit!: (response: { ok: true; sessionFile: string }) => void;
  stubInvoke(async (channel) => {
    if (channel === "submit") {
      return new Promise((resolve) => {
        finishSubmit = resolve as (response: { ok: true; sessionFile: string }) => void;
      });
    }
    return {};
  });
  useAppStore.setState({
    activeProjectPath: "A:\\delayed-submit",
    activeSessionFile: null,
    conversations: {},
    drafts: {},
  });
  useAppStore.getState().setDraft("Start a new session");

  const sending = useAppStore.getState().send();
  useAppStore.setState({ activeProjectPath: "B:\\other-project", activeSessionFile: "other.jsonl" });
  finishSubmit({ ok: true, sessionFile: "new.jsonl" });
  await sending;

  expect(getLastChat("A:\\delayed-submit")).toBe("new.jsonl");
});

test("an extension prompt response returns to the chat that asked", () => {
  const responses: unknown[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "extensionRespond") responses.push(params);
    return { ok: true };
  });
  useAppStore.setState({
    activeProjectPath: "A:\\project",
    activeSessionFile: "visible.jsonl",
    extensionPromptsByProject: {},
    extPrompts: [],
  });
  useAppStore.getState().onEvent({
    projectDir: "A:\\project",
    sessionFile: "background.jsonl",
    event: { type: "extension_ui_request", id: "confirm-bg", method: "confirm", title: "Deploy?", message: "Proceed?" },
  });

  useAppStore.getState().respondExtension({ confirmed: true });

  expect(responses).toContainEqual(expect.objectContaining({
    projectDir: "A:\\project",
    sessionFile: "background.jsonl",
  }));
});

test("a Pi error clears the originating background chat, not the visible chat", () => {
  useAppStore.setState({
    activeProjectPath: "A:\\project",
    activeSessionFile: "visible.jsonl",
    conversations: {
      "visible.jsonl": { ...emptyConversation(), projectDir: "A:\\project", sessionFile: "visible.jsonl", running: true },
      "background.jsonl": { ...emptyConversation(), projectDir: "A:\\project", sessionFile: "background.jsonl", running: true },
    },
  });

  useAppStore.getState().onPiError("A:\\project", "Pi crashed", "background.jsonl");

  expect(useAppStore.getState().conversations["background.jsonl"]?.running).toBe(false);
  expect(useAppStore.getState().conversations["visible.jsonl"]?.running).toBe(true);
});

test("a cold submit merges events that arrive before its session binding", async () => {
  let finishSubmit!: (response: { ok: true; sessionFile: string }) => void;
  stubInvoke(async (channel) => {
    if (channel === "submit") {
      return new Promise((resolve) => {
        finishSubmit = resolve as (response: { ok: true; sessionFile: string }) => void;
      });
    }
    return {};
  });
  useAppStore.setState({
    activeProjectPath: "A:\\cold-submit",
    activeSessionFile: null,
    conversations: {},
    drafts: {},
    attachments: {},
  });
  useAppStore.getState().setDraft("Hello");

  const sending = useAppStore.getState().send();
  useAppStore.getState().onEvent({
    projectDir: "A:\\cold-submit",
    sessionFile: "new.jsonl",
    event: {
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "Early answer" }], timestamp: 1 },
    },
  });
  finishSubmit({ ok: true, sessionFile: "new.jsonl" });
  await sending;

  expect(useAppStore.getState().conversations["new.jsonl"]?.entries).toContainEqual(
    expect.objectContaining({ message: expect.objectContaining({ role: "assistant" }) }),
  );
});

test("a cold submit carries text typed while binding into the new session", async () => {
  let finishSubmit!: (response: { ok: true; sessionFile: string }) => void;
  stubInvoke(async (channel) => {
    if (channel === "submit") return new Promise((resolve) => (finishSubmit = resolve as typeof finishSubmit));
    return {};
  });
  useAppStore.setState({
    activeProjectPath: "A:\\cold-draft",
    activeSessionFile: null,
    conversations: {},
    drafts: {},
    attachments: {},
  });
  useAppStore.getState().setDraft("First");

  const sending = useAppStore.getState().send();
  useAppStore.getState().setDraft("Second");
  finishSubmit({ ok: true, sessionFile: "new.jsonl" });
  await sending;

  expect(useAppStore.getState().drafts["new.jsonl"]).toBe("Second");
});

test("an older cold submit cannot capture a newer blank chat", async () => {
  let finishSubmit!: (response: { ok: true; sessionFile: string }) => void;
  stubInvoke(async (channel) => {
    if (channel === "submit") return new Promise((resolve) => (finishSubmit = resolve as typeof finishSubmit));
    return {};
  });
  useAppStore.setState({
    activeProjectPath: "A:\\cold-navigation",
    activeSessionFile: null,
    conversations: {},
    drafts: {},
    attachments: {},
  });
  useAppStore.getState().newChat();
  useAppStore.getState().setDraft("First");

  const sending = useAppStore.getState().send();
  useAppStore.getState().newChat();
  useAppStore.getState().setDraft("Second");
  finishSubmit({ ok: true, sessionFile: "first.jsonl" });
  await sending;

  expect(useAppStore.getState().activeSessionFile).toBeNull();
  expect(useAppStore.getState().drafts["new:A:\\cold-navigation"]).toBe("Second");
});

test("a failed send restores its message without destroying newer text", async () => {
  let finishSubmit!: (response: { ok: false; error: string }) => void;
  stubInvoke(async (channel) => {
    if (channel === "submit") return new Promise((resolve) => (finishSubmit = resolve as typeof finishSubmit));
    return {};
  });
  useAppStore.setState({
    activeProjectPath: "A:\\failed-send",
    activeSessionFile: "chat.jsonl",
    conversations: {},
    drafts: { "chat.jsonl": "First" },
    attachments: {},
  });

  const sending = useAppStore.getState().send();
  useAppStore.getState().setDraft("Second");
  finishSubmit({ ok: false, error: "Rejected" });
  await sending;

  expect(useAppStore.getState().drafts["chat.jsonl"]).toBe("First\n\nSecond");
});

test("a rejected submit transport also restores the draft", async () => {
  stubInvoke(async (channel) => {
    if (channel === "submit") throw new Error("Disconnected");
    return {};
  });
  useAppStore.setState({
    activeProjectPath: "A:\\rejected-send",
    activeSessionFile: "chat.jsonl",
    conversations: {},
    drafts: { "chat.jsonl": "Keep me" },
    attachments: {},
  });

  await useAppStore.getState().send();

  expect(useAppStore.getState().drafts["chat.jsonl"]).toBe("Keep me");
  expect(useAppStore.getState().conversations["chat.jsonl"]?.error).toBe("Disconnected");
});

test("abort reaches a cold submit before its session file is known", async () => {
  let finishSubmit!: (response: { ok: true; sessionFile: string }) => void;
  const aborts: unknown[] = [];
  stubInvoke(async (channel, params) => {
    if (channel === "submit") return new Promise((resolve) => (finishSubmit = resolve as typeof finishSubmit));
    if (channel === "abort") aborts.push(params);
    return {};
  });
  useAppStore.setState({
    activeProjectPath: "A:\\cold-abort",
    activeSessionFile: null,
    conversations: {},
    drafts: {},
    attachments: {},
  });
  useAppStore.getState().setDraft("Stop me");

  const sending = useAppStore.getState().send();
  useAppStore.getState().abort();
  expect(aborts).toEqual([{ projectDir: "A:\\cold-abort", sessionFile: null }]);
  finishSubmit({ ok: true, sessionFile: "new.jsonl" });
  await sending;
});

test("reopening the same session preserves a background failure", async () => {
  stubInvoke(async (channel) => (channel === "readSession" ? { entries: [] } : {}));
  useAppStore.setState({
    activeProjectPath: "A:\\failed-run",
    activeSessionFile: null,
    conversations: {
      "failed.jsonl": {
        ...emptyConversation(),
        sessionFile: "failed.jsonl",
        error: "Pi crashed",
        errorRecovery: "restartPi",
      },
    },
  });

  await useAppStore.getState().selectChat("failed.jsonl");

  const conv = useAppStore.getState().conversations["failed.jsonl"];
  expect(conv?.error).toBe("Pi crashed");
  expect(conv?.errorRecovery).toBe("restartPi");
});

test("switching chats clears controls until that session state arrives", async () => {
  stubInvoke(async (channel) => (channel === "readSession" ? { entries: [] } : {}));
  useAppStore.setState({
    activeProjectPath: "A:\\controls",
    activeSessionFile: "old.jsonl",
    model: { provider: "test", id: "old", name: "Old", contextWindow: 1 },
    models: [{ provider: "test", id: "old", name: "Old", contextWindow: 1 }],
    thinkingLevel: "high",
    thinkingLevels: ["off", "high"],
    trust: null,
    conversations: {},
  });

  await useAppStore.getState().selectChat("new.jsonl");

  expect(useAppStore.getState().model).toBeUndefined();
  expect(useAppStore.getState().thinkingLevel).toBe("off");
});

test("delayed history cannot overwrite messages streamed while it loads", async () => {
  let finishRead!: (response: { entries: [] }) => void;
  stubInvoke(async (channel) => {
    if (channel === "readSession") return new Promise((resolve) => (finishRead = resolve as typeof finishRead));
    return {};
  });
  useAppStore.setState({
    activeProjectPath: "A:\\history-race",
    activeSessionFile: null,
    conversations: {},
    trust: null,
  });

  const selecting = useAppStore.getState().selectChat("chat.jsonl");
  useAppStore.getState().onEvent({
    projectDir: "A:\\history-race",
    sessionFile: "chat.jsonl",
    event: {
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "Live" }], timestamp: 1 },
    },
  });
  finishRead({ entries: [] });
  await selecting;

  expect(useAppStore.getState().conversations["chat.jsonl"]?.entries).toHaveLength(1);
});
