import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { stubInvoke } from "../lib/store/testBridge.ts";
import { useAppStore } from "../lib/store.ts";
import { useDictation } from "../lib/useDictation.ts";
import { DictationFeedback } from "./DictationControls.tsx";
import ComposerInput from "./ComposerInput.tsx";
import { caretToEnd, render, serialize } from "../lib/composerDom.ts";

let cancelled = 0;
mock.module("../lib/dictationRecorder.ts", () => ({ recordDictation: async () => ({ finish: async () => "AAAA", cancel: () => { cancelled++; } }) }));
if (typeof window !== "undefined") {
  Reflect.set(globalThis, "requestAnimationFrame", window.requestAnimationFrame.bind(window));
  Reflect.set(globalThis, "cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
}
const domTest = test.skipIf(typeof document === "undefined");
let root: Root | undefined;
let container: HTMLDivElement;
let dictation!: ReturnType<typeof useDictation>;
function Probe() {
  dictation = useDictation();
  return <><DictationFeedback dictation={dictation} /><ComposerInput value="Existing draft" onChange={text => useAppStore.getState().setDraft(text)} onSubmit={() => { throw new Error("Dictation must never send"); }} onAttach={() => {}} projectPath="/project" placeholder="Message" disabled={dictation.phase !== "idle"} /></>;
}
async function mount(invoke: (channel: string, params?: unknown) => Promise<unknown>) {
  cancelled = 0;
  stubInvoke(invoke);
  useAppStore.setState({ activeProjectPath: "/project", activeSessionFile: "a", selectionVersion: 0 });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<Probe />));
  const editor = container.querySelector<HTMLElement>("[data-composer-input]")!;
  await act(async () => { editor.focus(); caretToEnd(editor); });
  return editor;
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
const ready = { phase: "ready", downloaded: 886381760 };

domTest("first use explains the model download before requesting a microphone or starting installation", async () => {
  const calls: string[] = [];
  await mount(async channel => { calls.push(channel); return { phase: "missing", downloaded: 0 }; });
  await act(async () => dictation.start());
  expect(document.body.textContent).toContain("886 MB download");
  expect(document.body.textContent).toContain("Your audio stays on this device");
  expect(calls).toEqual(["dictationStatus"]);
  await act(async () => dictation.install());
  expect(calls).toContain("dictationInstall");
});
domTest("inserts local transcription into the existing draft without sending", async () => {
  const editor = await mount(async channel => channel === "dictationStatus" ? ready : channel === "dictationTranscribe" ? { text: "Add a test." } : { ok: true });
  await act(async () => dictation.start());
  expect(dictation.phase).toBe("recording");
  await act(async () => dictation.finish());
  expect(serialize(editor)).toBe("Existing draft Add a test.");
  expect(dictation.phase).toBe("idle");
  expect(cancelled).toBeGreaterThan(0);
});
domTest("navigation cancels transcription and ignores its late result", async () => {
  let resolve!: (value: { text: string }) => void;
  const calls: string[] = [];
  const editor = await mount(async channel => { calls.push(channel); return channel === "dictationStatus" ? ready : channel === "dictationTranscribe" ? new Promise(done => { resolve = done; }) : { ok: true }; });
  await act(async () => dictation.start());
  await act(async () => dictation.finish());
  expect(dictation.phase).toBe("transcribing");
  await act(async () => useAppStore.setState({ activeSessionFile: "b", selectionVersion: 1 }));
  await act(async () => resolve({ text: "Late result" }));
  expect(serialize(editor)).toBe("Existing draft");
  expect(calls).toContain("dictationCancel");
  expect(dictation.phase).toBe("idle");
});
domTest("keeps external draft edits when transcription finishes", async () => {
  let resolve!: (value: { text: string }) => void;
  const editor = await mount(async channel => channel === "dictationStatus" ? ready : channel === "dictationTranscribe" ? new Promise(done => { resolve = done; }) : { ok: true });
  await act(async () => dictation.start());
  await act(async () => dictation.finish());
  render(editor, "An external edit");
  await act(async () => resolve({ text: "Spoken text" }));
  expect(serialize(editor)).toBe("An external edit");
  expect(dictation.error).toContain("draft changed");
});
domTest("silence leaves the draft unchanged and offers a useful error", async () => {
  const editor = await mount(async channel => channel === "dictationStatus" ? ready : channel === "dictationTranscribe" ? { text: "" } : { ok: true });
  await act(async () => dictation.start());
  await act(async () => dictation.finish());
  expect(serialize(editor)).toBe("Existing draft");
  expect(container.textContent).toContain("No speech detected");
});
