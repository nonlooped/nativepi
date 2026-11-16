import { useEffect, useState } from "react";
import {
  automationInputSchema,
  automationStateSchema,
  type AutomationInput,
  type AutomationState,
} from "../../../shared/automations.ts";
import { thinkingLevels } from "../../../shared/pi-values.ts";
import { rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { SettingsSection } from "./rows.tsx";
const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm";
function fresh(): AutomationInput {
  return {
    name: "",
    prompt: "",
    enabled: false,
    project: null,
    workspace: "shared",
    configuration: {
      provider: "",
      model: "",
      reasoning: "medium",
      tier: "default",
      tools: ["read", "bash", "edit", "write"],
    },
    trigger: {
      kind: "daily",
      time: "09:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}
export default function AutomationSettings() {
  const [state, setState] = useState<AutomationState | null>(null);
  const [draft, setDraft] = useState<AutomationInput | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const projects = useAppStore((s) => s.projects);
  const models = useAppStore((s) => s.models);
  const selectChat = useAppStore((s) => s.selectChat);
  const closeSettings = useAppStore((s) => s.closeSettings);
  async function action(fn: () => Promise<AutomationState>) {
    setPending(true);
    setError("");
    try {
      setState(automationStateSchema.parse(await fn()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    void action(() => rpc.request.automationList({}));
    const timer = setInterval(() => {
      void rpc.request
        .automationList({})
        .then((v) => setState(automationStateSchema.parse(v)))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  const patch = (value: Partial<AutomationInput>) =>
    setDraft(draft ? { ...draft, ...value } : null);
  return (
    <SettingsSection
      heading="Scheduled Work"
      description="Run Work on a schedule or when GitHub checks fail or reviewers respond. NativePi must be running. Every run opens a fresh Pi transcript for review."
    >
      <div className="flex items-center justify-between gap-3 py-3">
        <span className="text-sm text-muted-foreground">
          {state?.automations.length ?? 0} saved
        </span>
        <Button size="sm" variant="outline" onClick={() => setDraft(fresh())}>
          New automation
        </Button>
      </div>
      {error && (
        <p role="alert" className="py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {draft && (
        <form
          className="my-3 flex flex-col gap-4 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const result = await rpc.request.automationSave(
                automationInputSchema.parse(draft),
              );
              setDraft(null);
              return result;
            });
          }}
        >
          <label className="text-sm">
            Name
            <Input
              required
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Instructions
            <Textarea
              required
              rows={4}
              value={draft.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              placeholder="Describe the work, its limits, and how to verify it."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Project
              <select
                className={selectClass}
                value={draft.project ?? ""}
                onChange={(e) =>
                  patch({
                    project: e.target.value || null,
                    workspace: e.target.value ? draft.workspace : "shared",
                  })
                }
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Workspace
              <select
                className={selectClass}
                value={draft.workspace}
                onChange={(e) =>
                  patch({
                    workspace: e.target.value as AutomationInput["workspace"],
                  })
                }
              >
                <option value="shared">Project folder (shared)</option>
                <option value="worktree" disabled={!draft.project}>
                  New Git worktree per run
                </option>
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Shared folders skip dispatch while a project turn is active.
            Worktrees use the committed local base; dependencies and dirty files
            are not copied. Worktrees are retained for inspection.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Provider
              <Input
                required
                list="automation-providers"
                value={draft.configuration.provider}
                onChange={(e) =>
                  patch({
                    configuration: {
                      ...draft.configuration,
                      provider: e.target.value,
                    },
                  })
                }
              />
              <datalist id="automation-providers">
                {[...new Set(models.map((m) => m.provider))].map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="text-sm">
              Model ID
              <Input
                required
                list="automation-models"
                value={draft.configuration.model}
                onChange={(e) =>
                  patch({
                    configuration: {
                      ...draft.configuration,
                      model: e.target.value,
                    },
                  })
                }
              />
              <datalist id="automation-models">
                {models
                  .filter((m) => m.provider === draft.configuration.provider)
                  .map((m) => (
                    <option key={m.id} value={m.id} />
                  ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Reasoning
              <select
                className={selectClass}
                value={draft.configuration.reasoning}
                onChange={(e) =>
                  patch({
                    configuration: {
                      ...draft.configuration,
                      reasoning: e.target
                        .value as AutomationInput["configuration"]["reasoning"],
                    },
                  })
                }
              >
                {thinkingLevels.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Service tier
              <select
                className={selectClass}
                value={draft.configuration.tier}
                onChange={(e) =>
                  patch({
                    configuration: {
                      ...draft.configuration,
                      tier: e.target.value as "default" | "priority",
                    },
                  })
                }
              >
                <option value="default">Standard</option>
                <option value="priority">Priority</option>
              </select>
            </label>
          </div>
          <label className="text-sm">
            Allowed tools (comma separated)
            <Input
              defaultValue={draft.configuration.tools.join(", ")}
              onBlur={(e) =>
                patch({
                  configuration: {
                    ...draft.configuration,
                    tools: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Model, reasoning, tier and tools are validated by Pi before
            dispatch. Unavailable choices fail without substitution. Tools and
            extensions run with your normal local permissions.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Trigger
            <select
              className={selectClass}
              value={draft.trigger.kind}
              onChange={(e) => {
                const kind = e.target.value;
                patch({
                  trigger:
                    kind === "github"
                      ? {
                          kind,
                          repository: "",
                          target: "",
                          failedChecks: true,
                          reviews: true,
                        }
                      : kind === "once"
                        ? {
                            kind,
                            at: new Date(Date.now() + 3600000).toISOString(),
                          }
                        : kind === "weekly"
                          ? {
                              kind,
                              time: "09:00",
                              timezone:
                                Intl.DateTimeFormat().resolvedOptions()
                                  .timeZone,
                              weekday: 1,
                            }
                          : {
                              kind: "daily",
                              time: "09:00",
                              timezone:
                                Intl.DateTimeFormat().resolvedOptions()
                                  .timeZone,
                            },
                });
              }}
            >
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="github">GitHub PR / CI changes</option>
            </select>
          </label>
          {draft.trigger.kind === "once" && (
            <label className="text-sm">
              Run at (ISO timestamp with offset)
              <Input
                required
                value={draft.trigger.at}
                onChange={(e) =>
                  patch({ trigger: { kind: "once", at: e.target.value } })
                }
              />
            </label>
          )}
          {(draft.trigger.kind === "daily" ||
            draft.trigger.kind === "weekly") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Local time
                <Input
                  type="time"
                  required
                  value={draft.trigger.time}
                  onChange={(e) => {
                    if (
                      draft.trigger.kind === "daily" ||
                      draft.trigger.kind === "weekly"
                    )
                      patch({
                        trigger: { ...draft.trigger, time: e.target.value },
                      });
                  }}
                />
              </label>
              <label className="text-sm">
                Timezone
                <Input
                  required
                  value={draft.trigger.timezone}
                  onChange={(e) => {
                    if (
                      draft.trigger.kind === "daily" ||
                      draft.trigger.kind === "weekly"
                    )
                      patch({
                        trigger: { ...draft.trigger, timezone: e.target.value },
                      });
                  }}
                />
              </label>
              {draft.trigger.kind === "weekly" && (
                <label className="flex flex-col gap-1 text-sm">
                  Day
                  <select
                    className={selectClass}
                    value={draft.trigger.weekday}
                    onChange={(e) => {
                      if (draft.trigger.kind === "weekly")
                        patch({
                          trigger: {
                            ...draft.trigger,
                            weekday: Number(e.target.value),
                          },
                        });
                    }}
                  >
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((v, i) => (
                      <option key={v} value={i}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {draft.trigger.kind === "github" && (
            <>
              <label className="text-sm">
                GitHub repository (owner/name)
                <Input
                  required
                  value={draft.trigger.repository}
                  onChange={(e) => {
                    if (draft.trigger.kind === "github")
                      patch({
                        trigger: {
                          ...draft.trigger,
                          repository: e.target.value,
                        },
                      });
                  }}
                />
              </label>
              <label className="text-sm">
                PR number or head branch
                <Input
                  required
                  value={draft.trigger.target}
                  onChange={(e) => {
                    if (draft.trigger.kind === "github")
                      patch({
                        trigger: { ...draft.trigger, target: e.target.value },
                      });
                  }}
                />
              </label>
              {(["failedChecks", "reviews"] as const).map((key) => (
                <label key={key} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      draft.trigger.kind === "github" && draft.trigger[key]
                    }
                    onChange={(e) => {
                      if (draft.trigger.kind === "github")
                        patch({
                          trigger: {
                            ...draft.trigger,
                            [key]: e.target.checked,
                          },
                        });
                    }}
                  />
                  {key === "failedChecks"
                    ? "New failed checks"
                    : "New review feedback"}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Uses your authenticated gh account. First connection records a
                baseline without running. Checks every two minutes; no public
                webhook. Enabling authorizes watching this repository and
                target.
              </p>
            </>
          )}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
            />
            Enable automation
          </label>
          <p className="text-xs text-muted-foreground">
            Missed time slots over five minutes old are skipped. No replay after
            restart. Three consecutive failures pause the automation. Completed
            turns always require your review.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save automation
            </Button>
          </div>
        </form>
      )}
      {state?.automations.map((a) => (
        <div key={a.id} className="border-t py-4">
          <div className="flex justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{a.input.name}</p>
              <p className="text-xs text-muted-foreground">
                {a.input.enabled ? "Enabled" : "Paused"} ·{" "}
                {a.input.trigger.kind === "github"
                  ? `${a.input.trigger.repository} / ${a.input.trigger.target}`
                  : a.next
                    ? new Date(a.next).toLocaleString()
                    : "No upcoming run"}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraft({ ...a.input, id: a.id })}
            >
              Edit
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void action(() =>
                  rpc.request.automationSave({
                    ...a.input,
                    id: a.id,
                    enabled: !a.input.enabled,
                  }),
                )
              }
            >
              {a.input.enabled ? "Pause" : "Enable"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void action(() => rpc.request.automationRun({ id: a.id }))
              }
            >
              Run now
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void action(() => rpc.request.automationStop({ id: a.id }))
              }
            >
              Stop
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                void action(() => rpc.request.automationDelete({ id: a.id }))
              }
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
      {!!state?.runs.length && (
        <details className="border-t py-4">
          <summary className="cursor-pointer text-sm font-medium">
            Run history ({state.runs.length})
          </summary>
          {[...state.runs].reverse().map((run) => (
            <div key={run.id} className="my-3 border-l-2 pl-3 text-sm">
              <p>
                {run.name} · {run.status}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(run.started).toLocaleString()}
              </p>
              <p className="mt-1">{run.detail}</p>
              {run.workspace && (
                <p className="break-all text-xs text-muted-foreground">
                  {run.workspace}
                </p>
              )}
              <details className="mt-1 text-xs">
                <summary>Trigger context</summary>
                <pre className="whitespace-pre-wrap break-words">
                  {run.context}
                </pre>
              </details>
              {run.ref && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => {
                    closeSettings();
                    void selectChat(run.ref!.file, run.ref!.cwd);
                  }}
                >
                  Open Pi transcript
                </Button>
              )}
            </div>
          ))}
        </details>
      )}
    </SettingsSection>
  );
}
