import { expect, test } from "bun:test";
import { stubInvoke } from "./testBridge.ts";
import { createPaneStore, releasePaneStore } from "../store.ts";
import { insertBrowserAnnotation } from "../browserAnnotations.ts";
import { annotationToken } from "../../../shared/browserAnnotation.ts";
import { emptyConversation } from "./conversation.ts";
const annotation = {
  version: 1 as const, id: "00000000-0000-4000-8000-000000000001", browser: "00000000-0000-4000-8000-000000000002", tab: "00000000-0000-4000-8000-000000000003",
  title: "Cart", url: "http://localhost:8080/cart", capturedAt: "2026-11-17T00:00:00.000Z",
  element: { selector: "button:nth-of-type(2)", tag: "button", text: "Buy", attributes: { "data-testid": "purchase" } },
};
const event = { target: { projectDir: "/project", sessionFile: "/session" }, annotation };
function setup() {
  const store = createPaneStore();
  store.setState({ activeProjectPath: "/project", activeSessionFile: "/session", drafts: { "/session": "Please change this" }, conversations: { "/session": emptyConversation() } });
  return store;
}
test("delivery after panel changes uses chat identity, retains other drafts and bounds multiple refs", () => {
  const store = setup();
  expect(insertBrowserAnnotation(store, event).added).toBe(true);
  expect(store.getState().drafts["/session"]).toBe(`Please change this\n${annotationToken(annotation)} `);
  store.setState({ activeSessionFile: "/other", drafts: { ...store.getState().drafts, "/other": "Other draft" } });
  expect(insertBrowserAnnotation(store, event).added).toBe(false);
  expect(store.getState().drafts["/other"]).toBe("Other draft");
  store.setState({ activeSessionFile: "/session" });
  for (let i = 1; i < 8; i++) expect(insertBrowserAnnotation(store, event).added).toBe(true);
  const full = store.getState().drafts["/session"];
  expect(insertBrowserAnnotation(store, event).error).toContain("eight");
  expect(store.getState().drafts["/session"]).toBe(full);
  expect(insertBrowserAnnotation(store, { ...event, annotation: { ...annotation, element: { value: "secret" } } }).added).toBe(false);
  releasePaneStore(store);
});
test("submit sends exact readable evidence and failed delivery restores the token draft with newer edits", async () => {
  const store = setup();
  insertBrowserAnnotation(store, event);
  const original = store.getState().drafts["/session"];
  let finish!: (result: unknown) => void;
  let message = "";
  stubInvoke(async (channel, raw) => {
    if (channel === "submit") { message = (raw as { message: string }).message; return new Promise(resolve => { finish = resolve; }); }
    return {};
  });
  const sending = store.getState().send();
  expect(message).toContain(JSON.stringify(annotation, null, 2));
  expect(message).not.toContain("[browser-element:");
  store.getState().setDraft("New follow-up");
  finish({ ok: false, error: "Disconnected" });
  await sending;
  expect(store.getState().drafts["/session"]).toBe(`${original!.trim()}\n\nNew follow-up`);
  releasePaneStore(store);
});
test("queued follow-ups send captured evidence through the existing enqueue interface", async () => {
  const store = setup();
  store.setState({ conversations: { "/session": { ...emptyConversation(), running: true } } });
  insertBrowserAnnotation(store, event);
  let delivered: unknown;
  stubInvoke(async (channel, raw) => { if (channel === "enqueue") { delivered = raw; return { ok: true }; } return {}; });
  await store.getState().enqueue("followUp");
  expect(delivered).toMatchObject({ behavior: "followUp", sessionFile: "/session" });
  expect((delivered as { message: string }).message).toContain(JSON.stringify(annotation, null, 2));
  expect(store.getState().drafts["/session"]).toBe("");
  releasePaneStore(store);
});
