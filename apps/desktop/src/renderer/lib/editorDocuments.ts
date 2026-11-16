import type { Compartment, EditorState } from "@codemirror/state";
/** View history and caret state are UI data, retained only while the file buffer is open. */
export const editorDocuments = new Map<string, { state: EditorState; lineSeparator: Compartment; changed: (text: string) => void }>();
export function forgetEditorDocuments(bufferKey: string) {
  for (const id of editorDocuments.keys()) if (id.startsWith(`${bufferKey}:`)) editorDocuments.delete(id);
}
