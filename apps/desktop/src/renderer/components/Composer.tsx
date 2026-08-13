import { ArrowBendUpRightIcon, PaperPlaneRightIcon } from "../../shared/icons.ts"
import { ImageIcon } from "@phosphor-icons/react/Image";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { draftKeyFor } from "../../shared/messages.ts";
import { ACCEPTED_IMAGE_TYPES } from "../lib/attachments.ts";
import { classifyDrop, draggingFiles, mentionPath } from "../lib/drops.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { chipText, hoistSkill } from "../lib/composerText.ts";
import { showDropRejected, showHint } from "../lib/toast.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { SCROLLBAR_GUTTER_OFFSET, cn } from "@/lib/utils.ts";
import ComposerAttachments from "./ComposerAttachments.tsx";
import ComposerInput from "./ComposerInput.tsx";
import { ComposerControls, ComposerWidgets } from "./ExtensionSlots.tsx";
import ModelSelector from "./ModelSelector.tsx";
import ContextWindow from "./ContextInspector.tsx";

const TuiAutoPane = lazy(() => import("./TuiSurface.tsx").then((module) => ({ default: module.TuiAutoPane })));

export default function Composer({ prominent = false }: { prominent?: boolean }) {
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const activeSessionFile = useAppStore((s) => s.activeSessionFile);
  const draft = useAppStore((s) =>
    activeProjectPath ? (s.drafts[draftKeyFor(activeProjectPath, activeSessionFile)] ?? "") : "",
  );
  const running = useAppStore((s) => activeConversation(s).running);
  const blocked = useAppStore((s) => activeConversation(s).externalChange !== null);
  const setDraft = useAppStore((s) => s.setDraft);
  const send = useAppStore((s) => s.send);
  const enqueue = useAppStore((s) => s.enqueue);
  const behavior = useAppStore((s) => s.sendBehavior);
  const attached = useAppStore(
    (s) => (activeProjectPath ? (s.attachments[draftKeyFor(activeProjectPath, activeSessionFile)]?.length ?? 0) : 0),
  );
  const attach = useAppStore((s) => s.attach);
  const openProjectPath = useAppStore((s) => s.openProjectPath);
  const importSession = useAppStore((s) => s.importSession);
  const preparing = useAppStore(
    (s) => (activeProjectPath ? (s.preparing[draftKeyFor(activeProjectPath, activeSessionFile)] ?? 0) : 0),
  );
  const editorSurface = useAppStore((s) => s.extSurfaces.find((surface) => surface.placement === "editor"));
  const prevHadEditorSurface = useRef(!!editorSurface);
  useEffect(() => {
    if (prevHadEditorSurface.current && !editorSurface) {
      const frame = requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("[data-composer-input]")?.focus();
      });
      prevHadEditorSurface.current = !!editorSurface;
      return () => cancelAnimationFrame(frame);
    }
    prevHadEditorSurface.current = !!editorSurface;
  }, [editorSurface]);

  const [dropTarget, setDropTarget] = useState(false);
  const disabled = !activeProjectPath;
  // Images being read hold the send: they belong to this message, and Enter a
  // moment too early would send the text alone and leave them for the next one.
  const canSend = (!!draft.trim() || attached > 0) && !disabled && !blocked && preparing === 0;
  const steering = running && behavior === "steer";

  /**
   * A drop onto the composer, which is a message about files rather than a way
   * to open them.
   *
   * An image becomes an attachment because that is the only form Pi's prompt can
   * carry a picture in; every other file becomes an `@` mention, because the
   * agent reads it from disk and the composer's own file menu writes exactly the
   * same token. Shift inverts the one case where both are possible: an image the
   * user wants the agent to open rather than look at.
   */
  const drop = async (event: React.DragEvent) => {
    if (disabled || !activeProjectPath) return;
    const { folders, sessions, images, files } = classifyDrop(event.dataTransfer);
    // A browser drop has no path to invert to, so Shift there leaves the image
    // an attachment rather than losing it between the two forms.
    const imagePaths = event.shiftKey ? images.map((image) => rpc.filePath(image)).filter(Boolean) : [];
    const mentions = [...files, ...imagePaths];
    const attaching = imagePaths.length > 0 ? [] : images;
    // A folder or a chat file keeps its window action even when the same drop
    // also contains something the message can carry.
    if (attaching.length === 0 && mentions.length === 0 && folders.length === 0 && sessions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(false);
    if (attaching.length > 0) void attach(attaching);
    if (mentions.length > 0) {
      const text = mentions.map((path) => chipText("file", mentionPath(activeProjectPath, path))).join(" ");
      setDraft(draft.trim() ? `${draft.replace(/\s+$/, "")} ${text} ` : `${text} `);
    }
    for (const folder of folders) await openProjectPath(folder);
    if (folders.length > 0) showHint(folders.length === 1 ? "Project opened" : `${folders.length} projects opened`);
    const target = folders.at(-1) ?? activeProjectPath;
    if (sessions.length > 0 && !target) {
      showDropRejected("Open a project before importing a chat into it.");
      return;
    }
    let imported = 0;
    for (const session of sessions) if (await importSession(target, session)) imported++;
    if (imported > 0) showHint(imported === 1 ? "Chat imported" : `${imported} chats imported`);
  };

  const submit = () => {
    if (!canSend) return;
    // Pi reads a skill only at the head of the message; a chip the user placed
    // mid-sentence is moved there on the way out rather than being ignored.
    const outgoing = hoistSkill(draft);
    if (outgoing !== draft) setDraft(outgoing);
    if (running) void enqueue(behavior);
    else void send();
  };

  // A non-overlay `ctx.ui.custom()` replaces Pi's editor while it waits for an
  // answer. Keep the same boundary here: the transcript and extension footer
  // remain visible, while the ordinary composer yields its slot and keyboard.
  if (editorSurface) {
    return (
      <div
        className={cn(
          "flex shrink-0 flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]",
          prominent ? "w-full px-0 pt-0" : cn(SCROLLBAR_GUTTER_OFFSET, "pt-2"),
        )}
      >
        <ExtensionStatuses />
        <ComposerWidgets placement="aboveComposer" />
        <QueuedMessages />
        <div className="mx-auto w-full max-w-(--conversation-width) overflow-hidden rounded-xl border bg-card/60 px-3 py-2">
          <Suspense fallback={null}>
            <TuiAutoPane surface={editorSurface} maxRows={24} focus />
          </Suspense>
        </div>
        <ComposerWidgets placement="belowComposer" />
      </div>
    );
  }

  return (
    // pb clears the iOS home indicator, which sits over the send button
    // otherwise. `env()` is 0 everywhere else.
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]",
        prominent ? "w-full px-0 pt-0" : cn(SCROLLBAR_GUTTER_OFFSET, "pt-2"),
      )}
    >
      <ExtensionStatuses />
      <ComposerWidgets placement="aboveComposer" />
      <QueuedMessages />
      {/* Drop anywhere on the composer, not only on the text: the target the
          user aims at is the box, and a drop that lands two pixels outside the
          editable area would otherwise be caught by the window behind it and
          treated as a project or a chat instead. */}
      <div
        className={cn(
          "composer-surface relative mx-auto flex w-full max-w-(--conversation-width) flex-col rounded-3xl bg-card px-3 pb-3 pt-2",
          dropTarget && "ring-2 ring-ring",
        )}
        onDragOver={(event) => {
          if (disabled || !draggingFiles(event.dataTransfer)) return;
          event.preventDefault();
          setDropTarget(true);
        }}
        onDragLeave={(event) => {
          // Only the drag leaving the composer entirely, not the one crossing
          // from the text area onto a button inside it.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropTarget(false);
        }}
        onDrop={drop}
      >
        {dropTarget ? (
          <p className="pointer-events-none absolute inset-x-0 -top-7 text-center text-xs text-muted-foreground">
            Images attach, other files become mentions · <Kbd>Shift</Kbd> mentions images too
          </p>
        ) : null}
        <ComposerAttachments />
        <ComposerInput
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          onAttach={(files) => void attach(files)}
          projectPath={activeProjectPath}
          disabled={disabled}
          autoFocus={prominent}
          // The placeholder names the one thing this keystroke will do next, so
          // it tracks the queue behaviour rather than listing both options and
          // leaving the user to guess which one is armed.
          placeholder={
            disabled
              ? "Open a project to begin"
              : blocked
                ? "Add to your draft…"
                : steering
                  ? "Steer this turn…"
                  : running
                    ? "Queue a follow-up…"
                    : "Ask Pi to explore, explain, or change this project…"
          }
        />
        {/* Keep the controls that shape this reply on one compact line: model
            (with reasoning inside its picker) and send. Context sits beside
            send, next to the action it annotates. Branch lives with changes;
            queue behaviour lives on the run pill. */}
        <div className="flex items-end gap-1 px-1">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <AttachButton disabled={disabled} onPick={attach} />
            <ModelSelector />
            <ComposerControls />
          </div>
          <div className="flex items-center gap-1">
            <ContextWindow />
            <Button
              size="icon-lg"
              className="rounded-full shadow-sm shadow-foreground/10 hover:shadow-md hover:shadow-foreground/15 active:shadow-none disabled:bg-muted disabled:text-muted-foreground/40 disabled:opacity-100 disabled:shadow-none"
              onClick={submit}
              disabled={!canSend}
              title={sendLabel(running, steering)}
              aria-label={sendLabel(running, steering)}
            >
              {/* Steering redirects the turn in flight; it is not the same act as
                  sending, so it does not wear the same glyph. */}
              <span className="relative size-4" aria-hidden="true">
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    steering ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
                  )}
                >
                  <ArrowBendUpRightIcon weight="bold" />
                </span>
                <span
                  className={cn(
                    "flex items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    steering ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
                  )}
                >
                  <PaperPlaneRightIcon weight="fill" />
                </span>
              </span>
            </Button>
          </div>
        </div>
      </div>
      {/* The empty-chat composer teaches the three triggers once. Hidden on a
          touch screen, where naming keystrokes is advice about a keyboard the
          reader does not have. */}
      {prominent ? (
        <p className="mx-auto flex w-full max-w-(--conversation-width) flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-0.5 text-xs text-muted-foreground pointer-coarse:hidden">
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> to send
          </span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Shift+Enter</Kbd> for a new line
          </span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>/</Kbd> commands
          </span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>@</Kbd> files
          </span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>$</Kbd> skills
          </span>
        </p>
      ) : null}
      <ComposerWidgets placement="belowComposer" />
    </div>
  );
}

