import { z } from "zod";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { toast } from "sonner";
import type { ToolCall, ToolResultMessage } from "../../shared/pi-types.ts";
import { threadReferenceSchema } from "../../shared/orchestration.ts";
import { textOf } from "../../shared/messages.ts";
import { useAppStore, usePaneStore } from "../lib/store.ts";
import { delegateStatus } from "../lib/delegates.ts";
import { providerIconName } from "../lib/providerIcons.ts";
import BrandIcon from "./BrandIcon.tsx";
import { rpc } from "../lib/rpc.ts";
import { Button } from "./ui/button.tsx";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card.tsx";

const spawnResultSchema = z.object({ ref: threadReferenceSchema.optional(), status: z.string().optional(), error: z.string().optional(), reason: z.string().optional() });
function spawnResult(result: ToolResultMessage | undefined) {
  if (!result) return undefined;
  let value = result.details;
  if (value === undefined) {
    try { value = JSON.parse(textOf(result.content)); } catch { return undefined; }
  }
  const parsed = spawnResultSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** A live resource row anchored to the original Pi tool call, never to prompt text. */
export default function DelegateInvocation({ call, result }: { call: ToolCall; result?: ToolResultMessage }) {
  const useAppStore = usePaneStore();
  const threads = useAppStore(s => s.orchestration.threads);
  const file = useAppStore(s => s.activeSessionFile);
  const recorded = spawnResult(result);
  const lead = threads.find(thread => thread.ref.file === file);
  const recordedId = recorded?.ref?.id;
  const leadId = lead?.ref.id;
  const child = threads.find(thread => thread.ref.id === recordedId)
    ?? threads.find(thread => {
      const relationship = thread.relationship;
      return !!relationship && relationship.lead.id === leadId && relationship.lead.file === file && relationship.sourceToolCallId === call.id;
    });
  const ref = child?.ref ?? recorded?.ref;
  const relationship = child?.relationship;
  const owned = !!relationship && relationship.lead.id === leadId && relationship.lead.file === file;
  const state = child?.assignment?.state ?? child?.status;
  const working = !!child && (child.running || ["preparing", "running"].includes(state ?? ""));
  const active = working || state === "waiting";
  const failed = !!result?.isError || recorded?.status === "failed" || state === "failed";
  const label = relationship?.label ?? (typeof call.arguments.label === "string" ? call.arguments.label : "Delegate");
  const status = child?.available === false ? "Unavailable" : child ? delegateStatus(child) : failed ? "Failed" : result ? "Status unavailable" : "Awaiting spawn result";
  const error = child?.assignment?.reason ?? child?.startupError ?? recorded?.error ?? recorded?.reason ?? (result?.isError ? textOf(result.content) : undefined);
  const childId = child?.ref.id;
  const pendingQuestions = child?.assignment?.questions ?? [];
  const questions = lead ? lead.inbox.filter(message => message.source.id === childId && message.kind === "question" && pendingQuestions.includes(message.id)) : [];
  const configuration = relationship?.configuration;
  const requestedProvider = z.object({ provider: z.string().min(1) }).safeParse(call.arguments.configuration);
  const provider = configuration?.provider ?? (requestedProvider.success ? requestedProvider.data.provider : "");
  const description = configuration ? `${configuration.provider}/${configuration.model} · ${configuration.reasoning} · ${configuration.tier ?? "default"}\n${relationship?.workspace.mode === "worktree" ? `Worktree: ${relationship.workspace.branch}\nBase: ${relationship.workspace.base}` : "Shared checkout"}\n${ref?.cwd}` : ref?.cwd;
  return <div className="min-w-0" data-delegate-invocation={call.id}>
    <div className="flex min-w-0 items-center gap-1 rounded-lg bg-muted/20">
      <HoverCard>
      <HoverCardTrigger delay={350} render={<Button variant="ghost" disabled={!ref || child?.available === false} />} className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2.5 px-3 py-2 text-left disabled:opacity-100" aria-label={`Open delegate: ${label}`} onClick={() => ref && void useAppStore.getState().selectChat(ref.file, ref.cwd)}>
        <BrandIcon name={providerIconName(provider)} size={16} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 whitespace-normal wrap-anywhere font-medium text-foreground">{label}</span>
        <span className={failed ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"} role="status">{status}</span>
        {ref ? <CaretRightIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80 max-w-[calc(100vw-2rem)]">
        <p className="break-words font-medium">{label}</p>
        {description ? <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{description}</p> : null}
        {typeof call.arguments.task === "string" ? <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-t border-border pt-2">{call.arguments.task}</p> : null}
      </HoverCardContent>
      </HoverCard>
      {owned && active ? <Button variant="ghost" size="icon-sm" className="mr-2" title="Stop delegate" aria-label={`Stop delegate: ${label}`} onClick={() => { void rpc.request.stopThread({ sessionFile: child!.ref.file }).catch(error => toast.error(String(error))); }}><StopIcon /></Button> : null}
    </div>
    {questions.map(message => <p key={message.id} className="my-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-primary pl-3 text-xs"><span className="font-medium">Question: </span>{message.content}</p>)}
    {error ? <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words px-3 pt-1 text-xs text-destructive">{error}</p> : null}
  </div>;
}
