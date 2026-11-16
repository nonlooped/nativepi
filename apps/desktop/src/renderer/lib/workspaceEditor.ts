import { forgetEditorDocuments } from "./editorDocuments.ts";
import { focusedPaneStore } from "./store.ts";
import { runtime } from "./store/internals.ts";
import { create } from "zustand";
import { rpc } from "./rpc.ts";

export type FileBuffer = { key: string; projectDir: string; file: string; text: string; saved: string; revision: string; error?: string; conflict?: boolean; saving: boolean; line?: number; column?: number; jumpRequest?: number };
let openSequence = 0;
const openRequests = new Map<string, number>();
const keyFor = (projectDir: string, file: string) => JSON.stringify([projectDir, file]);
export const useWorkspaceEditor = create<{
  buffers: Record<string, FileBuffer>; selected: Record<string, string>; loading: Record<string, string>;
  open: (projectDir: string, file: string, line?: number, paneId?: string, column?: number) => Promise<void>;
  edit: (key: string, text: string) => void;
  save: (key: string) => Promise<boolean>;
  refresh: (key: string, discard?: boolean) => Promise<void>;
  close: (key: string) => void;
}>((set, get) => ({
  buffers: {}, selected: {}, loading: {},
  open: async (projectDir, file, line, paneId = runtime(focusedPaneStore().getState).paneId, column) => {
    const key = keyFor(projectDir, file);
    const selectionKey = `${paneId}:${projectDir}`;
    const request = ++openSequence; openRequests.set(selectionKey, request);
    set(s => ({ loading: { ...s.loading, [selectionKey]: file } }));
    try {
    if (!get().buffers[key]) {
      const result = await rpc.request.readWorkspaceFile({ projectDir, file });
      if (result.error || result.text === undefined || !result.revision) throw new Error(result.error ?? "Could not read this file.");
      // Another open may have completed while this read was in flight.
      if (!get().buffers[key]) set(s => ({ buffers: { ...s.buffers, [key]: { key, projectDir, file, text: result.text!, saved: result.text!, revision: result.revision!, saving: false, line } } }));
    }
    if (openRequests.get(selectionKey) !== request) return;
    set(s => ({ selected: { ...s.selected, [`${paneId}:${projectDir}`]: key }, buffers: { ...s.buffers, [key]: { ...s.buffers[key]!, line, column, jumpRequest: (s.buffers[key]!.jumpRequest ?? 0) + 1 } } }));
    } finally {
      if (openRequests.get(selectionKey) === request) {
        openRequests.delete(selectionKey);
        set(s => ({ loading: Object.fromEntries(Object.entries(s.loading).filter(([id]) => id !== selectionKey)) }));
      }
    }
  },
  edit: (key, text) => set(s => ({ buffers: { ...s.buffers, [key]: { ...s.buffers[key]!, text } } })),
  save: async key => {
    const buffer = get().buffers[key];
    if (!buffer || buffer.saving) return false;
    set(s => ({ buffers: { ...s.buffers, [key]: { ...buffer, saving: true, error: undefined } } }));
    try {
      const result = await rpc.request.saveWorkspaceFile({ projectDir: buffer.projectDir, file: buffer.file, text: buffer.text, revision: buffer.revision });
      const current = get().buffers[key];
      if (!current) return false;
      set(s => ({ buffers: { ...s.buffers, [key]: { ...current, saving: false, ...(result.ok && result.revision ? { saved: buffer.text, revision: result.revision, conflict: false, error: undefined } : { error: result.error ?? "Save failed. Your edits are still here.", conflict: result.conflict }) } } }));
      return result.ok;
    } catch (error) {
      set(s => ({ buffers: { ...s.buffers, [key]: { ...s.buffers[key]!, saving: false, error: String(error) } } }));
      return false;
    }
  },
  refresh: async (key, discard = false) => {
    const buffer = get().buffers[key];
    if (!buffer || buffer.saving) return;
    try {
      const result = await rpc.request.readWorkspaceFile({ projectDir: buffer.projectDir, file: buffer.file });
      const current = get().buffers[key];
      if (!current || current.saving || current.revision !== buffer.revision || (discard && current.text !== buffer.text)) return;
      if (result.error) throw new Error(result.error);
      if (result.text === undefined || !result.revision || (!discard && result.revision === current.revision)) return;
      const dirty = current.text !== current.saved;
      set(s => ({ buffers: { ...s.buffers, [key]: dirty && !discard ? { ...current, conflict: true, error: "Changed on disk. Your unsaved edits have been kept. Reload to discard them." } : { ...current, text: result.text!, saved: result.text!, revision: result.revision!, conflict: false, error: undefined } } }));
    } catch (error) { set(s => ({ buffers: { ...s.buffers, [key]: { ...s.buffers[key]!, error: String(error) } } })); }
  },
  close: key => set(s => {
    forgetEditorDocuments(key);
    const { [key]: removed, ...buffers } = s.buffers;
    return { buffers, selected: Object.fromEntries(Object.entries(s.selected).filter(([, selected]) => selected !== key)) };
  }),
}));

export async function openWorkspaceFile(projectDir: string, file: string, line?: number, column?: number, paneId?: string) {
  await useWorkspaceEditor.getState().open(projectDir, file, line, paneId, column);
}
export const dirtyWorkspaceFiles = () => Object.values(useWorkspaceEditor.getState().buffers).filter(b => b.text !== b.saved);