/** The one-word name for what Enter does right now, shared by tooltip and label. */
function sendLabel(running: boolean, steering: boolean): string {
  if (steering) return "Steer this turn (Enter)";
  if (running) return "Queue a follow-up (Enter)";
  return "Send message (Enter)";
}

/**
 * The third way to attach an image, after paste and drop.
 *
 * A real file input rather than Electron's dialog: paste and drop both hand the
 * window a `File`, and using the same object here means one path from a picture
 * to a prompt instead of a second one that starts from a path.
 */
function AttachButton({ disabled, onPick }: { disabled: boolean; onPick: (files: File[]) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(event) => {
          void onPick([...(event.target.files ?? [])]);
          // Cleared so picking the same file twice in a row still fires.
          event.target.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="icon-lg"
        disabled={disabled}
        onClick={() => input.current?.click()}
        title="Attach an image"
        aria-label="Attach an image"
        className="rounded-lg text-muted-foreground hover:text-foreground"
      >
        <ImageIcon />
      </Button>
    </>
  );
}

/**
 * The status row, or the footer an extension replaced it with.
 *
 * `ctx.ui.setFooter()` replaces Pi's whole footer, and Pi's footer is where the
 * statuses from `setStatus()` appear — so a custom footer takes this row rather
 * than stacking above it, exactly as it would in the terminal. The extension can
 * still read those statuses: they are handed to its factory.
 */
function ExtensionStatuses() {
  const statuses = useAppStore((s) => s.extStatuses);
  const footer = useAppStore((s) => s.extSurfaces.find((surface) => surface.placement === "footer"));
  const entries = Object.entries(statuses);

  if (footer) {
    return (
      <div className="mx-auto w-full max-w-(--conversation-width) px-1">
        <Suspense fallback={null}>
          <TuiAutoPane surface={footer} maxRows={1} />
        </Suspense>
      </div>
    );
  }
  if (entries.length === 0) return null;
  return (
    <div className="mx-auto flex w-full max-w-(--conversation-width) flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {entries.map(([key, text]) => (
        <span key={key} className="truncate">
          {text}
        </span>
      ))}
    </div>
  );
}

