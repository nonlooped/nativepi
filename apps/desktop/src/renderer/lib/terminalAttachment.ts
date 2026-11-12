import { clientIdentity } from "./clientIdentity.ts";
import { rpc } from "./rpc.ts";

/** Subscribe before attach; the snapshot fences overlapping live bytes by sequence. */
export function attachTerminal(projectDir: string, terminalId: string, write: (data: string) => void, ready: () => void, failed: () => void) {
  let attachmentId: string;
  try { attachmentId = clientIdentity(); } catch { failed(); return () => {}; }
  let disposed = false;
  let live = false;
  let sequence = -1;
  const pending: { data: string; sequence: number }[] = [];
  const detach = () => rpc.request.terminalDetach({ projectDir, terminalId, attachmentId }).catch(() => {});
  const off = rpc.events.on("terminalData", payload => {
    if (payload.projectDir !== projectDir || payload.terminalId !== terminalId) return;
    if (!live) pending.push(payload);
    else if (payload.sequence > sequence) { sequence = payload.sequence; write(payload.data); }
  });
  void rpc.request.terminalAttach({ projectDir, terminalId, attachmentId }).then(snapshot => {
    if (disposed) { void detach(); return; }
    sequence = snapshot.sequence;
    write(snapshot.output);
    for (const item of pending) if (item.sequence > sequence) { sequence = item.sequence; write(item.data); }
    pending.length = 0;
    live = true;
    ready();
  }, () => { if (!disposed) failed(); });
  return () => { disposed = true; pending.length = 0; off(); void detach(); };
}
