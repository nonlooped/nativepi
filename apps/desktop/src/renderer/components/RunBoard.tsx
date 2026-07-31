import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XIcon } from "@phosphor-icons/react/X";
import { useAppStore } from "../lib/store.ts";
import { currentTool, runModel, runTokens } from "../lib/runBoard.ts";
import { formatElapsed, formatTokens } from "../lib/format.ts";
import { chatTitle } from "../lib/transcript.ts";
import { Button } from "@/components/ui/button.tsx";
import { DRAG_REGION, NO_DRAG_REGION } from "@/lib/utils.ts";

export default function RunBoard() {
  const close = useAppStore((s) => s.closeRunBoard);
  const selectProject = useAppStore((s) => s.selectProject);
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
      const conversation = conversations[project.path];
      const blocked = prompts[project.path]?.[0];
      if (conversation?.running && conversation.runStartedAt !== null) {
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
        }];
      }
      const settled = settledRuns[project.path];
      if (!settled) return [];
      const session = sessions[project.path]?.find((item) => item.path === settled.sessionFile);
      return [{
        project,
        chat: settled.sessionName ?? (session ? chatTitle(session) : "Untitled chat"),
        model: settled.model ?? "Unknown model",
        elapsed: formatElapsed(settled.settledAt - settled.startedAt),
        tool: "Finished",
        tokens: formatTokens(settled.tokens),
        blocked: undefined,
        active: false,
        at: settled.settledAt,
      }];
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.at - a.at);

  return (
    <main className="flex h-full min-w-0 flex-col bg-background text-foreground">
      <header className={`${DRAG_REGION} flex h-12 shrink-0 items-center gap-3 border-b px-4 sm:px-10`}>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-base font-semibold">Run board</h1>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close run board" title="Close run board" className={NO_DRAG_REGION}>
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-10 sm:py-12">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-8 flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Every active run, plus the most recently settled run in each project for this app session.</p>
          </div>
          {rows.length ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[minmax(12rem,1.35fr)_minmax(10rem,1.1fr)_minmax(7rem,.8fr)] gap-x-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(10rem,1.1fr)_minmax(10rem,1.1fr)_minmax(10rem,1fr)_5rem_7rem_6rem]">
                <span>Project / chat</span><span>Model</span><span>Current work</span><span>Elapsed</span><span>Tokens</span><span>Status</span>
              </div>
              {rows.map((row) => (
                <button key={row.project.path} type="button" onClick={() => void selectProject(row.project.path)} className="grid w-full grid-cols-[minmax(12rem,1.35fr)_minmax(10rem,1.1fr)_minmax(7rem,.8fr)] gap-x-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:grid-cols-[minmax(10rem,1.1fr)_minmax(10rem,1.1fr)_minmax(10rem,1fr)_5rem_7rem_6rem]">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{row.project.name}</span><span className="block truncate text-xs text-muted-foreground">{row.chat}</span></span>
                  <span className="truncate font-mono text-xs leading-9 text-muted-foreground">{row.model}</span>
                  <span className="truncate text-sm leading-9">{row.tool}</span>
                  <span className="font-mono text-xs leading-9 tabular-nums text-muted-foreground">{row.elapsed}</span>
                  <span className="font-mono text-xs leading-9 tabular-nums text-muted-foreground">{row.tokens}</span>
                  <span className="flex items-center gap-1.5 text-xs leading-9"><StatusIcon active={row.active} blocked={row.blocked} /><span className="truncate">{row.blocked ?? (row.active ? "Running" : "Settled")}</span></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center"><p className="font-heading text-xl font-medium">No runs yet</p><p className="mt-2 text-sm text-muted-foreground">When Pi starts working in a project, its status will appear here.</p></div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatusIcon({ active, blocked }: { active: boolean; blocked?: string }) {
  if (blocked) return <WarningCircleIcon className="shrink-0 text-warning" weight="fill" />;
  if (active) return <CircleNotchIcon className="shrink-0 animate-spin text-muted-foreground" />;
  return <CheckCircleIcon className="shrink-0 text-muted-foreground" weight="fill" />;
}
