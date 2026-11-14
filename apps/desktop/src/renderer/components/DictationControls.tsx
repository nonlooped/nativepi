import { MicrophoneIcon } from "@phosphor-icons/react/Microphone";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { XIcon } from "@phosphor-icons/react/X";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { DICTATION_MODEL } from "../../shared/dictation.ts";
import type { useDictation } from "../lib/useDictation.ts";
import { Button } from "./ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog.tsx";

export type DictationControlsState = ReturnType<typeof useDictation>;
export function DictationButton({ dictation, disabled }: { dictation: DictationControlsState; disabled: boolean }) {
  const recording = dictation.phase === "recording";
  const busy = dictation.phase !== "idle";
  const label = recording ? "Finish dictation" : busy ? "Cancel dictation" : "Dictate prompt";
  return <Button variant="ghost" size="icon-lg" className="rounded-full" disabled={disabled && !busy}
    aria-label={label} title={label} aria-pressed={recording}
    onMouseDown={event => event.preventDefault()}
    onClick={() => recording ? dictation.finish() : busy ? dictation.cancel() : void dictation.start()}>
    {recording ? <StopIcon weight="fill" className="text-destructive" /> : busy ? <XIcon /> : <MicrophoneIcon />}
  </Button>;
}

export function DictationFeedback({ dictation }: { dictation: DictationControlsState }) {
  const { phase, status, setup, error, meter } = dictation;
  const downloading = status?.phase === "downloading" || status?.phase === "verifying";
  const ready = status?.phase === "ready";
  const percent = Math.floor((status?.downloaded ?? 0) / DICTATION_MODEL.bytes * 100);
  return <>
    {phase !== "idle" || (error && !setup) ? <div className="mx-2 mb-2 flex min-h-8 items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground" role="status">
      {phase === "recording" ? <>
        <span className="size-2 shrink-0 rounded-full bg-destructive" />
        <span className="min-w-0 flex-1 text-foreground">Listening…</span>
        <span className="tabular-nums">{Math.floor(meter.seconds / 60)}:{String(Math.floor(meter.seconds % 60)).padStart(2, "0")} / 2:00</span>
      </> : <span className="min-w-0 flex-1">{phase === "preparing" ? "Preparing dictation…" : phase === "transcribing" ? "Transcribing on this device…" : error}</span>}
      <Button variant="ghost" size="icon-xs" aria-label={phase === "idle" ? "Dismiss dictation error" : "Cancel dictation"} onClick={phase === "idle" ? dictation.dismissError : dictation.cancel}><XIcon /></Button>
    </div> : null}
    <Dialog open={setup} onOpenChange={open => { if (!open) dictation.closeSetup(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ready ? "Dictation is ready" : "Set up voice dictation"}</DialogTitle>
          <DialogDescription>{ready ? "Your speech is transcribed on this device. Review and edit the text before sending." : "Download a speech model once to dictate prompts offline. No account, API key, or payment is needed. Your audio stays on this device."}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border/60 p-4">
          <div className="flex items-center gap-3">
            {ready ? <CheckCircleIcon className="size-5 shrink-0 text-success" weight="fill" /> : <MicrophoneIcon className="size-5 shrink-0 text-muted-foreground" />}
            <div><p className="text-sm font-medium">{DICTATION_MODEL.name}</p><p className="mt-0.5 text-xs text-muted-foreground">Multilingual · 886 MB download</p></div>
          </div>
          {downloading ? <div className="mt-4" role="status">
            <progress aria-label="Speech model installation" max={DICTATION_MODEL.bytes} value={status.downloaded} className="block h-1.5 w-full overflow-hidden rounded-full bg-muted accent-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary" />
            <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground tabular-nums"><span>{status.phase === "verifying" ? "Verifying download…" : `${Math.floor(status.downloaded / 1_000_000)} of 886 MB`}</span><span>{percent}%</span></div>
          </div> : null}
        </div>
        {error || status?.error ? <p role="alert" className="text-sm text-destructive">{error ?? status?.error}</p> : null}
        <p className="text-xs leading-5 text-muted-foreground">{ready ? "The model loads when you dictate and releases memory afterward." : "The model downloads from Hugging Face and uses about 886 MB of disk space. Transcription speed depends on your computer."}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={dictation.closeSetup}>{downloading ? "Cancel download" : "Close"}</Button>
          {!downloading ? <Button onClick={() => ready ? (dictation.closeSetup(), void dictation.start()) : void dictation.install()}>{ready ? "Start dictation" : status?.phase === "error" ? "Retry download" : "Download model"}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
