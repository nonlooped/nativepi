import { afterEach, expect, test } from "bun:test";
import { recordDictation, type DictationRecorder } from "./dictationRecorder.ts";

const domTest = test.skipIf(typeof navigator === "undefined");
const originalRecorder = globalThis.MediaRecorder;
const originalDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
let stops = 0;
let latest: FakeRecorder;
class FakeRecorder {
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() { latest = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; queueMicrotask(() => this.onstop?.()); }
}
function setup(getUserMedia?: () => Promise<MediaStream>) {
  stops = 0;
  const track = { stop: () => { stops++; }, onended: null };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: getUserMedia ?? (async () => stream) } });
  Reflect.set(globalThis, "MediaRecorder", FakeRecorder);
  return stream;
}
afterEach(() => {
  Reflect.set(globalThis, "MediaRecorder", originalRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalDevices });
});

domTest("cancellation stops recording and releases the microphone immediately", async () => {
  setup();
  const controller = new AbortController();
  const recording = await recordDictation(controller.signal, () => {}, () => {});
  controller.abort();
  expect(latest.state).toBe("inactive");
  expect(stops).toBe(1);
  await expect(recording.finish()).rejects.toThrow("cancelled");
});
domTest("a microphone granted after cancellation is released without starting a recorder", async () => {
  let grant!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>(resolve => { grant = resolve; });
  const stream = setup(() => pending);
  const controller = new AbortController();
  const task = recordDictation(controller.signal, () => {}, () => {});
  controller.abort(); grant(stream);
  await expect(task).rejects.toThrow();
  expect(stops).toBe(1);
});
domTest("a recording error settles the operation and releases the microphone", async () => {
  setup();
  let result!: Promise<string>;
  let recording!: DictationRecorder;
  recording = await recordDictation(new AbortController().signal, () => {}, () => { result = recording.finish(); });
  latest.onerror?.();
  await expect(result).rejects.toThrow("microphone recording failed");
  expect(latest.state).toBe("inactive");
  expect(stops).toBeGreaterThan(0);
});
