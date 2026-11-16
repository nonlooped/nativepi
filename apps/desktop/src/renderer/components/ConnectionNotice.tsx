import { useState } from "react";
import { Button } from "./ui/button.tsx";
import ConfirmDialog from "./ConfirmDialog.tsx";
import { useStore } from "zustand";
import { remoteConnection } from "../lib/connection.ts";
import { isRemote } from "../lib/rpc.ts";
import SettingsDetails from "./settings/SettingsDetails.tsx";
import StateNotice from "./StateNotice.tsx";
export default function ConnectionNotice({ startupError }: { startupError?: string } = {}) {
  const connection = useStore(remoteConnection);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const failure = startupError ?? connection.error;
  const incompatible = !stopped && failure?.includes("incompatible");
  const start = () => { void window.nativepi?.service?.("start").then(() => window.location.reload()).catch(error => setActionError(String(error))); };
  if (connection.phase === "connected" && !startupError) return null;
  if (!isRemote) return <div className="relative z-30 shrink-0 border-b border-border bg-background px-4">
    <StateNotice title={incompatible ? "Another version is still running" : "Background work disconnected"} detail={actionError ? "Could not reconnect. See connection details, then try again." : stopped ? "Background work has stopped. Reconnect to start the current version." : incompatible ? "Stop background work to open this version. Your saved chats will stay available." : "Saved chats are kept. Unsent text stays in this window; reconnect to save it and continue."}
      retry={incompatible ? undefined : start} />
    {incompatible && <Button variant="outline" size="sm" className="mb-3" onClick={() => setConfirmStop(true)}>Stop background work…</Button>}
    {(startupError || actionError) && <SettingsDetails id="startup-connection-details" title="Connection details"><p className="break-words text-xs leading-5 text-muted-foreground">{actionError ?? failure}</p></SettingsDetails>}
    <ConfirmDialog open={confirmStop} title="Stop the incompatible service?" description="This stops its agents, project commands and terminals. Your Pi transcripts are saved. You can then start the updated host." confirmLabel="Stop all work" destructive onCancel={() => setConfirmStop(false)} onConfirm={() => { setConfirmStop(false); void window.nativepi?.service?.("stop").then(() => setStopped(true)).catch(error => setActionError(String(error))); }} />
  </div>;
  const waiting = connection.phase !== "unavailable";
  return <div className="relative z-30 shrink-0 border-b border-border bg-background px-4">
    <StateNotice loading={waiting} title={connection.phase === "connecting" ? "Connecting to NativePi…" : waiting ? "Reconnecting to your desktop…" : "This link is no longer available"}
      detail={waiting ? "Displayed information may be out of date. Keep the host computer awake and background work running. Unsent text stays in this window." : "Open “Open on another device” on the computer and use its current link. Sharing may have stopped or the link may have been replaced."}
      retry={waiting ? undefined : () => window.location.reload()} />
  </div>;
}
