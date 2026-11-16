import { editorDocuments } from "../lib/editorDocuments.ts";
import { useEffect, useRef } from "react";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, StateEffect, Text } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { languages } from "@codemirror/language-data";
import { undo, redo } from "@codemirror/commands";

function editorValueUpdate(state: EditorState, compartment: Compartment, value: string) {
  const separator = value.match(/\r\n|\n|\r/)?.[0] ?? state.lineBreak;
  return {
    effects: compartment.reconfigure(EditorState.lineSeparator.of(separator)),
    changes: { from: 0, to: state.doc.length, insert: Text.of(value.split(separator)) },
  };
}

export default function CodeEditor({ value, file, documentId, line, column, jumpRequest, onChange, onView }: {
  value: string; file: string; documentId: string; line?: number; column?: number; jumpRequest?: number; onChange: (value: string) => void; onView: (view: EditorView | null) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange); const publish = useRef(onView);
  useEffect(() => { change.current = onChange; publish.current = onView; });
  useEffect(() => {
    if (!mount.current) return;
    const saved = editorDocuments.get(documentId);
    const document = saved ?? { state: null as unknown as EditorState, lineSeparator: new Compartment(), changed: (text: string) => change.current(text) };
    document.changed = text => change.current(text);
    const initial = EditorState.create({ doc: value, extensions: [basicSetup, document.lineSeparator.of(EditorState.lineSeparator.of(value.match(/\r\n|\n|\r/)?.[0] ?? "\n")),
      syntaxHighlighting(HighlightStyle.define([{ tag: tags.keyword, color: "var(--primary)" }, { tag: tags.string, color: "var(--success)" }, { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" }, { tag: tags.number, color: "var(--primary)" } ])),
      keymap.of([{ key: "Mod-z", run: undo }, { key: "Mod-Shift-z", run: redo }]),
      EditorView.theme({ "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)" }, ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)", fontSize: "13px" }, ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "none" }, ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--muted)" }, ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" }, "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "var(--accent)" }, ".cm-content": { caretColor: "var(--foreground)" }, "&.cm-focused": { outline: "none" } }),
      EditorView.updateListener.of(update => { document.state = update.state; if (update.docChanged) document.changed(update.state.sliceDoc()); }),
    ] });
    document.state = saved?.state ?? initial;
    if (document.state.sliceDoc() !== value) document.state = document.state.update(editorValueUpdate(document.state, document.lineSeparator, value)).state;
    editorDocuments.set(documentId, document);
    const editor = new EditorView({ parent: mount.current, state: document.state });
    view.current = editor; publish.current(editor);
    let disposed = false;
    const language = languages.find(language => language.filename?.test(file) || language.extensions.some(ext => file.toLowerCase().endsWith(`.${ext}`)));
    void language?.load().then(support => { if (!disposed) editor.dispatch({ effects: StateEffect.appendConfig.of(support) }); });
    return () => { disposed = true; publish.current(null); view.current = null; editor.destroy(); };
  }, [file, documentId]);
  useEffect(() => {
    const editor = view.current;
    const document = editorDocuments.get(documentId);
    if (editor && document && editor.state.sliceDoc() !== value) editor.dispatch(editorValueUpdate(editor.state, document.lineSeparator, value));
  }, [value, documentId]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || !line) return;
    const target = editor.state.doc.line(Math.max(1, Math.min(line, editor.state.doc.lines)));
    const at = target.from + Math.min(Math.max(0, (column ?? 1) - 1), target.length);
    editor.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "center" }) });
    if (mount.current?.closest("[data-pane-active=true]")) editor.focus();
  }, [documentId, line, column, jumpRequest]);
  return <div className="min-h-0 flex-1 overflow-hidden" ref={mount} />;
}
