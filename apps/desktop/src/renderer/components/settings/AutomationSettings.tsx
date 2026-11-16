import { useEffect, useRef, useState } from "react";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { CalendarBlankIcon } from "@phosphor-icons/react/CalendarBlank";
import { GitPullRequestIcon } from "@phosphor-icons/react/GitPullRequest";
import {
  automationStateSchema,
  type AutomationInput,
  type AutomationState,
  type AutomationRun,
} from "../../../shared/automations.ts";
import { rpc } from "../../lib/rpc.ts";
import { Button } from "../ui/button.tsx";
import { Switch } from "../ui/switch.tsx";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu.tsx";
import { SettingsSection } from "./rows.tsx";
import StateNotice from "../StateNotice.tsx";
import ConfirmDialog from "../ConfirmDialog.tsx";
import AutomationEditor from "./AutomationEditor.tsx";
import AutomationHistory from "./AutomationHistory.tsx";

import { triggerLabel, runLabels } from "./automationPresentation.ts";

export default function AutomationSettings() {
  const [state, setState] = useState<AutomationState | null>(null);
  const [editor, setEditor] = useState<AutomationInput | "new" | null>(null);
  const [history, setHistory] = useState<{ id?: string; name?: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const readGeneration = useRef(0);
  async function action(fn: () => Promise<AutomationState>) {
    readGeneration.current++;
    setPending(true);
    setError("");
    try {
      setState(automationStateSchema.parse(await fn()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      readGeneration.current++;
      setPending(false);
    }
  }
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      const generation = readGeneration.current;
      return rpc.request
        .automationList({})
        .then((v) => {
          if (!disposed && generation === readGeneration.current) {
            setState(automationStateSchema.parse(v));
            setError("");
          }
        })
        .catch(() => {
          if (!disposed && generation === readGeneration.current)
            setError("Could not load automations. Try again.");
        });
    };
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  const runs = state?.runs ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-body-muted-foreground">
          Runs while NativePi is open.
        </p>
        <Button size="sm" variant="outline" onClick={() => setEditor("new")}>
          <PlusIcon />
          New automation
        </Button>
      </div>
      {error && (
        <StateNotice
          title="Automations unavailable"
          detail={error}
          retry={() => void action(() => rpc.request.automationList({}))}
        />
      )}
      {!state && !error ? (
        <StateNotice loading title="Loading automations…" />
      ) : null}
      {state && (
        <SettingsSection heading="Saved automations">
          {!state.automations.length ? (
            <p className="py-6 text-sm text-body-muted-foreground">
              No automations yet. Schedule a task or watch a pull request.
            </p>
          ) : (
            state.automations
              .toSorted((a, b) => a.input.name.localeCompare(b.input.name))
              .map((a) => {
                const latest = runs.findLast(
                  (run) => run.automationId === a.id,
                );
                const active =
                  latest && ["preparing", "dispatched"].includes(latest.status);
                const Icon =
                  a.input.trigger.kind === "github"
                    ? GitPullRequestIcon
                    : CalendarBlankIcon;
                return (
                  <div
                    key={a.id}
                    className="flex min-w-0 gap-3 border-b border-border/30 py-3 last:border-b-0"
                  >
                    <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="line-clamp-2 max-w-full text-left text-sm font-medium text-foreground outline-none hover:underline focus-visible:underline [overflow-wrap:anywhere]"
                        title={a.input.name}
                        onClick={() => setEditor({ ...a.input, id: a.id })}
                      >
                        {a.input.name}
                      </button>
                      <p className="mt-0.5 text-[0.8125rem] leading-5 text-body-muted-foreground [overflow-wrap:anywhere]">
                        {triggerLabel(a.input.trigger)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {active
                            ? runLabels[latest.status]
                            : !a.input.enabled
                              ? "Paused"
                              : a.next
                                ? `Ready · Next ${new Date(a.next).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
                                : a.input.trigger.kind === "github"
                                  ? "Watching"
                                  : "No upcoming run"}
                        </span>
                        {latest && (
                          <button
                            type="button"
                            className="text-left underline-offset-4 hover:text-foreground hover:underline focus-visible:underline"
                            onClick={() =>
                              setHistory({ id: a.id, name: a.input.name })
                            }
                          >
                            Last run: {runLabels[latest.status].toLowerCase()}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-2 pt-0.5">
                      <Switch
                        aria-label={`${a.input.enabled ? "Pause" : "Enable"} ${a.input.name}`}
                        checked={a.input.enabled}
                        disabled={pending}
                        onCheckedChange={(enabled) =>
                          void action(() =>
                            rpc.request.automationSave({
                              ...a.input,
                              id: a.id,
                              enabled,
                            }),
                          )
                        }
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="-mt-1.5"
                              aria-label={`Actions for ${a.input.name}`}
                            />
                          }
                        >
                          <DotsThreeIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => setEditor({ ...a.input, id: a.id })}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={pending}
                            onClick={() =>
                              void action(() =>
                                rpc.request.automationRun({ id: a.id }),
                              )
                            }
                          >
                            Run now
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setHistory({ id: a.id, name: a.input.name })
                            }
                          >
                            Run history
                          </DropdownMenuItem>
                          {active && (
                            <DropdownMenuItem
                              disabled={pending}
                              onClick={() =>
                                void action(() =>
                                  rpc.request.automationStop({ id: a.id }),
                                )
                              }
                            >
                              Stop run
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              setDeleting({ id: a.id, name: a.input.name })
                            }
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })
          )}
        </SettingsSection>
      )}
      {runs.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit px-0 text-muted-foreground"
          onClick={() => setHistory({})}
        >
          All run history
        </Button>
      )}
      {editor && (
        <AutomationEditor
          initial={editor}
          onClose={() => setEditor(null)}
          onSaved={(result) => {
            readGeneration.current++;
            setState(result);
            setEditor(null);
          }}
        />
      )}
      {history && (
        <AutomationHistory
          runs={runs.filter(
            (run) => !history.id || run.automationId === history.id,
          )}
          name={history.name}
          onClose={() => setHistory(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete automation?"
        description={`“${deleting?.name ?? ""}” will stop running. Its transcripts and run history will remain.`}
        confirmLabel="Delete automation"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting)
            void action(() =>
              rpc.request.automationDelete({ id: deleting.id }),
            );
          setDeleting(null);
        }}
      />
    </div>
  );
}
