import { useEffect, useRef, useState } from "react";
import { dictationStatusSchema, type DictationStatus } from "../../shared/dictation.ts";
import { caretOffset, caretTo, render, serialize } from "./composerDom.ts";
import { recordDictation, type DictationRecorder } from "./dictationRecorder.ts";
import { isRemote, rpc } from "./rpc.ts";
import { useAppStore } from "./store.ts";

type Operation = { id: string; controller: AbortController; recorder?: DictationRecorder; finish?: () => void };
type Phase = "idle" | "preparing" | "recording" | "transcribing";
export function useDictation() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<DictationStatus | null>(null);
  const [setup, setSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meter, setMeter] = useState({ seconds: 0 });
  const operation = useRef<Operation | null>(null);

  function cancel() {
    const current = operation.current;
    operation.current = null;
    current?.controller.abort();
    current?.recorder?.cancel();
    if (current) void rpc.request.dictationCancel({ id: current.id }).catch(() => {});
    setPhase("idle");
  }
  useEffect(() => {
    if (isRemote) return;
    const off = rpc.events.on("dictationStatus", value => setStatus(dictationStatusSchema.parse(value)));
    const navigation = useAppStore.subscribe((state, previous) => {
      if (state.selectionVersion !== previous.selectionVersion || state.activeProjectPath !== previous.activeProjectPath || state.activeSessionFile !== previous.activeSessionFile
        || (state.extSurfaces !== previous.extSurfaces && state.extSurfaces.some(surface => surface.placement === "editor"))) {
        cancel(); setSetup(false); setError(null);
      }
    });
    return () => { off(); navigation(); cancel(); };
  }, []);
  useEffect(() => {
    if (phase === "idle") return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [phase]);

  function begin(): Operation | null {
    if (operation.current) return null;
    const current: Operation = { id: crypto.randomUUID(), controller: new AbortController() };
    operation.current = current;
    setError(null);
    return current;
  }
  function failed(current: Operation, reason: unknown) {
    if (operation.current !== current) return;
    setError(reason instanceof Error ? reason.message : String(reason));
    cancel();
  }
  async function install() {
    const current = begin();
    if (!current) return;
    setStatus({ phase: "downloading", downloaded: 0 });
    try {
      const installed = dictationStatusSchema.parse(await rpc.request.dictationInstall({ id: current.id }));
      if (operation.current !== current) return;
      setStatus(installed);
      operation.current = null;
      if (installed.error) setError(installed.error);
    } catch (reason) {
      if (operation.current === current) setStatus({ phase: "error", downloaded: 0 });
      failed(current, reason);
    }
  }
  async function start() {
    const current = begin();
    if (!current) return;
    setPhase("preparing");
    const state = useAppStore.getState();
    const project = state.activeProjectPath;
    const session = state.activeSessionFile;
    const selectionVersion = state.selectionVersion;
    const element = document.querySelector<HTMLElement>("[data-composer-input]");
    const before = element ? serialize(element) : "";
    const caret = element ? caretOffset(element) ?? before.length : before.length;
    try {
      const installed = dictationStatusSchema.parse(await rpc.request.dictationStatus({}));
      if (operation.current !== current) return;
      setStatus(installed);
      if (installed.phase !== "ready") { operation.current = null; setPhase("idle"); setSetup(true); return; }
      await rpc.request.dictationMicrophone({});
      if (operation.current !== current) return;
      current.recorder = await recordDictation(current.controller.signal, seconds => setMeter({ seconds }), () => current.finish?.());
      if (operation.current !== current) { current.recorder.cancel(); return; }
      current.finish = () => { void finish(); };
      setMeter({ seconds: 0 });
      setPhase("recording");
      const finish = async () => {
        if (!current.recorder || operation.current !== current || !current.finish) return;
        current.finish = undefined;
        setPhase("transcribing");
        try {
          const audio = await current.recorder.finish();
          current.controller.signal.throwIfAborted();
          const { text } = await rpc.request.dictationTranscribe({ id: current.id, audio });
          if (operation.current !== current) return;
          const now = useAppStore.getState();
          if (now.activeProjectPath !== project || now.activeSessionFile !== session || now.selectionVersion !== selectionVersion) { cancel(); return; }
          if (!text.trim()) { setError("No speech detected. Check your microphone and try again."); cancel(); return; }
          if (!element?.isConnected || serialize(element) !== before) { setError("The draft changed during dictation. Your draft was kept; please dictate again."); cancel(); return; }
          const lead = caret > 0 && !/\s/.test(before[caret - 1]) ? " " : "";
          const trail = caret < before.length && !/\s/.test(before[caret]) ? " " : "";
          const inserted = lead + text.trim() + trail;
          const draft = before.slice(0, caret) + inserted + before.slice(caret);
          render(element, draft);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          cancel();
          element.focus(); caretTo(element, caret + inserted.length);
        } catch (reason) { failed(current, reason); }
      }
    } catch (reason) { failed(current, reason); }
  }
  return { phase, status, setup, error, meter, start, install, cancel,
    finish: () => operation.current?.finish?.(),
    closeSetup: () => { cancel(); setSetup(false); setError(null); },
    dismissError: () => setError(null),
  };
}
