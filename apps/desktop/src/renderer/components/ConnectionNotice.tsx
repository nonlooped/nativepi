import { useState } from "react";
import { Button } from "./ui/button.tsx";
import ConfirmDialog from "./ConfirmDialog.tsx";
import { useStore } from "zustand";
import { remoteConnection } from "../lib/connection.ts";
import { isRemote } from "../lib/rpc.ts";
import StateNotice from "./StateNotice.tsx";
export default function ConnectionNotice({ startupError }: { startupError?: string } = {}) {
  const connection = useStore(remoteConnection);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const start = () => { void window.nativepi?.service?.("start").then(() => window.location.reload()).catch(error => setActionError(String(error))); };
  if (connection.phase === "connected" && !startupError) return null;
  if (!isRemote) return <div className="relative z-30 shrink-0 border-b border-border bg-background px-4">
    <StateNotice title="Background work disconnected" detail={actionError ?? (stopped ? "Background work has stopped. Reconnect to start the current version." : startupError ?? connection.error ?? "Your chats are saved. Reconnect to continue.")}
      retry={start} />
    {!stopped && (startupError ?? connection.error)?.includes("incompatible") && <Button variant="outline" size="sm" className="mb-3" onClick={() => setConfirmStop(true)}>Stop incompatible service…</Button>}
    <ConfirmDialog open={confirmStop} title="Stop the incompatible service?" description="This ends its running agents and terminals. Your Pi transcripts are saved. You can then start the updated host." confirmLabel="Stop all work" destructive onCancel={() => setConfirmStop(false)} onConfirm={() => { setConfirmStop(false); void window.nativepi?.service?.("stop").then(() => setStopped(true)).catch(error => setActionError(String(error))); }} />
  </div>;
  const waiting = connection.phase !== "unavailable";
  return <div className="relative z-30 shrink-0 border-b border-border bg-background px-4">
    <StateNotice loading={waiting} title={connection.phase === "connecting" ? "Connecting to NativePi…" : waiting ? "Reconnecting to your desktop…" : "This link is no longer available"}
      detail={waiting ? "Displayed information may be out of date. Keep the desktop app open; your draft is preserved." : "Open Access in the desktop app and use its current link. Access may have stopped or the token may have changed."}
      retry={waiting ? undefined : () => window.location.reload()} />
  </div>;
}
