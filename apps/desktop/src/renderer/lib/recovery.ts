import { z } from "zod";
import { eachPaneStore, useAppStore } from "./store.ts";
import { dirtyWorkspaceFiles, useWorkspaceEditor } from "./workspaceEditor.ts";
import { flushPersist } from "./store/internals.ts";
import { isRemote } from "./rpc.ts";

const KEY = "nativepi-unsaved-recovery";
const fileSchema = z.object({ key: z.string(), projectDir: z.string(), file: z.string(), text: z.string(), saved: z.string(), revision: z.string() });
const recoverySchema = z.object({ version: z.literal(1), drafts: z.record(z.string(), z.string()), files: z.array(fileSchema) });
export type Recovery = z.infer<typeof recoverySchema>;
function keepBoth(current: string | undefined, recovered: string): string {
  const suffix = `\n\n— Recovered draft —\n${recovered}`;
  return !current || current === recovered ? recovered : current.endsWith(suffix) ? current : current + suffix;
}
export function readRecovery(): Recovery | null {
  try { const parsed = recoverySchema.safeParse(JSON.parse(window.localStorage.getItem(KEY) ?? "null")); return parsed.success ? parsed.data : null; } catch { return null; }
}
/** A recovery copy of NativePi-owned unsent text only; Pi transcripts remain authoritative. */
export function saveRecovery(): void {
  const previous = readRecovery();
  const drafts = { ...previous?.drafts };
  for (const [key, text] of eachPaneStore().flatMap(store => Object.entries(store.getState().drafts)).filter(([, text]) => text.trim())) drafts[key] = keepBoth(text, previous?.drafts[key] ?? text);
  const filesByKey = new Map(previous?.files.map(file => [file.key, file]));
  for (const { key, projectDir, file, text, saved, revision } of dirtyWorkspaceFiles()) filesByKey.set(key, { key, projectDir, file, text: keepBoth(text, filesByKey.get(key)?.text ?? text), saved, revision });
  const files = [...filesByKey.values()];
  if (files.length || Object.keys(drafts).length) window.localStorage.setItem(KEY, JSON.stringify({ version: 1, drafts, files }));
}
export function discardRecovery(): void { window.localStorage.removeItem(KEY); }
export async function restoreRecovery(recovery: Recovery): Promise<void> {
  const store = useAppStore;
  const drafts = { ...store.getState().drafts };
  for (const [key, text] of Object.entries(recovery.drafts)) {
    drafts[key] = keepBoth(drafts[key], text);
  }
  store.setState({ drafts });
  for (const file of recovery.files) {
    try { await useWorkspaceEditor.getState().open(file.projectDir, file.file); } catch { /* Keep recovery text even if the original disappeared. */ }
    const current = useWorkspaceEditor.getState().buffers[file.key];
    const conflict = !current || current.revision !== file.revision;
    const text = current && current.text !== current.saved && current.text !== file.text ? `${current.text}\n\n— Recovered edits —\n${file.text}` : file.text;
    useWorkspaceEditor.setState(state => ({ buffers: { ...state.buffers, [file.key]: {
      ...file, text, saving: false, conflict,
      ...(conflict ? { error: "The file changed since recovery was saved. Your recovered edits are kept; copy them before reloading the file." } : {}),
    } } }));
  }
  const first = recovery.files[0];
  if (first) { await store.getState().openProjectPath(first.projectDir); await useWorkspaceEditor.getState().open(first.projectDir, first.file); }
  if (!isRemote) { await flushPersist(store.getState); discardRecovery(); }
}
