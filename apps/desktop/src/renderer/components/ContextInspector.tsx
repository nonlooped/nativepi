import { ArrowsInSimpleIcon } from "@phosphor-icons/react/ArrowsInSimple";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { useState } from "react";
import type { AssistantMessage, ContextInspector as ContextInspectorData, Usage } from "../../shared/pi-types.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import { formatTokens } from "../lib/format.ts";
import { rpc } from "../lib/rpc.ts";
import { useRequest } from "../lib/useRequest.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

export default function ContextWindow() {
  const entries = useAppStore((s) => activeConversation(s).entries);
  const liveUsage = useAppStore((s) => activeConversation(s).streaming?.usage);
  const model = useAppStore((s) => s.model);
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const [open, setOpen] = useState(false);

  const lastUsage = lastAssistantUsage(entries, liveUsage);
  const used = lastUsage?.totalTokens ?? 0;

  const total = model?.contextWindow ?? 0;
  const inspection = useRequest(
    async () => (open && projectDir ? await rpc.request.getContextInspector({ projectDir, sessionFile: sessionFile ?? undefined }) : null),
    [open, projectDir, sessionFile, entries.length],
  );
  const inspectedUsed = inspection.data?.inspector?.usedTokens ?? used;
  const inspectedTotal = inspection.data?.inspector?.contextWindow || total;
  const percent = inspectedTotal ? Math.min(100, Math.round((inspectedUsed / inspectedTotal) * 100)) : 0;

  if (!total) return <div aria-hidden="true" className="h-8 w-8 shrink-0" />;

  const tight = percent >= 75;
  const tone = percent >= 90 ? "text-destructive" : tight ? "text-warning" : "text-muted-foreground";

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-label={`Context window ${percent}% used, ${formatTokens(inspectedUsed)} of ${formatTokens(inspectedTotal)} tokens`}
        title={`Conversation context — ${formatTokens(inspectedUsed)} of ${formatTokens(inspectedTotal)} tokens`}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg px-1.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          tone,
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 -rotate-90" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${percent} 100`} />
        </svg>
        <span className="text-sm tabular-nums" aria-hidden="true">{percent}%</span>
      </button>
      <ContextInspector
        open={open}
        onOpenChange={setOpen}
        loading={inspection.loading}
        inspector={inspection.data?.inspector}
        error={inspection.data?.error ?? inspection.error ?? undefined}
        used={inspectedUsed}
        total={inspectedTotal}
        percent={percent}
        lastUsage={lastUsage}
      />
    </div>
  );
}

function lastAssistantUsage(
  entries: ReturnType<typeof activeConversation>["entries"],
  live?: Usage,
): Usage | null {
  if (live && (live.totalTokens || live.input || live.output)) return live;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.type !== "message") continue;
    const message = entry.message as AssistantMessage;
    if (message.role === "assistant" && message.usage) return message.usage;
  }
  return null;
}

function ContextInspector({
  open,
  onOpenChange,
  loading,
  inspector,
  error,
  used,
  total,
  percent,
  lastUsage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  inspector?: ContextInspectorData;
  error?: string;
  used: number;
  total: number;
  percent: number;
  lastUsage: Usage | null;
}) {
  const model = useAppStore((s) => s.model);
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const running = useAppStore((s) => activeConversation(s).running);
  const compacting = useAppStore((s) => activeConversation(s).compacting);
  const compactActive = useAppStore((s) => s.compactActive);
  const remaining = Math.max(0, total - used);
  const unmeasured = inspector?.usedTokens === null && used === 0;
  const modelName = model?.name ?? model?.id;
  const fill = percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-warning" : "bg-foreground";
  const status = unmeasured
    ? "Pi has not measured this chat yet."
    : percent >= 90
      ? "Near the limit. Summarizing earlier messages frees space for the next turn."
      : percent >= 75
        ? "Getting full. Later turns have less room unless earlier messages are summarized."
        : "Plenty of room for the next turn.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">Context</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            How much of this model’s window the current chat is using. Pi measures this from the session.
          </DialogDescription>
        </DialogHeader>

        <section aria-label="Context usage" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium">{percent}% used</p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {used.toLocaleString()} / {total.toLocaleString()}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={cn("h-full origin-left rounded-full transition-transform duration-300 ease-out", fill)}
              style={{ transform: `scaleX(${percent / 100})` }}
            />
          </div>
          <p className="text-sm leading-6 text-body-muted-foreground">
            {unmeasured
              ? status
              : `${formatTokens(remaining)} left${modelName ? ` in ${modelName}` : ""}. ${status}`}
          </p>
        </section>

        {lastUsage && (lastUsage.input || lastUsage.output) ? (
          <section aria-label="Last reply" className="flex flex-col gap-1 border-t pt-3">
            <p className="text-xs font-medium text-foreground">Last reply</p>
            <UsageRow label="Input" value={lastUsage.input} hint="Prompt, files, and tool results this turn" />
            <UsageRow label="Output" value={lastUsage.output} hint="What the model wrote back" />
            {lastUsage.cacheRead ? (
              <UsageRow label="Cache read" value={lastUsage.cacheRead} hint="Context reused from earlier turns" />
            ) : null}
            {lastUsage.cacheWrite ? (
              <UsageRow label="Cache write" value={lastUsage.cacheWrite} hint="Context stored for later turns" />
            ) : null}
          </section>
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">Reading the active Pi session…</p> : null}
        {error ? <p className="text-sm text-destructive">Could not inspect this context: {error}</p> : null}

        {sessionFile ? (
          <DialogFooter>
            <Button
              variant="outline"
              disabled={running || compacting}
              onClick={() => {
                void compactActive();
                onOpenChange(false);
              }}
            >
              {compacting ? (
                <CircleNotchIcon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ArrowsInSimpleIcon data-icon="inline-start" />
              )}
              {compacting ? "Summarizing…" : "Summarize earlier messages"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UsageRow({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5" title={hint}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
