import { expect, test } from "bun:test";

import { stubInvoke } from "./testBridge.ts";

const { useAppStore } = await import("../store.ts");

const A = "A:\\proj-a";
const key = `new:${A}`;

function ready(draft: string): void {
  useAppStore.setState({ activeProjectPath: A, activeSessionFile: null, conversations: {}, drafts: { [key]: draft } });
  stubInvoke(async (channel) => (channel === "submit" ? { ok: true } : {}));
}

test("a slash command gets no optimistic bubble to strand", async () => {
  // An extension command can run and finish without Pi ever echoing a user
  // message, and a bubble waiting for that echo would spin forever.
  ready("/rename something");

  await useAppStore.getState().send();

  const conv = useAppStore.getState().conversations[A];
  expect(conv?.pending).toEqual([]);
  expect(conv?.runStartedAt).toBeNull();
});

test("an ordinary message still shows while it is being sent", async () => {
  ready("look at this");

  await useAppStore.getState().send();

  const conv = useAppStore.getState().conversations[A];
  expect(conv?.pending.map((p) => p.text)).toEqual(["look at this"]);
  expect(conv?.runStartedAt).not.toBeNull();
});
