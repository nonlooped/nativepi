import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { useAppStore } from "../lib/store.ts";
import { currentTool, runModel, runTokens } from "../lib/runBoard.ts";
import { formatElapsed, formatTokens } from "../lib/format.ts";
import { chatTitle } from "../lib/transcript.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

export default function RunBoard() {
  const close = useAppStore((s) => s.closeRunBoard);
  const selectProject = useAppStore((s) => s.selectProject);
  const selectChat = useAppStore((s) => s.selectChat);
  const projects = useAppStore((s) => s.projects);
  const conversations = useAppStore((s) => s.conversations);
  const settledRuns = useAppStore((s) => s.settledRuns);
  const prompts = useAppStore((s) => s.extensionPromptsByProject);
  const sessions = useAppStore((s) => s.sessionsByProject);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = projects
    .flatMap((project) => {
      const blocked = prompts[project.path]?.[0];
      const activeRows = Object.values(conversations).flatMap((conversation) => {
        if (conversation.projectDir !== project.path || !conversation.running || conversation.runStartedAt === null) return [];
        const entries = conversation.entries.slice(conversation.runEntryStart ?? 0);
        const session = sessions[project.path]?.find((item) => item.path === conversation.sessionFile);
        return [{
          project,
          chat: conversation.sessionName ?? (session ? chatTitle(session) : "Untitled chat"),
          model: runModel(entries) ?? "Waiting for model",
          elapsed: formatElapsed(now - conversation.runStartedAt),
          tool: currentTool(entries, conversation.streaming) ?? "Thinking",
          tokens: formatTokens(runTokens(entries)),
          blocked: blocked ? (blocked.method === "confirm" ? "Confirmation" : "Extension dialog") : undefined,
          active: true,
          at: conversation.runStartedAt,
          sessionFile: conversation.sessionFile,
        }];
      });
      if (activeRows.length > 0) return activeRows;
      return Object.values(settledRuns)
        .filter((settled) => settled.projectDir === project.path)
        .map((settled) => {
          const session = sessions[project.path]?.find((item) => item.path === settled.sessionFile);
          return {
        project,
        chat: settled.sessionName ?? (session ? chatTitle(session) : "Untitled chat"),
        model: settled.model ?? "Unknown model",
        elapsed: formatElapsed(settled.settledAt - settled.startedAt),
        tool: "Finished",
        tokens: formatTokens(settled.tokens),
        blocked: undefined,
        active: false,
        at: settled.settledAt,
        sessionFile: settled.sessionFile,
          };
        });
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.at - a.at);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-h-[min(42rem,calc(100dvh-2rem))] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="font-heading text-base font-semibold">Run board</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Every active run, plus the most recently settled run in each project for this app session.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {/* Six labels across a three-column grid is two ragged rows of
              headings sitting above data they no longer line up with. Below
              `sm` the table stops being a table: each run becomes a card that
              carries its own labels, and the header row goes away with the
              columns it was describing. */}
          {rows.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <div className={cn(HEADER_GRID, "hidden border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid")}>
                <span>Project / chat</span><span>Model</span><span>Current work</span><span>Elapsed</span><span>Tokens</span><span>Status</span>
              </div>
              {rows.map((row) => (
                <button
                  key={`${row.project.path}:${row.sessionFile ?? "new"}`}
                  type="button"
                  onClick={() => {
                    void (async () => {
                      await selectProject(row.project.path);
                      if (row.sessionFile) await selectChat(row.sessionFile);
                      close();
                    })();
                  }}
                  className={cn(
                    HEADER_GRID,
                    "flex w-full flex-col gap-2 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:grid sm:items-center sm:gap-y-0",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{row.project.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.chat}</span>
                  </span>
                  <Cell label="Model" className="truncate font-mono text-xs text-muted-foreground">{row.model}</Cell>
                  <Cell label="Current work" className="truncate text-sm">{row.tool}</Cell>
                  <Cell label="Elapsed" className="font-mono text-xs tabular-nums text-muted-foreground">{row.elapsed}</Cell>
                  <Cell label="Tokens" className="font-mono text-xs tabular-nums text-muted-foreground">{row.tokens}</Cell>
                  <Cell label="Status" className="flex min-w-0 items-center gap-1.5 text-xs">
                    <StatusIcon active={row.active} blocked={row.blocked} />
                    <span className="truncate">{row.blocked ?? (row.active ? "Running" : "Settled")}</span>
                  </Cell>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="font-heading text-2xl font-semibold tracking-tight">No runs yet</p>
              <p className="mt-2 text-sm text-muted-foreground">When Pi starts working in a project, its status will appear here.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The six columns, named once so the header and every row cannot drift apart.
 * Below `sm` this contributes nothing: the header is hidden and the row is a
 * flex column, so `grid-cols-*` never applies.
 */
const HEADER_GRID =
  "gap-x-4 sm:grid sm:grid-cols-[minmax(10rem,1.1fr)_minmax(10rem,1.1fr)_minmax(10rem,1fr)_5rem_7rem_6rem]";

/**
 * One datum, labelled in card mode and bare in table mode.
 *
 * Above `sm` the column header names the value and the label is redundant;
 * below it there is no header left, so each value carries its own.
 */
function Cell({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2 sm:block">
      <span className="w-24 shrink-0 text-xs text-muted-foreground sm:hidden">{label}</span>
      <span className={cn("min-w-0 flex-1", className)}>{children}</span>
    </span>
  );
}

function StatusIcon({ active, blocked }: { active: boolean; blocked?: string }) {
  if (blocked) return <WarningCircleIcon className="shrink-0 text-warning" weight="fill" />;
  if (active) return <CircleNotchIcon className="shrink-0 animate-spin text-muted-foreground" />;
  return <CheckCircleIcon className="shrink-0 text-muted-foreground" weight="fill" />;
}
