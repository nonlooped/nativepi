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

test("sending an inline skill preserves the pending draft and restores it on failure", async () => {
  const draft = "Look into /skill:choreograph here\n\nKeep this paragraph.";
  ready(draft);
  let submitted: unknown;
  stubInvoke(async (channel, params) => {
    if (channel !== "submit") return {};
    submitted = params;
    expect(useAppStore.getState().conversations[A]?.pending[0]?.text).toBe(draft);
    return { ok: false, error: "Unavailable" };
  });
  await useAppStore.getState().send();
  expect(submitted).toMatchObject({ message: `/skill:choreograph ${draft}` });
  expect(useAppStore.getState().drafts[key]).toBe(draft);
});

test("queued skills use the same invocation while failed queues restore the original draft", async () => {
  const draft = "Use /skill:choreograph here";
  ready(draft);
  useAppStore.setState({ activeSessionFile: "session" });
  useAppStore.getState().setDraft(draft);
  let submitted: unknown;
  stubInvoke(async (channel, params) => {
    if (channel !== "enqueue") return {};
    submitted = params;
    return { ok: false, error: "Unavailable" };
  });
  await useAppStore.getState().enqueue("followUp");
  expect(submitted).toMatchObject({ message: `/skill:choreograph ${draft}`, behavior: "followUp" });
  expect(useAppStore.getState().drafts.session).toBe(draft);
});
