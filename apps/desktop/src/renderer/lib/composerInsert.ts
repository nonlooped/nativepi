/**
 * Where text from outside the composer lands in it.
 *
 * `insertIntoComposer` in the store appends to the draft, which is right for the
 * transcript's own actions: quoting a reply or sending a code block over is a
 * new paragraph at the end, and the composer may not even be focused. A paste
 * from `ctx.ui.pasteToEditor()` is the other thing — the terminal editor inserts
 * it where the caret is, and an extension completing a path or a ticket number
 * mid-sentence means it there.
 *
 * The caret lives in the DOM, not in the store, so the editor registers how to
 * reach it and the store asks. Nothing is registered when no composer is mounted
 * and nothing answers when the caret is elsewhere, and both fall back to the
 * append the store already does.
 */

type Inserter = (text: string) => boolean;

let inserter: Inserter | null = null;

/** Called by the composer while it is mounted; returns the unregister. */
export function registerComposerInserter(insert: Inserter): () => void {
  inserter = insert;
  return () => {
    if (inserter === insert) inserter = null;
  };
}

/** `false` when there is no composer with a caret to insert into. */
export function insertAtComposerCaret(text: string): boolean {
  return inserter?.(text) ?? false;
}
