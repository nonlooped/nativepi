import { useState } from "react";
import { ImageIcon } from "@phosphor-icons/react/Image";
import { FilmStripIcon } from "@phosphor-icons/react/FilmStrip";
import { SpeakerHighIcon } from "@phosphor-icons/react/SpeakerHigh";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog.tsx";
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
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ project: string; path: string; src?: string; error?: string }>();
  const kind = path ? mediaKind(path) ?? "image" : "image";
  const remote = !!path && /^(?:https?:|\/\/)/i.test(path);
  const icon = kind === "video" ? <FilmStripIcon /> : kind === "audio" ? <SpeakerHighIcon /> : <ImageIcon />;
  const result = loaded?.project === project && loaded.path === path ? loaded : undefined;
  const src = data ?? result?.src;
  async function preview() {
    setOpen(true);
    if (data || !path || remote || !project || result?.src) return;
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
      <DialogContent className="max-w-[min(64rem,90vw)] p-4">
        <DialogTitle className="truncate text-sm">{label}</DialogTitle>
        <DialogDescription className="sr-only">{kind} preview</DialogDescription>
        {src ? kind === "video" ? <video src={src} controls preload="metadata" className="max-h-[75dvh] w-full" />
          : kind === "audio" ? <audio src={src} controls preload="metadata" className="w-full" />
          : <img src={src} alt={label} className="max-h-[75dvh] w-full object-contain" />
          : <p className="text-sm text-muted-foreground">{remote ? "Remote media is not loaded automatically." : !project ? "Open a project to preview this media." : result?.error ?? "Loading preview…"}</p>}
        {remote && path ? <button className="text-sm font-medium hover:underline" onClick={() => void rpc.request.openExternal({ url: path })}>Open original</button> : null}
      </DialogContent>
    </Dialog>
  </>;
}
