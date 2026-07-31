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

test("a Pi error in an inactive project lands on that project's conversation", () => {
  useAppStore.setState({ activeProjectPath: "B:\\proj-b", conversations: {} });

  useAppStore.getState().onPiError("A:\\proj-a", "Pi crashed");

  const conv = useAppStore.getState().conversations["A:\\proj-a"];
  expect(conv?.error).toBe("Pi crashed");
  expect(conv?.errorRecovery).toBe("restartPi");
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
