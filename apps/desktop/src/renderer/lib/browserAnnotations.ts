import { annotationToken, browserAnnotationEventSchema, MAX_ANNOTATIONS } from "../../shared/browserAnnotation.ts";
import { composerKey } from "./draftThreads.ts";
import { parseSegments } from "./composerText.ts";
import type { PaneStore } from "./store.ts";

/** Use the existing draft interface so persistence, cold sends and queues keep ownership. */
export function insertBrowserAnnotation(store: PaneStore, raw: unknown): { added: boolean; error?: string } {
  const parsed = browserAnnotationEventSchema.safeParse(raw);
  if (!parsed.success) return { added: false, error: "Couldn’t read the selected element. Select it again." };
  const { target, annotation } = parsed.data;
  const state = store.getState();
  if (state.activeProjectPath !== target.projectDir || state.activeSessionFile !== target.sessionFile)
    return { added: false, error: "Selection cancelled because you changed chats. Select the element again." };
  const key = composerKey(state);
  const draft = state.drafts[key] ?? "";
  if (parseSegments(draft).filter(segment => segment.kind === "browser").length >= MAX_ANNOTATIONS)
    return { added: false, error: "Up to eight elements per message. Remove one before selecting another." };
  state.insertIntoComposer(annotationToken(annotation) + " ");
  return store.getState().drafts[key] !== draft
    ? { added: true }
    : { added: false, error: "This thread can’t accept a message. Return to an editable Work thread and select the element again." };
}
