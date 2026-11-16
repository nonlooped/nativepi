import { usesNativeGlass } from "../../../shared/themes.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog.tsx";
import { useRef, useState } from "react";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { CheckIcon } from "../../../shared/icons.ts";
import { BACKGROUND_IMAGE_ACCEPT } from "../../../shared/chat-background.ts";
import { CHAT_BACKGROUNDS, importChatBackground } from "../../lib/chat-backgrounds.ts";
import { useAppStore } from "../../lib/store.ts";
import { rpc } from "../../lib/rpc.ts";
import { ActionRow } from "./rows.tsx";
import { Button } from "../ui/button.tsx";

function BackgroundChooser() {
  const background = useAppStore((s) => s.preferences.chatBackground);
  const setPreference = useAppStore((s) => s.setPreference);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = CHAT_BACKGROUNDS.find((entry) => entry.id === background.preset);
  const select = (preset: typeof background.preset) => {
    setPreference("chatBackground", { ...background, preset });
    setError(null);
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const customImage = await importChatBackground(file);
      setPreference("chatBackground", { preset: "custom", customImage });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not read this image. Try another image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="@container/settings-content">
      <input ref={input} type="file" accept={BACKGROUND_IMAGE_ACCEPT} className="hidden" aria-label="Choose a background image"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }} />
      <div className="mt-2 grid grid-cols-2 gap-2 @min-[36rem]/settings-content:grid-cols-4" role="group" aria-label="Backgrounds">
        {CHAT_BACKGROUNDS.map((entry) => <button key={entry.id} type="button" className="chat-background-swatch"
          aria-label={entry.name} aria-pressed={background.preset === entry.id} disabled={busy} onClick={() => select(entry.id)}>
          <img src={entry.src} alt="" className="chat-background-thumbnail" />
          <span>{entry.name}</span>
          {background.preset === entry.id ? <CheckIcon className="chat-background-check" weight="bold" /> : null}
        </button>)}
        <button type="button" className="chat-background-swatch chat-background-plain" aria-pressed={background.preset === "none"}
          disabled={busy} onClick={() => select("none")}>
          <span>None</span>
          {background.preset === "none" ? <CheckIcon className="chat-background-check" weight="bold" /> : null}
        </button>
        {background.customImage ? <button type="button" className="chat-background-swatch" aria-pressed={background.preset === "custom"}
          disabled={busy} onClick={() => select("custom")}>
          <img src={background.customImage} alt="" className="chat-background-thumbnail" />
          <span>Your image</span>
          {background.preset === "custom" ? <CheckIcon className="chat-background-check" weight="bold" /> : null}
        </button> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <UploadSimpleIcon /> {busy ? "Preparing image…" : background.customImage ? "Replace your image" : "Choose your own image"}
        </Button>
        {background.customImage ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
          setPreference("chatBackground", { preset: background.preset === "custom" ? "mist" : background.preset, customImage: null });
          setError(null);
        }}>Remove your image</Button> : null}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      {selected ? <button type="button" className="mt-2 text-left text-xs text-muted-foreground hover:text-foreground"
        onClick={() => void rpc.request.openExternal({ url: selected.url })}>Photo by {selected.photographer} / Unsplash</button>
        : <p className="mt-2 text-xs text-muted-foreground">{background.preset === "custom" ? "Your image is saved locally in NativePi." : "Bundled backgrounds are available offline."}</p>}
    </div>
  );
}

export default function ChatBackgroundSettings() {
  const [open, setOpen] = useState(false);
  const preferences = useAppStore(s => s.preferences);
  const glass = usesNativeGlass(preferences);
  const current = CHAT_BACKGROUNDS.find(entry => entry.id === preferences.chatBackground.preset);
  const name = glass ? "Managed by Acrylic" : current?.name ?? (preferences.chatBackground.preset === "custom" ? "Your image" : "None");
  return <>
    <ActionRow label="Background" description={glass ? "Acrylic uses the system backdrop. Your saved image returns with another scheme." : "Most visible in new chats; quieter behind messages."}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Choose background">{name}</Button>
    </ActionRow>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Background</DialogTitle><DialogDescription>{glass ? "Acrylic manages the background. Choose a different color scheme to use an image. Your saved choice is kept." : "Choose an image or a plain background. Changes apply immediately."}</DialogDescription></DialogHeader>
      {glass ? <p className="text-sm text-body-muted-foreground">Native glass is available on macOS and Windows 11. Other systems and browser access use a solid backdrop.</p> : <BackgroundChooser />}
      <DialogFooter><Button variant="outline" size="sm" onClick={() => setOpen(false)}>Done</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
