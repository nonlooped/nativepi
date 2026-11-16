import { useEffect, useState } from "react";
import { Button } from "./ui/button.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog.tsx";
import SettingsDetails from "./settings/SettingsDetails.tsx";
import { readRecovery, saveRecovery, restoreRecovery, discardRecovery, type Recovery } from "../lib/recovery.ts";
import { dirtyWorkspaceFiles } from "../lib/workspaceEditor.ts";
import { useAppStore } from "../lib/store.ts";
import { confirmUpdateInstall, useUpdateInstall } from "../lib/updateInstall.ts";

export function UpdateInstallDialog() {
  const { open, busy, error } = useUpdateInstall();
  return <Dialog open={open} onOpenChange={next => { if (!busy) useUpdateInstall.setState({ open: next }); }}><DialogContent>
    <DialogHeader><DialogTitle>Install update and restart?</DialogTitle><DialogDescription>Pi, project commands, terminals and shared links will stop. Chats and drafts are saved.</DialogDescription></DialogHeader>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => useUpdateInstall.setState({ open: false })}>Keep working</Button><Button disabled={busy} onClick={() => void confirmUpdateInstall()}>{busy ? "Preparing update…" : "Stop work and install"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
export function RecoveredWorkDialog() {
  const [recovery, setRecovery] = useState<Recovery | null>(readRecovery);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <Dialog open={!!recovery} onOpenChange={() => {}}><DialogContent>
    <DialogHeader><DialogTitle>Restore unsaved work?</DialogTitle><DialogDescription>A local recovery copy contains {recovery?.files.length ?? 0} file edits and {Object.keys(recovery?.drafts ?? {}).length} chat drafts. Files on disk stay unchanged; conflicting drafts are kept together.</DialogDescription></DialogHeader>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => { discardRecovery(); setRecovery(null); }}>Discard recovery copy</Button><Button disabled={busy} onClick={() => { if (!recovery) return; setBusy(true); void restoreRecovery(recovery).then(() => setRecovery(null)).catch(() => setError("Could not restore everything. The recovery copy is kept; try again.")).finally(() => setBusy(false)); }}>{busy ? "Restoring…" : "Restore unsaved work"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
export function CrashRecovery({ error }: { error: string }) {
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  useEffect(() => { try { saveRecovery(); setSaved(true); } catch { setFailed(true); } }, []);
  const files = dirtyWorkspaceFiles();
  const drafts = Object.entries(useAppStore.getState().drafts).filter(([, text]) => text.trim());
  return <>
    <p className="text-sm text-body-muted-foreground">NativePi couldn’t display this workspace. Saved conversations are kept. {saved ? "Drafts and file edits can be restored after reloading." : "Your unsaved text is still available below. Copy it before reloading."}</p>
    {failed && <p role="alert" className="text-sm text-destructive">The recovery copy could not be saved on this device.</p>}
    <SettingsDetails id="crash-unsaved" title="Unsaved text" summary={`${files.length} file edits · ${drafts.length} drafts`}>
      <div className="max-h-64 space-y-3 overflow-y-auto text-left">{files.map(file => <div key={file.key}><p className="mb-1 break-all text-xs">{file.file}</p><Textarea readOnly value={file.text} rows={4} /></div>)}{drafts.map(([key,text],i) => <div key={key}><p className="mb-1 text-xs">Draft {i+1}</p><Textarea readOnly value={text} rows={3} /></div>)}</div>
    </SettingsDetails>
    <SettingsDetails id="crash-details" title="Error details"><p className="break-words text-left font-mono text-xs text-muted-foreground">{error}</p></SettingsDetails>
    <Button variant="outline" disabled={!saved && !failed} onClick={() => saved ? window.location.reload() : setShowDiscard(true)}>Reload window</Button>
    <Dialog open={showDiscard} onOpenChange={setShowDiscard}><DialogContent><DialogHeader><DialogTitle>Reload without a recovery copy?</DialogTitle><DialogDescription>Any unsaved file edits and drafts may be lost. Copy the text before continuing.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setShowDiscard(false)}>Keep text open</Button><Button variant="destructive" onClick={() => window.location.reload()}>Discard and reload</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
