import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { XIcon } from "@phosphor-icons/react/X";
import { draftKeyFor } from "../../shared/messages.ts";
import { dataUrl } from "../lib/attachments.ts";
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
        <Attachment key={image.id} size="sm">
          <AttachmentMedia variant="image">
            <img src={dataUrl(image)} alt="" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle title={image.name}>{image.name}</AttachmentTitle>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction onClick={() => detach(image.id)} aria-label={`Remove ${image.name}`}>
              <XIcon />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}
