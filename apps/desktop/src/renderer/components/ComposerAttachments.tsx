import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { XIcon } from "@phosphor-icons/react/X";
import { draftKeyFor } from "../../shared/messages.ts";
import { dataUrl } from "../lib/attachments.ts";
import { copyDataImage } from "../lib/clipboard.ts";
import type { ImageAttachment } from "../../shared/rpc-schema.ts";
import { useState } from "react";
import { useAppStore } from "../lib/store.ts";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx";

/**
 * The images this draft is carrying.
 *
 * The thumbnail is the identifying detail, not the name: what matters about a
 * pasted screenshot is that it is the right screenshot, and its name is
 * `image.png`. The name is still shown, because a picked file has a real one.
 */
export default function ComposerAttachments() {
  const images = useAppStore((s) => s.attachments[draftKeyFor(s.activeProjectPath, s.activeSessionFile)]);
  const preparing = useAppStore((s) => s.preparing[draftKeyFor(s.activeProjectPath, s.activeSessionFile)] ?? 0);
  const detach = useAppStore((s) => s.detach);

  if ((!images || images.length === 0) && preparing === 0) return null;

  return (
    <AttachmentGroup aria-label="Images attached to this message" className="px-1 pb-1">
      {/* Sending waits for these, so say so: an unexplained dead Enter key reads
          as the composer being broken. */}
      {preparing > 0 && (
        <Attachment size="sm" state="processing">
          <AttachmentMedia>
            <CircleNotchIcon className="animate-spin" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>Preparing images</AttachmentTitle>
          </AttachmentContent>
        </Attachment>
      )}
      {(images ?? []).map((image) => (
        <ComposerAttachment key={image.id} image={image} onRemove={() => detach(image.id)} />
      ))}
    </AttachmentGroup>
  );
}

function ComposerAttachment({ image, onRemove }: { image: ImageAttachment; onRemove: () => void }) {
  const [preview, setPreview] = useState(false);
  const src = dataUrl(image);
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={<Attachment size="sm" />}>
          <AttachmentMedia variant="image">
            <img src={src} alt="" className="outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle title={image.name}>{image.name}</AttachmentTitle>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction onClick={onRemove} aria-label={`Remove ${image.name}`}>
              <XIcon />
            </AttachmentAction>
          </AttachmentActions>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={onRemove}>Remove</ContextMenuItem>
          <ContextMenuItem onClick={() => setPreview(true)}>Preview at full size</ContextMenuItem>
          <ContextMenuItem onClick={() => void copyDataImage(src)}>Copy image</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-[90vw] p-3">
          <DialogTitle className="sr-only">{image.name}</DialogTitle>
          <DialogDescription className="sr-only">Full-size image preview</DialogDescription>
          <img src={src} alt={image.name} className="max-h-[calc(var(--app-height,100dvh)-3.5rem)] w-full object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
        </DialogContent>
      </Dialog>
    </>
  );
}
