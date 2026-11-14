import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as childProcess from "node:child_process";

class Child extends EventEmitter {
  connected = true;
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  send = mock((_value: unknown, callback?: (error: Error | null) => void) => { callback?.(null); return true; });
  kill = () => { this.emit("close", 0); return true; };
  constructor() { super(); this.stdin.once("finish", () => queueMicrotask(() => this.emit("close", 0))); }
}
let child: Child;
mock.module("node:child_process", () => ({ ...childProcess, fork: () => (child = new Child()) }));
let preview: (input: unknown, signal: AbortSignal) => Promise<unknown>;
mock.module("../htmlArtifactPreview.ts", () => ({ previewHtmlArtifact: (input: unknown, signal: AbortSignal) => preview(input, signal) }));
const { PiProcess } = await import("./client.ts");

test("preview IPC rejects malformed input, returns screenshots, and aborts outstanding browser work on stop", async () => {
  const pi = new PiProcess("/project", () => {}, () => {});
  let calls = 0;
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  preview = async () => { calls++; started(); return { width: 728, contentHeight: 200, capturedHeight: 200, consoleMessages: [], png: "image" }; };
  child!.emit("message", { type: "nativepi_artifact_preview", requestId: "bad", input: { html: "x", width: 99999 } });
  expect(calls).toBe(0);
  const response = new Promise<void>(resolve => child!.send.mockImplementation((_value, callback) => { callback?.(null); resolve(); return true; }));
  child!.emit("message", { type: "nativepi_artifact_preview", requestId: "good", input: { html: "<p>Visual</p>", width: 728 } });
  await start;
  await response;
  expect(child!.send).toHaveBeenCalledWith(expect.objectContaining({ type: "nativepi_artifact_preview_reply", requestId: "good", result: expect.objectContaining({ png: "image" }) }), expect.any(Function));
  let signal: AbortSignal | undefined;
  const running = new Promise<void>(resolve => {
    preview = async (_input, nextSignal) => { signal = nextSignal; resolve(); return new Promise((_resolve, reject) => nextSignal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })); };
  });
  child!.emit("message", { type: "nativepi_artifact_preview", requestId: "pending", input: { html: "<p>Visual</p>", width: 728 } });
  await running;
  await pi.stop();
  expect(signal?.aborted).toBe(true);
});
