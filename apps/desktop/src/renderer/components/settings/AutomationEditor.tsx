import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.tsx";
import { useEffect, useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import {
  automationInputSchema,
  automationToolsSchema,
  type AutomationInput,
  type AutomationState,
  type AutomationTool,
} from "../../../shared/automations.ts";
import type { ChatTitleCatalog } from "../../../shared/chat-title.ts";
import { rpc } from "../../lib/rpc.ts";
import { useAppStore } from "../../lib/store.ts";
import ModelSelector from "../ModelSelector.tsx";
import StateNotice from "../StateNotice.tsx";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { Field, FieldLabel, FieldTitle, FieldContent } from "../ui/field.tsx";
import { Switch } from "../ui/switch.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog.tsx";
import SettingsDetails from "./SettingsDetails.tsx";
import { ChoiceRow, SelectRow, SwitchRow, SettingsSection } from "./rows.tsx";

function fresh(): AutomationInput {
  return {
    name: "",
    prompt: "",
    project: null,
    workspace: "shared",
    enabled: false,
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
function localDate(at: string) {
  const date = new Date(at);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export default function AutomationEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: AutomationInput | "new";
  onClose: () => void;
  onSaved: (state: AutomationState) => void;
}) {
  const [draft, setDraft] = useState<AutomationInput>(() =>
    initial === "new" ? fresh() : structuredClone(initial),
  );
  const [catalog, setCatalog] = useState<ChatTitleCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [retry, setRetry] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [tools, setTools] = useState<AutomationTool[] | null>(null);
  const [toolsError, setToolsError] = useState("");
  const [customTools, setCustomTools] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const projects = useAppStore((s) => s.projects);
  const workRoot = useAppStore((s) => s.workRoot);
  useEffect(() => {
    let disposed = false;
    setCatalog(null);
    setCatalogError("");
    void rpc.request
      .getChatTitleModels(
        draft.project
          ? { projectDir: draft.project }
          : workRoot
            ? { projectDir: workRoot }
            : {},
      )
      .then((result) => {
        if (disposed) return;
        setCatalog(result);
        setCatalogError(result.error ?? "");
      })
      .catch(() => {
        if (!disposed) setCatalogError("Could not load models from Pi.");
      });
    return () => {
      disposed = true;
    };
  }, [draft.project, workRoot, retry]);
  useEffect(() => {
    if (!advanced) return;
    let disposed = false;
    setTools(null);
    setToolsError("");
    void rpc.request
      .automationTools(draft.project ? { projectDir: draft.project } : {})
      .then((result) => {
        if (!disposed) setTools(automationToolsSchema.parse(result));
      })
      .catch(() => {
        if (!disposed)
          setToolsError(
            "Could not load tools from Pi. Saved tool choices are unchanged.",
          );
      });
    return () => {
      disposed = true;
    };
  }, [advanced, draft.project, retry]);
  const patch = (next: Partial<AutomationInput>) =>
    setDraft((current) => ({ ...current, ...next }));
  const trigger = draft.trigger;
  const model = catalog?.models.find(
    (m) =>
      m.provider === draft.configuration.provider &&
      m.id === draft.configuration.model,
  );
  const zones = [
    ...new Set([
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(trigger.kind === "daily" || trigger.kind === "weekly"
        ? [trigger.timezone]
        : []),
      ...Intl.supportedValuesOf("timeZone"),
    ]),
  ];
  const toolOptions = [
    ...(tools ?? []),
    ...draft.configuration.tools
      .filter((name) => !tools?.some((t) => t.name === name))
      .map((name) => ({ name, description: "Saved choice" })),
  ];
  const presets = {
    standard: ["read", "bash", "edit", "write"],
    reading: ["read", "grep", "find", "ls"],
  };
  const toolPreset = customTools
    ? "custom"
    : (Object.entries(presets).find(
        ([, names]) =>
          names.length === draft.configuration.tools.length &&
          names.every((name) => draft.configuration.tools.includes(name)),
      )?.[0] ?? "custom");
  async function save() {
    setError("");
    const parsed = automationInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        parsed.error.issues.some((i) => i.path.includes("configuration"))
          ? "Choose a model before saving."
          : "Complete the name, instructions and trigger.",
      );
      return;
    }
    setPending(true);
    try {
      onSaved(await rpc.request.automationSave(parsed.data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save automation.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent layout="picker" className="max-w-xl">
        <DialogHeader className="px-6 pt-5 pb-4">
          <DialogTitle>
            {draft.id ? "Edit automation" : "New automation"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="@container/settings-content min-h-0 overflow-y-auto px-6 pb-4">
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="automation-name">Name</FieldLabel>
                <Input
                  id="automation-name"
                  required
                  maxLength={500}
                  value={draft.name}
                  placeholder="Morning maintenance review"
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="automation-instructions">
                  Instructions
                </FieldLabel>
                <Textarea
                  id="automation-instructions"
                  required
                  value={draft.prompt}
                  className="min-h-20 max-h-40 resize-y text-sm"
                  placeholder="What should Pi do, and how should it verify the work?"
                  onChange={(e) => patch({ prompt: e.target.value })}
                />
              </Field>
            </div>
            <SelectRow
              inline
              label="Project"
              value={draft.project ?? "none"}
              options={[
                { value: "none", label: "No project" },
                ...projects.map((p) => ({ value: p.path, label: p.name })),
                ...(draft.project &&
                !projects.some((p) => p.path === draft.project)
                  ? [
                      {
                        value: draft.project,
                        label:
                          draft.project.split(/[\\/]/).at(-1) ?? draft.project,
                      },
                    ]
                  : []),
              ]}
              onChange={(project) =>
                patch({
                  project: project === "none" ? null : project,
                  workspace: project === "none" ? "shared" : draft.workspace,
                })
              }
            />
            <SettingsSection heading="Trigger">
              <ChoiceRow
                inline
                label="Start from"
                value={trigger.kind === "github" ? "github" : "schedule"}
                options={[
                  { value: "schedule", label: "Schedule" },
                  { value: "github", label: "GitHub" },
                ]}
                onChange={(kind) =>
                  patch({
                    trigger:
                      kind === "github"
                        ? {
                            kind: "github",
                            repository: "",
                            target: "",
                            failedChecks: true,
                            reviews: true,
                          }
                        : fresh().trigger,
                  })
                }
              />
              {trigger.kind === "github" ? (
                <>
                  <Field className="py-3">
                    <FieldLabel htmlFor="automation-repo">
                      Repository
                    </FieldLabel>
                    <Input
                      id="automation-repo"
                      placeholder="owner/repository"
                      value={trigger.repository}
                      onChange={(e) =>
                        patch({
                          trigger: { ...trigger, repository: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field className="pb-2">
                    <FieldLabel htmlFor="automation-pr">
                      Pull request or head branch
                    </FieldLabel>
                    <Input
                      id="automation-pr"
                      placeholder="42 or feature/branch"
                      value={trigger.target}
                      onChange={(e) =>
                        patch({
                          trigger: { ...trigger, target: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <SwitchRow
                    label="Failed checks"
                    checked={trigger.failedChecks}
                    onChange={(failedChecks) =>
                      patch({ trigger: { ...trigger, failedChecks } })
                    }
                  />
                  <SwitchRow
                    label="Review feedback"
                    checked={trigger.reviews}
                    onChange={(reviews) =>
                      patch({ trigger: { ...trigger, reviews } })
                    }
                  />
                  <p className="pb-3 text-xs leading-5 text-body-muted-foreground">
                    Uses your gh account. Watches new activity after the first
                    connection.
                  </p>
                </>
              ) : (
                <>
                  <Field
                    orientation="horizontal"
                    className="settings-row settings-row-inline py-3"
                  >
                    <FieldContent>
                      <FieldTitle>Run</FieldTitle>
                    </FieldContent>
                    <div className="flex min-w-0 flex-wrap justify-end gap-2">
                      <Select
                        value={trigger.kind}
                        items={[
                          { value: "once", label: "Once" },
                          { value: "daily", label: "Daily" },
                          { value: "weekly", label: "Weekly" },
                        ]}
                        onValueChange={(kind) => {
                          if (kind === "once")
                            patch({
                              trigger: {
                                kind,
                                at: new Date(
                                  Date.now() + 3600000,
                                ).toISOString(),
                              },
                            });
                          else if (kind === "daily" || kind === "weekly") {
                            const timing = {
                              time: "time" in trigger ? trigger.time : "09:00",
                              timezone:
                                "timezone" in trigger
                                  ? trigger.timezone
                                  : Intl.DateTimeFormat().resolvedOptions()
                                      .timeZone,
                            };
                            patch({
                              trigger:
                                kind === "daily"
                                  ? { kind, ...timing }
                                  : { kind, ...timing, weekday: 1 },
                            });
                          }
                        }}
                      >
                        <SelectTrigger aria-label="Repeat">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            { value: "once", label: "Once" },
                            { value: "daily", label: "Daily" },
                            { value: "weekly", label: "Weekly" },
                          ].map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {trigger.kind !== "once" && (
                        <Input
                          aria-label="Time"
                          className="h-8 w-32"
                          type="time"
                          required
                          value={trigger.time}
                          onChange={(e) =>
                            patch({
                              trigger: { ...trigger, time: e.target.value },
                            })
                          }
                        />
                      )}
                    </div>
                  </Field>
                  {trigger.kind === "once" ? (
                    <Field
                      orientation="horizontal"
                      className="settings-row settings-row-inline py-3"
                    >
                      <FieldLabel htmlFor="automation-date">Run at</FieldLabel>
                      <Input
                        id="automation-date"
                        className="h-8 w-auto min-w-0"
                        type="datetime-local"
                        required
                        value={localDate(trigger.at)}
                        onChange={(e) => {
                          const time = new Date(e.target.value);
                          if (Number.isFinite(time.getTime()))
                            patch({
                              trigger: { kind: "once", at: time.toISOString() },
                            });
                        }}
                      />
                    </Field>
                  ) : (
                    <>
                      {trigger.kind === "weekly" && (
                        <SelectRow
                          inline
                          label="Day"
                          value={String(trigger.weekday)}
                          options={[
                            "Sunday",
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                            "Saturday",
                          ].map((label, i) => ({ value: String(i), label }))}
                          onChange={(weekday) =>
                            patch({
                              trigger: { ...trigger, weekday: Number(weekday) },
                            })
                          }
                        />
                      )}
                      <SettingsDetails id="automation-timezone" title="Timezone" summary={trigger.timezone.replaceAll("_", " ")}>
                      <SelectRow
                        inline
                        label="Timezone"
                        value={trigger.timezone}
                        options={zones.map((zone) => ({
                          value: zone,
                          label: zone.replaceAll("_", " "),
                        }))}
                        onChange={(timezone) =>
                          patch({ trigger: { ...trigger, timezone } })
                        }
                      />
                      </SettingsDetails>
                    </>
                  )}
                </>
              )}
            </SettingsSection>
            <Field
              orientation="horizontal"
              className="settings-row settings-row-inline py-3"
            >
              <FieldContent>
                <FieldTitle>Model</FieldTitle>
              </FieldContent>
              <div className="min-w-0">
                <ModelSelector
                  selection={{
                    models: catalog?.models ?? [],
                    configuration: draft.configuration,
                    loading: !catalog && !catalogError,
                    error: catalogError || undefined,
                    retry: () => setRetry((n) => n + 1),
                    onChange: (configuration) => patch({ configuration }),
                  }}
                />
              </div>
            </Field>
            {draft.configuration.model && !model && catalog ? (
              <p className="pb-2 text-xs text-destructive">
                The saved model is unavailable. Choose an available model or
                keep the saved choice.
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="-ml-2 mb-1 gap-1 text-muted-foreground"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              <CaretRightIcon className={advanced ? "rotate-90" : ""} />
              Execution options
            </Button>
            {advanced && (
              <div className="pb-2">
                <SelectRow
                  inline
                  label="Workspace"
                  value={draft.workspace}
                  options={[
                    {
                      value: "shared",
                      label: draft.project ? "Project folder" : "Work folder",
                    },
                    ...(draft.project
                      ? [{ value: "worktree", label: "New Git worktree" }]
                      : []),
                  ]}
                  onChange={(workspace) =>
                    patch({
                      workspace: workspace as AutomationInput["workspace"],
                    })
                  }
                />
                {draft.workspace === "worktree" && (
                  <p className="pb-3 text-xs leading-5 text-body-muted-foreground">
                    Starts from the committed local base. Retained for review;
                    dirty files and dependencies are not copied.
                  </p>
                )}
                <SelectRow
                  inline
                  label="Tools"
                  value={toolPreset}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "reading", label: "Read files" },
                    { value: "custom", label: "Custom" },
                  ]}
                  onChange={(preset) => {
                    setCustomTools(preset === "custom");
                    if (preset !== "custom")
                      patch({
                        configuration: {
                          ...draft.configuration,
                          tools: presets[preset as keyof typeof presets],
                        },
                      });
                  }}
                />
                {toolPreset === "custom" && (
                  <SettingsSection heading="Allowed tools">
                    {toolsError ? (
                      <StateNotice
                        title="Tools unavailable"
                        detail={toolsError}
                        retry={() => setRetry((n) => n + 1)}
                      />
                    ) : !tools ? (
                      <StateNotice loading title="Loading tools…" />
                    ) : (
                      toolOptions.map((tool) => (
                        <SwitchRow
                          key={tool.name}
                          label={
                            (
                              {
                                read: "Read files",
                                bash: "Run shell commands",
                                edit: "Edit files",
                                write: "Write files",
                                grep: "Search file contents",
                                find: "Find files",
                                ls: "List files",
                              } as Record<string, string>
                            )[tool.name] ?? tool.name
                          }
                          checked={draft.configuration.tools.includes(
                            tool.name,
                          )}
                          onChange={(checked) =>
                            patch({
                              configuration: {
                                ...draft.configuration,
                                tools: checked
                                  ? [...draft.configuration.tools, tool.name]
                                  : draft.configuration.tools.filter(
                                      (name) => name !== tool.name,
                                    ),
                              },
                            })
                          }
                        />
                      ))
                    )}
                  </SettingsSection>
                )}
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="py-2 text-sm text-destructive [overflow-wrap:anywhere]"
              >
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="mx-6 mb-5 flex-row flex-wrap items-center justify-between pt-4 sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-body-muted-foreground">
              <Switch
                checked={draft.enabled}
                disabled={pending}
                onCheckedChange={(enabled) => patch({ enabled })}
              />
              Run automatically
            </label>
            <div className="ml-auto flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save automation"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
