import { useState } from "react";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ArrowUpRight";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import type { AutomationRun } from "../../../shared/automations.ts";
import { useAppStore } from "../../lib/store.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog.tsx";
import { Button } from "../ui/button.tsx";
import { runLabels } from "./automationPresentation.ts";

export default function AutomationHistory({
  runs,
  name,
  onClose,
}: {
  runs: AutomationRun[];
  name?: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    runs.at(-1)?.id ?? null,
  );
  const [context, setContext] = useState(false);
  const selectChat = useAppStore((s) => s.selectChat);
  const closeSettings = useAppStore((s) => s.closeSettings);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="picker" className="max-w-xl">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Run history</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {name ?? "Recent automation runs"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] min-h-24 overflow-y-auto overscroll-contain px-6 pb-5">
          {!runs.length && (
            <p className="py-5 text-sm text-body-muted-foreground">
              No runs yet. Your first run will appear here.
            </p>
          )}
          {[...runs].reverse().map((run) => (
            <div key={run.id} className="border-t border-border/40 py-3">
              <button
                type="button"
                aria-expanded={selected === run.id}
                onClick={() => {
                  setSelected(selected === run.id ? null : run.id);
                  setContext(false);
                }}
                className="flex w-full items-start gap-2 text-left text-sm outline-none focus-visible:underline"
              >
                <CaretRightIcon
                  className={`mt-0.5 size-3.5 shrink-0 text-muted-foreground ${selected === run.id ? "rotate-90" : ""}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block [overflow-wrap:anywhere]">
                    {name
                      ? new Date(run.started).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : run.name}
                  </span>
                  {!name && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.started).toLocaleString()}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 text-xs ${run.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {runLabels[run.status]}
                </span>
              </button>
              {selected === run.id && (
                <div className="ml-5 mt-2 flex min-w-0 flex-col items-start gap-3">
                  <p className="text-[0.8125rem] leading-5 text-body-muted-foreground [overflow-wrap:anywhere]">
                    {run.detail.startsWith("unsupported_configuration:")
                      ? "Pi could not use the saved configuration. Edit this automation or inspect the run details."
                      : run.detail}
                  </p>
                  {run.ref && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onClose();
                        closeSettings();
                        void selectChat(run.ref!.file, run.ref!.cwd);
                      }}
                    >
                      Open transcript
                      <ArrowUpRightIcon />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-auto px-0 py-0.5 text-xs text-muted-foreground"
                    aria-expanded={context}
                    onClick={() => setContext(!context)}
                  >
                    {context ? "Hide run details" : "Run details"}
                  </Button>
                  {context && (
                    <div className="w-full min-w-0 space-y-2 text-xs text-body-muted-foreground">
                      <p className="[overflow-wrap:anywhere]">{run.detail}</p>
                      <p className="[overflow-wrap:anywhere]">
                        {run.workspace ?? run.ref?.cwd}
                      </p>
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans [overflow-wrap:anywhere]">
                        {run.context}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
