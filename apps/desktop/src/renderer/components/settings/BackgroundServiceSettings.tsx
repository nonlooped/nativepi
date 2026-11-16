import { useEffect, useState } from "react";
import type { ServiceAction, ServiceStatus } from "../../../shared/background-service.ts";
import { ActionRow, ReadonlyRow, SettingsSection, SwitchRow } from "./rows.tsx";
import { Button } from "../ui/button.tsx";
import ConfirmDialog from "../ConfirmDialog.tsx";
import StateNotice from "../StateNotice.tsx";

export default function BackgroundServiceSettings() {
  const [status, setStatus] = useState<ServiceStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
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
  return <SettingsSection id="background-service" heading="Background service" description="Pi agents, terminals and scheduled automations run independently of this window. Closing NativePi leaves them running on this computer. Sleep pauses work; shutdown ends it.">
    <ReadonlyRow label="Service status" value={status ? status.running ? `Running · ${status.version}${status.compatible ? "" : " · upgrade required"}` : "Stopped" : "Checking…"} />
    <SwitchRow label="Start service at login" description="Start the local host when you sign in, without opening this window. Available in installed builds." checked={status?.startAtLogin ?? false} disabled={busy || !status} onChange={enabled => void act(enabled ? "enableLogin" : "disableLogin")} />
    <ActionRow label={status?.running ? "Stop background service" : "Start background service"} description={status?.running ? "Ends every running agent, terminal and shared access link. Stop before replacing the installed app." : "Starts the host. Interrupted turns require an explicit new message; they are never replayed."}>
      <Button size="sm" variant="outline" disabled={busy || !status} onClick={() => status?.running ? setConfirmStop(true) : void act("start")}>{busy ? "Working…" : status?.running ? "Stop service…" : "Start service"}</Button>
    </ActionRow>
    <ConfirmDialog open={confirmStop} title="Stop all agents and terminals?" description="Pi transcripts are saved. Running turns, terminals and shared access links will end." confirmLabel="Stop all work" destructive onConfirm={() => void act("stop")} onCancel={() => setConfirmStop(false)} />
    {error && <StateNotice title="Service action failed" detail={error} />}
  </SettingsSection>;
}
