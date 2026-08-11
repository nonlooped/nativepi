import { useId, useState } from "react";
import { toast } from "sonner";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { useAppStore } from "../../lib/store.ts";
import {
  selectedCustomTheme,
  selectedTheme,
  themeContrastIssues,
  themePreviewStyle,
} from "../../lib/themes.ts";
import {
  BUILT_IN_THEMES,
  MAX_CUSTOM_THEMES,
  NATIVE_THEME_ID,
  builtInTheme,
  customThemeSchema,
  themeFile,
  themeFileSchema,
  themeColorsSchema,
  type CustomTheme,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeFile,
} from "../../../shared/themes.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { showHint } from "../../lib/toast.tsx";
import ConfirmDialog from "../ConfirmDialog.tsx";
import { ActionRow, ChoiceCards, ChoiceRow, Segmented } from "./rows.tsx";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const COLOR_GROUPS: { legend: string; fields: { key: keyof ThemeColors; label: string }[] }[] = [
  {
    legend: "Surfaces and text",
    fields: [
      { key: "background", label: "Workspace" },
      { key: "foreground", label: "Text" },
      { key: "surface", label: "Raised surface" },
      { key: "sidebar", label: "Sidebar" },
      { key: "muted", label: "Muted surface" },
      { key: "mutedForeground", label: "Muted text" },
      { key: "accent", label: "Selected surface" },
      { key: "border", label: "Borders" },
    ],
  },
  {
    legend: "Actions and status",
    fields: [
      { key: "primary", label: "Primary action" },
      { key: "primaryForeground", label: "Primary text" },
      { key: "destructive", label: "Destructive" },
      { key: "success", label: "Success" },
      { key: "warning", label: "Warning" },
      { key: "info", label: "Information" },
      { key: "favorite", label: "Favorite" },
    ],
  },
];

