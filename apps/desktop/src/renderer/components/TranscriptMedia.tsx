import StateNotice from "./StateNotice.tsx";
import { useState } from "react";
import { ImageIcon } from "@phosphor-icons/react/Image";
import { FilmStripIcon } from "@phosphor-icons/react/FilmStrip";
import { SpeakerHighIcon } from "@phosphor-icons/react/SpeakerHigh";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { Dialog, DialogViewerContent } from "./ui/dialog.tsx";
import { referenceFor } from "../lib/markdownReferences.ts";

export function mediaKind(path: string) {
  const extension = path.split(/[?#]/, 1)[0].split(".").at(-1)?.toLowerCase();
  return /^(?:mp4|webm|mov|ogv)$/.test(extension ?? "") ? "video"
    : /^(?:mp3|wav|ogg|m4a|flac)$/.test(extension ?? "") ? "audio"
    : /^(?:png|jpe?g|gif|webp|svg|ico)$/.test(extension ?? "") ? "image" : null;
}

/** No media bytes are read until the reader opens a preview. */
export default function TranscriptMedia({ path, label, source, data }: { path?: string; label: string; source?: string; data?: string }) {
  const project = useAppStore(s => s.activeProjectPath);
  const [decodeError, setDecodeError] = useState<string>();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ project: string; path: string; src?: string; error?: string }>();
  const kind = path ? mediaKind(path) ?? "image" : "image";
  const remote = !!path && /^(?:https?:|\/\/)/i.test(path);
  const icon = kind === "video" ? <FilmStripIcon /> : kind === "audio" ? <SpeakerHighIcon /> : <ImageIcon />;
  const result = loaded?.project === project && loaded.path === path ? loaded : undefined;
  const src = data ?? result?.src;
  async function preview(retry = false) {
    setDecodeError(undefined);
    setOpen(true);
    if (data || !path || remote || !project || (result?.src && !retry)) return;
    setLoaded(undefined);
    const reference = referenceFor(path);
    const file = reference?.kind === "file" ? reference.path : path;
    try {
      const result = await rpc.request.readProjectMedia({ projectDir: project, file });
      setLoaded({ project, path, ...result });
    } catch { setLoaded({ project, path, error: "Media could not be loaded." }); }
  }
  return <>
    <button type="button" className="transcript-reference" title={path ?? label} data-reference-source={source ?? path ?? label}
      onClick={() => void preview()}>{icon}<span>{label}</span></button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogViewerContent title={label} description={`${kind} preview`} className="max-w-[min(64rem,90vw)]">
        {decodeError || result?.error ? <StateNotice title="Could not preview this media" detail={decodeError ?? result?.error} retry={() => void preview(true)} /> : src ? kind === "video" ? <video onError={() => setDecodeError("This video could not be played. Its format may not be supported.")} src={src} controls preload="metadata" className="max-h-[calc(var(--app-height,100dvh)-10rem)] w-full" />
          : kind === "audio" ? <audio onError={() => setDecodeError("This audio could not be played. Its format may not be supported.")} src={src} controls preload="metadata" className="w-full" />
          : <img onError={() => setDecodeError("This image could not be decoded. Check that the file is a supported image." )} src={src} alt={label} className="max-h-[calc(var(--app-height,100dvh)-10rem)] w-full object-contain" />
          : remote || !project ? <p className="text-sm text-muted-foreground">{remote ? "Remote media is not loaded automatically." : !project ? "Open a project to preview this media." : result?.error ?? "Loading preview…"}</p> : <StateNotice loading title="Loading preview…" />}
        {remote && path ? <button className="mt-4 text-sm font-medium hover:underline" onClick={() => void rpc.request.openExternal({ url: path })}>Open original</button> : null}
      </DialogViewerContent>
    </Dialog>
  </>;
}
