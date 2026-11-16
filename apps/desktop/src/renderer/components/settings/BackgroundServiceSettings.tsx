import { useEffect, useState } from "react";
import type { ServiceAction, ServiceStatus } from "../../../shared/background-service.ts";
import { ActionRow, SettingsSection, SwitchRow } from "./rows.tsx";
import { Button } from "../ui/button.tsx";
import ConfirmDialog from "../ConfirmDialog.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog.tsx";
import StateNotice from "../StateNotice.tsx";

export default function BackgroundServiceSettings() {
  const [status, setStatus] = useState<ServiceStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [manage, setManage] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const service = window.nativepi?.service;
  useEffect(() => { void service?.("status").then(setStatus).catch(error => setError(String(error))); }, [service]);
  if (!service) return null;
  const act = async (action: ServiceAction) => {
    setBusy(true); setError(undefined);
    try { setStatus(await service(action)); setConfirmStop(false); if (action === "start") window.location.reload(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <SettingsSection id="background-service" heading="Background work">
    <ActionRow label="Keep work running" description="Agents keep working when you close the window.">
      <div className="flex items-center gap-3"><span role="status" className="text-xs text-muted-foreground">{status ? status.running ? "Running" : "Stopped" : "Checking…"}</span>
      <Button size="sm" variant="outline" onClick={() => setManage(true)}>Manage…</Button></div>
    </ActionRow>
    <Dialog open={manage} onOpenChange={setManage}><DialogContent>
      <DialogHeader><DialogTitle>Background work</DialogTitle><DialogDescription>Manage work that continues after you close NativePi.</DialogDescription></DialogHeader>
      <SwitchRow label="Start at sign-in" description="Start background work when you sign in to this computer. Available in installed builds." checked={status?.startAtLogin ?? false} disabled={busy || !status} onChange={enabled => void act(enabled ? "enableLogin" : "disableLogin")} />
      <ActionRow label={status?.running ? "Stop background work" : "Resume background work"} description={status?.running ? "Ends running agents, terminals and shared access links." : "Your saved chats remain available."}>
        <Button size="sm" variant="outline" disabled={busy || !status} onClick={() => status?.running ? setConfirmStop(true) : void act("start")}>{busy ? "Working…" : status?.running ? "Stop work…" : "Resume work"}</Button>
      </ActionRow>
      {status && !status.compatible && <p role="alert" className="text-xs leading-5 text-destructive">Stop background work, then restart NativePi to use the updated version.</p>}
      <DialogFooter><Button variant="ghost" onClick={() => setManage(false)}>Done</Button></DialogFooter>
    </DialogContent></Dialog>
    <ConfirmDialog open={confirmStop} title="Stop all agents and terminals?" description="Running work and shared links will end. Your saved chats stay available." confirmLabel="Stop all work" destructive onConfirm={() => void act("stop")} onCancel={() => setConfirmStop(false)} />
    {error && <StateNotice title="Could not update background work" detail={error} />}
  </SettingsSection>;
}
