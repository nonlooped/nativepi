import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { editorDocuments } from "../lib/editorDocuments.ts";
import CodeEditor from "./CodeEditor.tsx";

for (const separator of ["\r\n", "\n"]) test(`editor preserves ${JSON.stringify(separator)} on open, edit and remount`, async () => {
  const initial = `first${separator}second${separator}`;
  let value = initial;
  let view: EditorView | null = null;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const render = async (key: string) => act(async () => root.render(<CodeEditor key={key} file="file.txt" documentId="line-ending-test" value={value} onChange={text => { value = text; }} onView={editor => { view = editor; }} />));
  const editor = () => view!;
  try {
    await render("initial");
    expect(value).toBe(initial);
    await act(async () => editor().dispatch({ changes: { from: 0, insert: "changed " } }));
    expect(value).toBe(`changed ${initial}`);
    await render("remount");
    await act(async () => { undo(editor()); });
    expect(value).toBe(initial);
    value = "external\nreplacement\n";
    await render("remount");
    await act(async () => editor().dispatch({ changes: { from: 0, insert: "edited " } }));
    expect(value).toBe("edited external\nreplacement\n");
  } finally { await act(async () => root.unmount()); container.remove(); editorDocuments.clear(); }
});


test("switching away and back restores the editor selection, undo buffer and scroll position", async () => {
  let view: EditorView | null = null;
  let value = "first\nsecond\nthird";
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const render = async (key: string) => act(async () => root.render(<CodeEditor key={key} file="file.txt" documentId="view-state-test" value={value} onChange={text => { value = text; }} onView={editor => { view = editor; }} />));
  try {
    await render("open");
    await act(async () => view!.dispatch({ changes: { from: 0, insert: "edit " }, selection: { anchor: 8 } }));
    view!.scrollDOM.scrollTop = 220;
    view!.scrollDOM.dispatchEvent(new Event("scroll"));
    await render("return");

    expect(view!.state.selection.main.head).toBe(8);
    expect(editorDocuments.get("view-state-test")?.scroll?.top).toBe(220);
    await act(async () => { undo(view!); });
    expect(value).toBe("first\nsecond\nthird");
  } finally { await act(async () => root.unmount()); container.remove(); editorDocuments.clear(); }
});
