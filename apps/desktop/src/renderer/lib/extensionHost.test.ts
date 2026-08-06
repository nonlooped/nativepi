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
