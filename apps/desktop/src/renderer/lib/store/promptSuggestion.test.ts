import { expect, test } from "bun:test";
import { emptyConversation, offeredPromptSuggestion } from "./conversation.ts";
import { nativePiStateSchema } from "../../../shared/rpc-schema.ts";
import { useAppStore } from "../store.ts";
import { stubInvoke } from "./testBridge.ts";

function conversation() {
  return { ...emptyConversation(), promptSuggestion: { text: "Add regression coverage", timestamp: 2 }, entries: [
    { type: "message", id: "answer", parentId: null, timestamp: "2026-11-14T00:00:00Z", message: { role: "assistant", content: [], timestamp: 2 } },
  ] } as ReturnType<typeof emptyConversation>;
}

test("only offers predictions for the latest completed answer", () => {
  const c = conversation();
  expect(offeredPromptSuggestion(c)).toBe("Add regression coverage");
  for (const patch of [
    { running: true }, { compacting: true }, { aborted: true }, { error: "Offline" },
    { externalChange: { sessionFile: "a" } }, { queue: { steering: [], followUp: ["next"] } },
    { promptSuggestion: { text: "Old reply", timestamp: 1 } }, { entries: [] },
  ]) expect(offeredPromptSuggestion({ ...c, ...patch })).toBeNull();
  const last = c.entries[0]!;
  expect(offeredPromptSuggestion({ ...c, entries: [...c.entries, { ...last, message: { role: "user", content: "next", timestamp: 3 } }] })).toBeNull();
});

test("old preferences default to off; disabling drops all ephemeral suggestions", () => {
  expect(nativePiStateSchema.parse({}).preferences.promptSuggestions).toBe(false);
  stubInvoke(async () => ({ ok: true }));
  useAppStore.setState({ preferences: { ...useAppStore.getState().preferences, promptSuggestions: true }, conversations: { a: conversation(), b: conversation() } });
  useAppStore.getState().setPreference("promptSuggestions", false);
  expect(useAppStore.getState().preferences.promptSuggestions).toBe(false);
  expect(Object.values(useAppStore.getState().conversations).every(c => c.promptSuggestion === undefined)).toBe(true);
});
