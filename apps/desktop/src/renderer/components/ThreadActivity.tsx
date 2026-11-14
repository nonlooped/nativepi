import { delegateStatus } from "../lib/delegates.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import { SCROLLBAR_GUTTER_OFFSET, cn } from "../lib/utils.ts";
import BrandIcon from "./BrandIcon.tsx";
import { LightningIcon } from "@phosphor-icons/react/Lightning";
import { useState, type ReactNode } from "react";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { ArrowUpLeftIcon } from "@phosphor-icons/react/ArrowUpLeft";
import { Button } from "./ui/button.tsx";
import { thinkingLabel, useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { toast } from "sonner";
import type { ThreadSnapshot } from "../../shared/orchestration.ts";

async function stop(file: string) {
  try { await rpc.request.stopThread({ sessionFile: file }); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not stop thread"); }
}
export function DelegateRows({ leadFile }: { leadFile: string }) {
  const threads = useAppStore(s => s.orchestration.threads);
  const selected = useAppStore(s => s.activeSessionFile);
  const lead = threads.find(thread => thread.ref.file === leadFile);
  if (!lead?.delegates.length) return null;
  return <div className="mb-1 ml-5 flex max-h-40 flex-col overflow-y-auto border-l border-border pl-2">
    {lead.delegates.map(child => <Button key={child.ref.id} variant={selected === child.ref.file ? "secondary" : "ghost"} className="h-auto min-h-8 justify-start gap-2 px-2 py-1.5 text-xs font-normal" title={`${child.relationship?.label ?? "Delegate"}\n${delegateStatus(child)}\n${child.relationship?.configuration.provider}/${child.relationship?.configuration.model}\n${child.relationship?.configuration.reasoning} · ${child.relationship?.configuration.tier ?? "default"}\n${child.ref.cwd}`} onClick={() => void useAppStore.getState().selectChat(child.ref.file, child.ref.cwd)}>
      <BrandIcon name={providerIconName(child.relationship?.configuration.provider ?? "")} size={14} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">{child.relationship?.label ?? "Delegate"}</span><span className="shrink-0 text-muted-foreground">{delegateStatus(child)}</span>
    </Button>)}
  </div>;
}
export function DelegateFooter({ thread }: { thread: ThreadSnapshot }) {
  const threads = useAppStore(s => s.orchestration.threads);
  const models = useAppStore(s => s.models);
  const relationship = thread.relationship!;
  const config = relationship.configuration;
  const model = models.find(model => model.provider === config.provider && model.id === config.model);
  const error = thread.assignment?.reason ?? thread.startupError;
  const parent = threads.find(t => t.ref.id === relationship.lead.id && t.available !== false);
  return <div className={cn("flex shrink-0 flex-col gap-2 px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]", SCROLLBAR_GUTTER_OFFSET)} data-delegate-footer>
    <div className="composer-surface mx-auto flex min-h-14 w-full max-w-(--conversation-width) items-center gap-3 rounded-2xl border border-transparent bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs" title={`${config.provider}/${config.model}\n${relationship.workspace.mode === "worktree" ? `Worktree: ${relationship.workspace.branch}` : "Shared checkout"}\n${thread.ref.cwd}`}>
          <BrandIcon name={providerIconName(config.provider)} size={16} />
          <span className="truncate font-medium text-foreground">{model?.name ?? config.model}</span>
          <span className="text-muted-foreground/50" aria-hidden>·</span>
          <span className="shrink-0 text-muted-foreground">{thinkingLabel(config.reasoning)}</span>
          {config.tier === "priority" ? <LightningIcon weight="fill" className="size-3.5 shrink-0 text-muted-foreground" aria-label="Priority speed" /> : null}
        </span>
        <span className="text-xs text-muted-foreground" role="status">{delegateStatus(thread)}</span>
      </div>
      {parent ? <Button variant="ghost" size="icon-sm" title="Back to lead" aria-label="Back to lead" onClick={() => void useAppStore.getState().selectChat(parent.ref.file, parent.ref.cwd)}><ArrowUpLeftIcon /></Button> : <span className="text-xs text-muted-foreground">Lead unavailable</span>}
      {thread.busy ? <Button size="icon-lg" className="rounded-full shadow-sm shadow-foreground/10" title="Stop delegate" aria-label="Stop delegate" onClick={() => void stop(thread.ref.file)}><StopIcon weight="fill" /></Button> : null}
    </div>
    {error ? <p className="mx-auto max-h-24 w-full max-w-(--conversation-width) overflow-y-auto break-words px-1 text-xs text-destructive">{error}</p> : null}
  </div>;
}
export default function ThreadActivity() {
  const threads = useAppStore(s => s.orchestration.threads);
  const file = useAppStore(s => s.activeSessionFile);
  const destination = useAppStore(s => s.destination);
  const thread = threads.find(thread => thread.ref.file === file);
  const [selected, setSelected] = useState<string[]>([]);
  const peers = thread?.inbox.filter(message => message.kind === "peer") ?? [];
  const groupBusy = !!thread && !thread.running && thread.busy && thread.delegates.some(child => child.running || ["preparing", "running", "waiting"].includes(child.assignment?.state ?? child.status ?? ""));
  if (destination !== "work" || !thread || thread.relationship || (!peers.length && !groupBusy && !thread.pendingDelivery.length)) return null;
  return <div className="mx-auto max-h-[35vh] w-full max-w-3xl shrink-0 overflow-y-auto px-4 pb-2 text-sm">
    {groupBusy ? <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => void stop(thread.ref.file)}><StopIcon />Stop group</Button></div> : null}
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
  const confirmedNewLead = useAppStore(s => s.confirmedNewLead);
  const error = useAppStore(s => s.orchestrationError);
  const threads = useAppStore(s => s.orchestration.threads);
  const thread = threads.find(thread => thread.ref.file === file);
  if (destination === "work" && file && error && confirmedNewLead !== file) return <div className="flex items-center gap-3 px-4 py-4 text-xs text-muted-foreground"><span className="min-w-0 flex-1 break-words">Thread controls unavailable: {error}</span><Button variant="ghost" size="sm" onClick={() => void useAppStore.getState().selectChat(file)}>Retry</Button></div>;
  if (destination === "work" && file && !loaded && confirmedNewLead !== file) return <div className="px-4 py-4 text-xs text-muted-foreground">Loading thread controls…</div>;
  if (destination === "work" && file && ((!thread && confirmedNewLead !== file) || thread?.available === false)) return <div className="px-4 py-4 text-sm text-muted-foreground">Thread unavailable. Reload its session before sending a message.</div>;
  if (destination === "work" && thread?.roleUnavailable) return <div className="px-4 py-4 text-sm text-muted-foreground">Delegate role unavailable. Transcript remains viewable; input is disabled.</div>;
  if (destination === "work" && thread?.relationship) return <DelegateFooter thread={thread} />;
  return children;
}