function customThemeId(): string {
  return `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function editableCopy(source: ThemeFile): CustomTheme {
  return {
    ...source,
    id: customThemeId(),
    name: `${source.name} copy`,
    colors: {
      light: { ...source.colors.light },
      dark: { ...source.colors.dark },
    },
  };
}

function MiniThemeVariant({ colors }: { colors: ThemeColors }) {
  return (
    <span style={themePreviewStyle(colors)} className="flex size-full overflow-hidden bg-background text-foreground">
      <span className="w-1/3 border-e border-border bg-sidebar p-1">
        <span className="block h-1 w-3/4 rounded-full bg-muted-foreground/60" />
        <span className="mt-1 block h-1 w-full rounded-full bg-accent" />
        <span className="mt-1 block h-1 w-2/3 rounded-full bg-muted-foreground/40" />
      </span>
      <span className="flex flex-1 flex-col justify-between p-1.5">
        <span>
          <span className="block h-1 w-3/4 rounded-full bg-foreground/70" />
          <span className="mt-1 block h-1 w-full rounded-full bg-muted-foreground/45" />
        </span>
        <span className="flex h-3 items-center rounded-sm border border-border bg-card px-1">
          <span className="h-1 flex-1 rounded-full bg-muted-foreground/40" />
          <span className="ms-1 size-1.5 rounded-full bg-primary" />
        </span>
      </span>
    </span>
  );
}

function MiniThemePreview({ theme }: { theme: ThemeFile }) {
  return (
    <span className="flex size-full gap-px overflow-hidden rounded-sm bg-border">
      <span className="min-w-0 flex-1"><MiniThemeVariant colors={theme.colors.light} /></span>
      <span className="min-w-0 flex-1"><MiniThemeVariant colors={theme.colors.dark} /></span>
    </span>
  );
}

export default function ThemeSettings() {
  const preferences = useAppStore((state) => state.preferences);
  const setPreference = useAppStore((state) => state.setPreference);
  const [editing, setEditing] = useState<CustomTheme | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activeCustom = selectedCustomTheme(preferences);
  const activeBuiltIn = builtInTheme(preferences.themeId);
  const selected = activeCustom?.id ?? activeBuiltIn?.id ?? NATIVE_THEME_ID;
  const options = [
    ...BUILT_IN_THEMES.map(({ id, theme }) => ({
      value: id,
      label: theme.name,
      preview: <MiniThemePreview theme={theme} />,
    })),
    ...preferences.customThemes.map((theme) => ({
      value: theme.id,
      label: theme.name,
      preview: <MiniThemePreview theme={theme} />,
    })),
  ];

  const select = (value: string) => {
    setPreference("themeId", value);
  };

  const save = (theme: CustomTheme) => {
    const exists = preferences.customThemes.some((candidate) => candidate.id === theme.id);
    const customThemes = exists
      ? preferences.customThemes.map((candidate) => candidate.id === theme.id ? theme : candidate)
      : [...preferences.customThemes, theme];
    setPreference("customThemes", customThemes);
    setPreference("themeId", theme.id);
    setEditing(null);
    showHint(exists ? "Color scheme saved" : "Color scheme created");
  };

  const create = () => {
    setEditing(editableCopy(selectedTheme(preferences)));
  };

  const copyJson = () => {
    if (!activeCustom) return;
    const json = JSON.stringify(themeFile(activeCustom), null, 2);
    void navigator.clipboard.writeText(json).then(
      () => showHint("Color scheme JSON copied"),
      () => toast.error("Unable to copy the color scheme. Check clipboard permission and try again."),
    );
  };

  const remove = () => {
    if (!activeCustom) return;
    setPreference("customThemes", preferences.customThemes.filter((theme) => theme.id !== activeCustom.id));
    setPreference("themeId", NATIVE_THEME_ID);
    setDeleting(false);
    showHint("Color scheme deleted");
  };

  return (
    <>
      <ChoiceRow
        label="Appearance"
        description="System follows this device. Every color scheme has a light and dark variant."
        value={preferences.theme}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        onChange={(value) => setPreference("theme", value)}
      />
      <ChoiceCards
        label="Color scheme"
        description="Choose the colors NativePi uses in both appearances."
        value={selected}
        options={options}
        onChange={select}
      />
      <ActionRow
        label="Color schemes"
        description="Duplicate the current scheme to customize it, or import JSON shared by someone else."
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="xl" onClick={create} disabled={preferences.customThemes.length >= MAX_CUSTOM_THEMES}>
            <PlusIcon data-icon="inline-start" />
            Create scheme
          </Button>
          <Button
            variant="outline"
            size="xl"
            onClick={() => setImporting(true)}
            disabled={preferences.customThemes.length >= MAX_CUSTOM_THEMES}
          >
            <DownloadSimpleIcon data-icon="inline-start" />
            Import scheme
          </Button>
          {activeCustom ? (
            <>
              <Button
                variant="ghost"
                size="xl"
                onClick={() => setEditing({
                  ...activeCustom,
                  colors: {
                    light: { ...activeCustom.colors.light },
                    dark: { ...activeCustom.colors.dark },
                  },
                })}
              >
                <PencilSimpleIcon data-icon="inline-start" />
                Edit
              </Button>
              <Button variant="ghost" size="xl" onClick={copyJson}>
                <CopyIcon data-icon="inline-start" />
                Copy JSON
              </Button>
              <Button variant="destructive" size="xl" onClick={() => setDeleting(true)}>
                <TrashIcon data-icon="inline-start" />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </ActionRow>

      {editing ? (
        <ThemeEditor
          theme={editing}
          creating={!preferences.customThemes.some((candidate) => candidate.id === editing.id)}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {importing ? (
        <ThemeImport
          onClose={() => setImporting(false)}
          onImport={(file) => {
            save({ ...file, id: customThemeId() });
            setImporting(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting}
        title="Delete this color scheme?"
        description={activeCustom ? `“${activeCustom.name}” will be removed from this window.` : "This color scheme will be removed."}
        confirmLabel="Delete scheme"
        destructive
        onConfirm={remove}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}

function ThemeEditor({
  theme,
  creating,
  onSave,
  onClose,
}: {
  theme: CustomTheme;
  creating: boolean;
  onSave: (theme: CustomTheme) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(theme);
  const [variant, setVariant] = useState<ThemeAppearance>("light");
  const parsed = customThemeSchema.safeParse(draft);
  const contrastIssues = (["light", "dark"] as const).flatMap((appearance) => {
    const colors = themeColorsSchema.safeParse(draft.colors[appearance]);
    return colors.success
      ? themeContrastIssues(colors.data).map((issue) => `${appearance === "light" ? "Light" : "Dark"}: ${issue}`)
      : [];
  });
  const nameInvalid = draft.name.trim().length === 0 || draft.name.trim().length > 60;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <form
          className="flex min-h-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (parsed.success && contrastIssues.length === 0) onSave(parsed.data);
          }}
        >
          <DialogHeader>
            <DialogTitle>{creating ? "Create color scheme" : "Edit color scheme"}</DialogTitle>
            <DialogDescription>Changes stay in NativePi and take effect when you save.</DialogDescription>
          </DialogHeader>

          <ThemePreview colors={draft.colors[variant]} />

          <FieldGroup>
            <Field data-invalid={nameInvalid || undefined}>
              <FieldLabel htmlFor="theme-name">Name</FieldLabel>
              <Input
                id="theme-name"
                value={draft.name}
                aria-invalid={nameInvalid || undefined}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              {nameInvalid ? <FieldError>Use a name between 1 and 60 characters.</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel>Variant</FieldLabel>
              <FieldDescription>Edit both variants before saving. This switch only changes the editor preview.</FieldDescription>
              <Segmented
                label="Variant"
                value={variant}
                options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
                onChange={setVariant}
              />
            </Field>

            {COLOR_GROUPS.map((group) => (
              <FieldSet key={group.legend}>
                <FieldLegend>{group.legend}</FieldLegend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <ColorField
                      key={field.key}
                      label={field.label}
                      value={draft.colors[variant][field.key]}
                      onChange={(value) => setDraft({
                        ...draft,
                        colors: {
                          ...draft.colors,
                          [variant]: { ...draft.colors[variant], [field.key]: value },
                        },
                      })}
                    />
                  ))}
                </div>
              </FieldSet>
            ))}
          </FieldGroup>

          {contrastIssues.length > 0 ? (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Improve the contrast before saving:</p>
              <ul className="mt-1 list-disc pl-5">
                {contrastIssues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!parsed.success || contrastIssues.length > 0}>Save scheme</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ThemePreview({ colors }: { colors: ThemeColors }) {
  return (
    <div
      style={themePreviewStyle(colors)}
      className="overflow-hidden rounded-xl border border-border bg-background font-sans text-foreground"
    >
      <div className="grid min-h-32 grid-cols-[7rem_1fr]">
        <div className="border-e border-border bg-sidebar p-3">
          <p className="font-heading text-xs font-semibold">Projects</p>
          <div className="mt-2 rounded-md bg-accent px-2 py-1.5 text-xs">NativePi</div>
          <p className="mt-2 truncate font-mono text-[0.625rem] text-muted-foreground">src/renderer</p>
        </div>
        <div className="flex min-w-0 flex-col justify-between p-3">
          <div>
            <p className="font-heading text-sm font-semibold">Color preview</p>
            <p className="mt-1 text-xs text-muted-foreground">Colors for surfaces, text, actions, and status appear here.</p>
            <p className="mt-2 font-mono text-xs text-info">const theme = &quot;custom&quot;</p>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card p-2">
            <span className="text-xs text-muted-foreground">Ask Pi anything…</span>
            <span className="ms-auto rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">Send</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const invalid = !HEX_COLOR.test(value);
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={invalid ? "#000000" : value}
          aria-label={`${label} color picker`}
          className="size-10 shrink-0 cursor-pointer p-1"
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          id={id}
          value={value}
          aria-invalid={invalid || undefined}
          className="font-mono"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {invalid ? <FieldError>Use a six-digit hex color, such as #1a1a1e.</FieldError> : null}
    </Field>
  );
}

function ThemeImport({ onClose, onImport }: { onClose: () => void; onImport: (theme: ThemeFile) => void }) {
  const [json, setJson] = useState("");
  const [error, setError] = useState<string>();

  const submit = () => {
    try {
      const parsed = themeFileSchema.safeParse(JSON.parse(json));
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "The theme JSON is not valid.");
        return;
      }
      const issues = (["light", "dark"] as const).flatMap((appearance) =>
        themeContrastIssues(parsed.data.colors[appearance]).map(
          (issue) => `${appearance === "light" ? "Light" : "Dark"}: ${issue}`,
        ),
      );
      if (issues.length > 0) {
        setError(issues[0]);
        return;
      }
      onImport(parsed.data);
      setJson("");
      setError(undefined);
    } catch {
      setError("Paste a complete theme JSON object.");
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import color scheme</DialogTitle>
          <DialogDescription>Paste a NativePi color scheme with light and dark variants.</DialogDescription>
        </DialogHeader>
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="theme-json">Color scheme JSON</FieldLabel>
          <Textarea
            id="theme-json"
            value={json}
            aria-invalid={!!error || undefined}
            className="min-h-56 font-mono text-xs"
            placeholder={'{\n  "version": 1,\n  "name": "My color scheme",\n  "colors": { "light": {}, "dark": {} }\n}'}
            spellCheck={false}
            onChange={(event) => {
              setJson(event.target.value);
              setError(undefined);
            }}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!json.trim()}>Import scheme</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
