import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { attentionLabels, turnAttention } from "../../shared/threadAttention.ts";
import { useAppStore } from "../lib/store.ts";
import { isAssistant } from "../../shared/messages.ts";
import { cn } from "../lib/utils.ts";

/** Session-scoped selectors keep attention from leaking when the selection changes. */
export default function ChatAttention({ file, fallback }: { file: string; fallback: string }) {
  const attention = useAppStore(s => {
    const thread = s.orchestration?.threads.find(thread => thread.ref.file === file);
    if (thread?.attention) return thread.attention;
    const conversation = s.conversations[file];
    const input = Object.values(s.extensionPromptsByProject ?? {}).some(prompts => prompts.some(prompt => prompt.sessionFile === file));
    let outcome: "failed" | "interrupted" | undefined;
    if (conversation) {
      const last = conversation.entries.findLast(entry => entry.type === "message" && isAssistant(entry.message));
      const reason = last?.type === "message" && isAssistant(last.message) ? last.message.stopReason : undefined;
      outcome = conversation.aborted || reason === "aborted" ? "interrupted" : reason === "error" || (conversation.error && conversation.errorRecovery) ? "failed" : undefined;
    }
    return turnAttention({ retrying: !!conversation?.retry, outcome }, !!conversation?.running || !!thread?.running, input)
      ?? (thread?.assignment?.state === "failed" || thread?.startupError ? "failed" : thread?.assignment?.state === "interrupted" ? "interrupted" : undefined);
  });
  return <span title={attention ? attentionLabels[attention] : undefined} role={attention ? "status" : undefined} className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-normal tabular-nums", attention === "failed" ? "text-destructive" : attention ? "text-active" : "text-muted-foreground")}>
    {attention === "running" || attention === "retrying" ? <CircleNotchIcon className="size-3 animate-spin motion-reduce:animate-none" /> : null}
    {attention ? attentionLabels[attention] : fallback}
  </span>;
}
