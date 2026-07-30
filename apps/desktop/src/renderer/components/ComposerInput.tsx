import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { imageFilesIn } from "../lib/attachments.ts";
import { completionText, linesAt, offsetAt, type ExtensionCompletionOption } from "../lib/autocomplete.ts";
import {
  caretOffset,
  caretTo,
  caretToEnd,
  render,
  replaceWithChip,
  replaceWithText,
  serialize,
} from "../lib/composerDom.ts";
import { AutocompleteMenu, useComposerAutocomplete } from "./ComposerAutocomplete.tsx";
import { cn } from "@/lib/utils.ts";
import { rpc } from "@/lib/rpc.ts";

/**
 * The message field: prose with skill and file chips in it.
 *
 * A textarea cannot hold a chip, so this is a contenteditable — but only as a
 * renderer. The draft in the store is still the plain text Pi receives, and this
 * element is written to only when that text changes from somewhere other than
 * typing here (a chat switch, a send, a restored draft). Everything about how a
 * chip becomes text and back lives in `lib/composerDom.ts`.
 */
export default function ComposerInput({
  value,
  onChange,
  onSubmit,
  onAttach,
  projectPath,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onAttach: (files: File[]) => void;
  projectPath: string | null;
  placeholder: string;
  disabled: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  // What this editor last reported. A draft equal to it is our own keystroke
  // coming back, and rewriting the DOM for that would move the caret.
  const emitted = useRef<string | null>(null);

  const emit = useCallback(() => {
    const element = root.current;
    if (!element) return;
    const text = serialize(element);
    emitted.current = text;
    onChange(text);
  }, [onChange]);

  const complete = useComposerAutocomplete(projectPath, (trigger, option) => {
    const element = root.current;
    if (!element) return;
    // An extension's provider decides what accepting its own suggestion does to
    // the text — that is the point of `applyCompletion` — so the edit is asked
    // for rather than assumed. Everything else is inserted here.
    if (option.kind === "extension") {
      void applyExtensionCompletion(element, projectPath, option, emit);
      return;
    }
    // A command stays editable text — the user types its arguments next — where
    // a skill or a file becomes one atomic chip.
    if (trigger.kind === "command") {
      replaceWithText(element, trigger.start, trigger.end, completionText(trigger, option.value));
    } else if (trigger.kind === "skill" || trigger.kind === "file") {
      replaceWithChip(element, trigger.start, trigger.end, trigger.kind, option.value);
    }
    emit();
  });

  const sync = useCallback(() => {
    const element = root.current;
    if (!element) return;
    const caret = caretOffset(element);
    complete.sync(caret === null ? "" : serialize(element), caret);
  }, [complete]);

  useEffect(() => {
    const element = root.current;
    if (!element || value === emitted.current) return;
    emitted.current = value;
    render(element, value);
    if (element.ownerDocument.activeElement === element) caretToEnd(element);
  }, [value]);

  // contenteditable has no `select` event; caret moves that the menu must follow
  // (clicks, arrow keys, undo) only show up here.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const document = element.ownerDocument;
    const onSelectionChange = () => {
      if (document.activeElement === element) sync();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [sync]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The open menu owns Enter and the arrows; sending is what Enter means only
    // once there is nothing to insert.
    if (complete.onKeyDown(event)) return;
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (event.shiftKey) {
      // The browser would otherwise wrap the line in a div of its own design;
      // a plain break keeps the content flat and the serializer simple.
      event.currentTarget.ownerDocument.execCommand("insertLineBreak");
      emit();
      return;
    }
    onSubmit();
  };

  return (
    <div className="relative">
      <AutocompleteMenu state={complete} />
      <div
        ref={root}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Message Pi"
        aria-expanded={complete.open}
        aria-controls="composer-autocomplete"
        aria-autocomplete="list"
        aria-activedescendant={
          complete.open ? `composer-autocomplete-${complete.options[complete.active]?.value ?? ""}` : undefined
        }
        onInput={emit}
        onKeyDown={onKeyDown}
        onBlur={complete.close}
        // Rich clipboard content would arrive as markup this editor does not
        // model, and the message is plain text in the end anyway. An image is
        // the exception: it cannot be text, so it goes to the attachment strip
        // instead of being dropped on the floor.
        onPaste={(event) => {
          event.preventDefault();
          const images = imageFilesIn(event.clipboardData);
          if (images.length > 0) onAttach(images);
          const text = event.clipboardData.getData("text/plain");
          if (!text) return;
          event.currentTarget.ownerDocument.execCommand("insertText", false, text);
          emit();
        }}
        className={cn(
          "max-h-56 min-h-24 w-full overflow-y-auto whitespace-pre-wrap break-words px-2.5 py-3 text-[15px] leading-relaxed outline-none",
          disabled && "cursor-not-allowed opacity-50",
        )}
      />
      {value === "" ? (
        <p aria-hidden="true" className="pointer-events-none absolute left-2.5 top-3 text-[15px] leading-relaxed text-muted-foreground">
          {placeholder}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Let the extension edit the draft, then put the result back in the editor.
 *
 * The provider is given the lines and the caret and returns both, so it can do
 * whatever its syntax needs — replace a token, rewrite the line, move the caret
 * past a closing bracket. That makes this a whole-content replacement rather
 * than a range edit, which is why the caret has to be restored by offset
 * afterwards; `render` would otherwise leave it at the top of the editor.
 *
 * If the host cannot answer, the draft is left exactly as the user typed it.
 */
async function applyExtensionCompletion(
  element: HTMLElement,
  projectPath: string | null,
  option: ExtensionCompletionOption,
  emit: () => void,
): Promise<void> {
  if (!projectPath) return;
  const caret = caretOffset(element);
  if (caret === null) return;
  const { lines, cursorLine, cursorCol } = linesAt(serialize(element), caret);

  const { edit } = await rpc.request.tuiApply({
    projectDir: projectPath,
    lines,
    cursorLine,
    cursorCol,
    item: { value: option.value, label: option.label, description: option.detail || undefined },
    prefix: option.prefix,
  });
  if (!edit) return;

  render(element, edit.lines.join("\n"));
  emit();
  caretTo(element, offsetAt(edit.lines, edit.cursorLine, edit.cursorCol));
}
