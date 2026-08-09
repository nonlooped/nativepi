import { expect, test } from "bun:test";

test("one broken extension event listener does not block the next listener", async () => {
  Reflect.set(globalThis, "window", { location: { hash: "", protocol: "http:", host: "localhost" } });
  const { dispatchExtensionEvent, subscribeToExtension } = await import("./extensionHost.ts");
  const calls: string[] = [];
  const unsubscribeBroken = subscribeToExtension("@acme/ext", () => {
    throw new Error("listener failed");
  });
  const unsubscribeWorking = subscribeToExtension("@acme/ext", (event, payload) => {
    calls.push(`${event}:${JSON.stringify(payload)}`);
  });
  const originalError = console.error;
  console.error = () => {};

  try {
    expect(() => dispatchExtensionEvent("@acme/ext", "changed", { count: 1 })).not.toThrow();
  } finally {
    console.error = originalError;
    unsubscribeBroken();
    unsubscribeWorking();
  }

  expect(calls).toEqual(['changed:{"count":1}']);
});

test("renderer definitions are rejected before contribution code can run", async () => {
  Reflect.set(globalThis, "window", { location: { hash: "", protocol: "http:", host: "localhost" } });
  const { validateRenderer } = await import("./extensionHost.ts");
  const render = () => null;

  expect(() => validateRenderer({ apiVersion: 2 })).toThrow("supports 1");
  expect(() => validateRenderer({ apiVersion: 1, composerControls: [{ id: "same", render }, { id: "same", render }] }))
    .toThrow('duplicate id "same"');
  expect(() => validateRenderer({ apiVersion: 1, composerControls: [{ id: "missing-render" }] }))
    .toThrow("composerControls.0.render");
  expect(() => validateRenderer({
    apiVersion: 1,
    conversationViews: [{ id: "same", label: "First", render }, { id: "same", label: "Second", render }],
  })).toThrow('duplicate id "same"');

  expect(validateRenderer({ apiVersion: 1, conversationViews: [{ id: "agents", label: "Agents", render }] }))
    .toMatchObject({ apiVersion: 1, conversationViews: [{ id: "agents", label: "Agents" }] });
  expect(validateRenderer({ apiVersion: 1, panels: [{ id: "summary", title: "Summary", render }] }))
    .toMatchObject({ apiVersion: 1, panels: [{ id: "summary", title: "Summary" }] });
});
