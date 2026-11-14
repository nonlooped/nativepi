import { DICTATION_SAMPLES, DICTATION_SECONDS } from "../../shared/dictation.ts";

export type DictationRecorder = { finish(): Promise<string>; cancel(): void };

/** Chromium records and decodes audio; Node only receives bounded 16 kHz mono PCM. */
export async function recordDictation(signal: AbortSignal, update: (seconds: number) => void, limit: () => void): Promise<DictationRecorder> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("Microphone access was denied. Allow it in your system privacy settings and try again.");
    if (error instanceof DOMException && error.name === "NotFoundError") throw new Error("No microphone was found. Connect one and try again.");
    throw error;
  }
  const release = () => stream.getTracks().forEach(track => track.stop());
  if (signal.aborted) { release(); signal.throwIfAborted(); }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
  } catch (error) { release(); throw error; }
  const chunks: Blob[] = [];
  let stopped = false;
  let failure: Error | undefined;
  let complete!: () => void;
  const finished = new Promise<void>(resolve => { complete = resolve; });
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = complete;
  recorder.onerror = () => { failure = new Error("The microphone recording failed. Check your microphone and try again."); limit(); };
  const started = performance.now();
  const ticker = setInterval(() => update(Math.min(DICTATION_SECONDS, (performance.now() - started) / 1000)), 100);
  const deadline = setTimeout(limit, DICTATION_SECONDS * 1000);
  const cleanup = () => { clearInterval(ticker); clearTimeout(deadline); release(); signal.removeEventListener("abort", cancel); };
  const cancel = () => {
    if (stopped) { cleanup(); return; }
    stopped = true;
    if (recorder.state !== "inactive") recorder.stop();
    cleanup();
  };
  signal.addEventListener("abort", cancel, { once: true });
  stream.getAudioTracks().forEach(track => { track.onended = () => { if (!stopped) limit(); }; });
  try { recorder.start(250); } catch (error) { cancel(); throw error; }
  return {
    cancel,
    async finish() {
      if (stopped) throw new Error("Recording cancelled.");
      stopped = true;
      clearInterval(ticker); clearTimeout(deadline);
      if (recorder.state !== "inactive") recorder.stop();
      try {
        await finished;
        release();
        signal.throwIfAborted();
        if (failure) throw failure;
        const audio = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer();
        if (!audio.byteLength) throw new Error("The recording was empty. Check your microphone and try again.");
        // decodeAudioData resamples to the offline context's rate. It needs no
        // speaker output, running AudioContext, or user-gesture autoplay grant.
        const decoder = new OfflineAudioContext(1, 1, 16000);
        const decoded = await decoder.decodeAudioData(audio);
        signal.throwIfAborted();
        const samples = Math.min(decoded.length, DICTATION_SAMPLES);
        if (samples < 1600) throw new Error("The recording was too short. Try again.");
        const bytes = new Uint8Array(samples * 2);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < samples; i++) {
          let value = 0;
          for (let channel = 0; channel < decoded.numberOfChannels; channel++) value += decoded.getChannelData(channel)[i];
          value /= decoded.numberOfChannels;
          view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true);
        }
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      } finally { cleanup(); }
    },
  };
}
