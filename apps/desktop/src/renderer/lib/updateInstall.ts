import { create } from "zustand";
import { rpc } from "./rpc.ts";
import { eachPaneStore } from "./store.ts";
import { flushPersist } from "./store/internals.ts";
import { dirtyWorkspaceFiles } from "./workspaceEditor.ts";
import { saveRecovery } from "./recovery.ts";

export const useUpdateInstall = create<{ open: boolean; busy: boolean; error?: string }>(() => ({ open: false, busy: false }));
export function requestUpdateInstall() { useUpdateInstall.setState({ open: true, error: undefined }); }
export async function confirmUpdateInstall() {
  if (useUpdateInstall.getState().busy) return;
  useUpdateInstall.setState({ busy: true, error: undefined });
  try {
    const update = await rpc.request.updateState({});
    if (update.status !== "ready") throw new Error("This update is no longer ready. Check for updates again.");
    if (dirtyWorkspaceFiles().length) throw new Error("Save your edited files, or close them and discard their edits, before installing.");
    saveRecovery();
    const service = window.nativepi?.service;
    const status = await service?.("status");
    if (!status || status.running) for (const pane of eachPaneStore()) await flushPersist(pane.getState);
    if (status?.running) await service!("stop");
    const result = await rpc.request.installUpdate({});
    if (!result.ok) throw new Error(result.error ?? "The update could not be installed. Try again.");
    useUpdateInstall.setState({ open: false });
  } catch (error) { useUpdateInstall.setState({ error: error instanceof Error ? error.message : "The update could not be installed. Try again." }); }
  finally { useUpdateInstall.setState({ busy: false }); }
}
