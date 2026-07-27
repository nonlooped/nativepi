import { useEffect, useState } from "react";
import { WarningCircleIcon } from "../../shared/icons.ts";
import type { PendingWork } from "../../shared/rpc-schema.ts";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

/**
 * The last thing between a running agent and a closed window.
 *
 * Main holds the close back and sends what is still going; nothing here decides
 * whether to ask. Dismissing by any route — Escape, the backdrop, the close
 * button — means "keep working", because the window is only still open because
 * the close was refused, and the safe answer should not need a deliberate click.
 */
export default function QuitDialog() {
  const [work, setWork] = useState<PendingWork | null>(null);
  const projects = useAppStore((s) => s.projects);

  useEffect(() => rpc.events.on("quitRequested", (payload) => setWork(payload.work)), []);

  if (!work) return null;

  const rows = summarize(work);
  const runs = work.runs.length;

  return (
    <Dialog open onOpenChange={(next) => !next && setWork(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <WarningCircleIcon weight="fill" className="size-5 text-warning" />
            {runs > 0 ? "Pi is still working" : "Terminals are still open"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {runs > 0
              ? "Quitting stops the turn where it is: the rest of the turn will not happen. Everything Pi has already written to the chat is saved."
              : "Quitting closes these shells and ends whatever they are running."}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border bg-muted/40 px-2.5 py-2">
          {rows.map((row) => (
            <li key={row.path} className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium" title={row.path}>
                {projects.find((project) => project.path === row.path)?.name ?? row.path}
              </span>
              <span className="shrink-0 text-muted-foreground">{describe(row)}</span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="destructive" onClick={() => void rpc.request.confirmQuit({})}>
            Stop and quit
          </Button>
          <Button onClick={() => setWork(null)}>Keep working</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Row {
  path: string;
  running: boolean;
  terminals: number;
}

/** One row per project, running ones first, so a project is never listed twice. */
function summarize(work: PendingWork): Row[] {
  const rows = new Map<string, Row>();
  const row = (path: string) => {
    const existing = rows.get(path) ?? { path, running: false, terminals: 0 };
    rows.set(path, existing);
    return existing;
  };
  for (const path of work.runs) row(path).running = true;
  for (const path of work.terminals) row(path).terminals += 1;
  return [...rows.values()].sort((a, b) => Number(b.running) - Number(a.running) || a.path.localeCompare(b.path));
}

function describe(row: Row): string {
  const terminals = row.terminals === 0 ? "" : `${row.terminals} terminal${row.terminals === 1 ? "" : "s"}`;
  if (!row.running) return terminals;
  return terminals ? `running · ${terminals}` : "running";
}
