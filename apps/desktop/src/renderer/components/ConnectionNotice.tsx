import { useStore } from "zustand";
import { remoteConnection } from "../lib/connection.ts";
import { isRemote } from "../lib/rpc.ts";
import StateNotice from "./StateNotice.tsx";
export default function ConnectionNotice() {
  const connection = useStore(remoteConnection);
  if (!isRemote || connection.phase === "connected") return null;
  const waiting = connection.phase !== "unavailable";
  return <div className="relative z-30 shrink-0 border-b border-border bg-background px-4">
    <StateNotice loading={waiting} title={connection.phase === "connecting" ? "Connecting to NativePi…" : waiting ? "Reconnecting to your desktop…" : "This link is no longer available"}
      detail={waiting ? "Displayed information may be out of date. Keep the desktop app open; your draft is preserved." : "Open Access in the desktop app and use its current link. Access may have stopped or the token may have changed."}
      retry={waiting ? undefined : () => window.location.reload()} />
  </div>;
}
