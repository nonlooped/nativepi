import { expect, test } from "bun:test";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { TuiHostFrame } from "../../../shared/tui-frames.ts";
import {
  callExtensionMethod,
  installExtensionChannel,
  installExtensionMethodLifecycle,
  resetExtensionMethods,
} from "./extensionChannel.ts";

function host(): { frames: TuiHostFrame[]; channel: NonNullable<typeof globalThis.__NATIVEPI_EXTENSION_HOST__> } {
  const frames: TuiHostFrame[] = [];
  installExtensionChannel((frame) => frames.push(frame));
  return { frames, channel: globalThis.__NATIVEPI_EXTENSION_HOST__! };
}

test("a registered method answers its renderer half", async () => {
  const { channel } = host();
  channel.method("@acme/ext", "stats", (params) => ({ echoed: params ?? null }));

  expect(await callExtensionMethod("@acme/ext", "stats", { since: 1 })).toEqual({ echoed: { since: 1 } });
});

test("a call for a method nobody registered fails rather than hanging", () => {
  host();

  expect(callExtensionMethod("@acme/ext", "missing", undefined)).rejects.toThrow('has no method "missing"');
});

test("methods are scoped to the extension that registered them", () => {
  const { channel } = host();
  channel.method("@acme/one", "stats", () => 1);

  expect(callExtensionMethod("@acme/two", "stats", undefined)).rejects.toThrow("has no method");
});

test("an unserializable result is reported instead of breaking the frame stream", () => {
  const { channel } = host();
  const circular: Record<string, unknown> = {};
  circular["self"] = circular;
  // @ts-expect-error Runtime validation rejects a broken extension's result.
  channel.method("@acme/ext", "loop", () => circular);

  expect(callExtensionMethod("@acme/ext", "loop", undefined)).rejects.toThrow("non-JSON");
});

test("factory methods survive binding and are cleared when their session is replaced or reloaded", async () => {
  const { channel } = host();
  const session = {
    dispose: () => {},
    reload: async () => {
      // Pi runs extension factories while rebuilding the runtime during reload.
      channel.method("@acme/ext", "stats", () => 2);
    },
    bindExtensions: async () => {},
  };
  installExtensionMethodLifecycle(session as Pick<AgentSession, "dispose" | "reload">);

  // Extension factories run before Pi calls bindExtensions, so this registration
  // must survive that call.
  channel.method("@acme/ext", "stats", () => 1);
  channel.method("@acme/ext", "stale", () => 1);
  await session.bindExtensions();
  expect(await callExtensionMethod("@acme/ext", "stats", undefined)).toBe(1);

  await session.reload();
  expect(await callExtensionMethod("@acme/ext", "stats", undefined)).toBe(2);
  expect(callExtensionMethod("@acme/ext", "stale", undefined)).rejects.toThrow("has no method");

  session.dispose();
  expect(callExtensionMethod("@acme/ext", "stats", undefined)).rejects.toThrow("has no method");
});

test("an unserializable event payload is dropped rather than written", () => {
  const { frames, channel } = host();
  const circular: Record<string, unknown> = {};
  circular["self"] = circular;

  // @ts-expect-error Runtime validation protects JavaScript extensions too.
  channel.emit("@acme/ext", "changed", circular);
  channel.emit("@acme/ext", "changed", { ok: true });

  expect(frames).toEqual([
    { type: "nativepi_tui_ext_event", extension: "@acme/ext", event: "changed", payload: { ok: true } },
  ]);
});