function QueuedMessages() {
  const steering = useAppStore((s) => activeConversation(s).queue.steering);
  const followUp = useAppStore((s) => activeConversation(s).queue.followUp);
  if (steering.length === 0 && followUp.length === 0) return null;

  return (
    <div className="mx-auto mb-2 flex w-full max-w-(--conversation-width) flex-col gap-1">
      {/* Only the list scrolls. The note below used to sit inside the scroller
          and slide out of sight exactly when the queue was long enough for
          someone to want to know how to clear it. */}
      <ul aria-label="Messages queued for this turn" className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {steering.map((text, i) => (
          <QueueRow key={`s${i}`} label="Steer" text={text} />
        ))}
        {followUp.map((text, i) => (
          <QueueRow key={`f${i}`} label="Follow up" text={text} />
        ))}
      </ul>
      {/* Pi owns this queue and exposes no way to withdraw an entry, so say so
          rather than leaving the user hunting for a control that cannot exist. */}
      <p className="px-1 pt-0.5 text-xs text-muted-foreground">
        Queued in Pi. Stopping the turn is the only way to discard these.
      </p>
    </div>
  );
}

function QueueRow({ label, text }: { label: string; text: string }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border bg-card/60 px-3 py-2 text-sm">
      <span className="mt-0.5 shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {/* Two lines rather than one: a queued message you cannot read back is
          one you cannot verify before it reaches the agent. */}
      <span className="min-w-0 flex-1 line-clamp-2 break-words whitespace-pre-wrap text-muted-foreground" title={text}>
        {text}
      </span>
    </li>
  );
}
