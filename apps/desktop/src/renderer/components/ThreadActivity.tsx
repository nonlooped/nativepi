import { useState, type ReactNode } from "react";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { ArrowUpLeftIcon } from "@phosphor-icons/react/ArrowUpLeft";
import { Button } from "./ui/button.tsx";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { toast } from "sonner";
import type { ThreadSnapshot } from "../../shared/orchestration.ts";

async function stop(file: string) {
  try { await rpc.request.stopThread({ sessionFile: file }); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not stop thread"); }
}
function status(thread: ThreadSnapshot["delegates"][number]) {
  return thread.assignment?.state === "waiting" ? "Waiting for lead" : thread.assignment?.state ?? thread.status ?? (thread.running ? "Working" : "Preparing");
}
export function DelegateRows({ leadFile }: { leadFile: string }) {
  const threads = useAppStore(s => s.orchestration.threads);
  const selected = useAppStore(s => s.activeSessionFile);
  const lead = threads.find(thread => thread.ref.file === leadFile);
  if (!lead?.delegates.length) return null;
  return <div className="mb-1 ml-5 flex max-h-40 flex-col overflow-y-auto border-l border-border pl-2">
    {lead.delegates.map(child => <Button key={child.ref.id} variant={selected === child.ref.file ? "secondary" : "ghost"} className="h-auto min-h-8 justify-start gap-2 px-2 py-1.5 text-xs font-normal" title={`${child.relationship?.label ?? "Delegate"}\n${status(child)}\n${child.relationship?.configuration.provider}/${child.relationship?.configuration.model}\n${child.relationship?.configuration.reasoning} · ${child.relationship?.configuration.tier ?? "default"}\n${child.ref.cwd}`} onClick={() => void useAppStore.getState().selectChat(child.ref.file, child.ref.cwd)}>
      <span className="min-w-0 flex-1 truncate text-left">{child.relationship?.label ?? "Delegate"}</span><span className="shrink-0 text-muted-foreground">{status(child)}</span>
    </Button>)}
  </div>;
}
export function DelegateFooter({ thread }: { thread: ThreadSnapshot }) {
  const threads = useAppStore(s => s.orchestration.threads);
  const relationship = thread.relationship!;
  const error = thread.assignment?.reason ?? thread.startupError;
  const parent = threads.find(t => t.ref.id === relationship.lead.id && t.available !== false);
  return <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4 text-sm text-muted-foreground" data-delegate-footer>
    <div className="min-w-0 flex-1"><p className="truncate">{relationship.label} · {status(thread)}</p><p className="truncate text-xs" title={thread.ref.cwd}>{relationship.configuration.model} · {relationship.configuration.reasoning} · {relationship.configuration.tier ?? "default"}{relationship.workspace.mode === "worktree" ? ` · ${relationship.workspace.branch}` : ""}</p>{error ? <p className="mt-1 max-h-24 overflow-y-auto break-words text-xs text-destructive">{error}</p> : null}</div>
    {parent ? <Button variant="ghost" size="sm" onClick={() => void useAppStore.getState().selectChat(parent.ref.file, parent.ref.cwd)}><ArrowUpLeftIcon />Lead</Button> : <span className="text-xs">Lead unavailable</span>}
    {thread.busy ? <Button variant="outline" size="sm" onClick={() => void stop(thread.ref.file)}><StopIcon />Stop</Button> : null}
  </div>;
}
export default function ThreadActivity() {
  const threads = useAppStore(s => s.orchestration.threads);
  const file = useAppStore(s => s.activeSessionFile);
  const destination = useAppStore(s => s.destination);
  const thread = threads.find(thread => thread.ref.file === file);
  const [selected, setSelected] = useState<string[]>([]);
  if (destination !== "work" || !thread || thread.relationship || (!thread.delegates.length && !thread.inbox.length && !thread.busy && !thread.pendingDelivery.length)) return null;
  const peers = thread.inbox.filter(message => message.kind === "peer");
  return <div className="mx-auto max-h-[35vh] w-full max-w-3xl shrink-0 overflow-y-auto px-4 pb-2 text-sm">
    <div className="flex items-center gap-2 text-muted-foreground"><span className="flex-1">{thread.delegates.length ? `${thread.delegates.length} delegate${thread.delegates.length === 1 ? "" : "s"}` : "Thread activity"}</span>{thread.busy ? <Button variant="ghost" size="sm" onClick={() => void stop(thread.ref.file)}><StopIcon />Stop group</Button> : null}</div>
    <DelegateRows leadFile={thread.ref.file} />
    {thread.inbox.filter(message => message.kind === "question" && thread.delegates.some(child => child.assignment?.questions.includes(message.id))).map(message => <p key={message.id} className="my-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-primary pl-3 text-xs"><span className="font-medium">Question from {thread.delegates.find(child => child.ref.id === message.source.id)?.relationship?.label ?? message.source.id}: </span>{message.content}</p>)}
    {thread.pendingDelivery.length ? <p className="py-1 text-xs text-muted-foreground">{thread.pendingDelivery.length} message delivery pending. Accepted content is retained.</p> : null}
    {peers.length ? <details className="mt-1 rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-xs text-muted-foreground">Inbox · {peers.filter(message => !thread.readMessageIds.includes(message.id)).length} unread · {peers.length} pending</summary><div className="mt-2 max-h-48 space-y-3 overflow-y-auto">
      {peers.map(message => <label key={message.id} className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" checked={selected.includes(message.id)} onChange={event => setSelected(current => event.target.checked ? [...current, message.id] : current.filter(id => id !== message.id))} /><span className="min-w-0"><span className="block text-xs text-muted-foreground">{message.source.id} · {new Date(message.timestamp).toLocaleString()} · Delivered to inbox</span><span className="whitespace-pre-wrap break-words text-xs">{message.content}</span></span></label>)}
    </div><Button className="mt-3" variant="secondary" size="sm" disabled={!selected.some(id => peers.some(message => message.id === id))} onClick={() => { const ids = selected.filter(id => peers.some(message => message.id === id)); void rpc.request.wakeThread({ threadId: thread.ref.id, messageIds: ids }).then(() => setSelected([])).catch(error => toast.error(String(error))); }}>Resume with selected messages</Button></details> : null}
  </div>;
}

/** Cold metadata must settle before any user input surface is mounted. */
export function ThreadInputBoundary({ children }: { children: ReactNode }) {
  const file = useAppStore(s => s.activeSessionFile);
  const destination = useAppStore(s => s.destination);
  const loaded = useAppStore(s => s.orchestrationLoaded);
  const error = useAppStore(s => s.orchestrationError);
  const threads = useAppStore(s => s.orchestration.threads);
  const thread = threads.find(thread => thread.ref.file === file);
  if (destination === "work" && file && error) return <div className="flex items-center gap-3 px-4 py-4 text-xs text-muted-foreground"><span className="min-w-0 flex-1 break-words">Thread controls unavailable: {error}</span><Button variant="ghost" size="sm" onClick={() => void useAppStore.getState().selectChat(file)}>Retry</Button></div>;
  if (destination === "work" && file && !loaded) return <div className="px-4 py-4 text-xs text-muted-foreground">Loading thread controls…</div>;
  if (destination === "work" && file && (!thread || thread.available === false)) return <div className="px-4 py-4 text-sm text-muted-foreground">Thread unavailable. Reload its session before sending a message.</div>;
  if (destination === "work" && thread?.roleUnavailable) return <div className="px-4 py-4 text-sm text-muted-foreground">Delegate role unavailable. Transcript remains viewable; input is disabled.</div>;
  if (destination === "work" && thread?.relationship) return <DelegateFooter thread={thread} />;
  return children;
}
