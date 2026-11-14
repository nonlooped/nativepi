import { useEffect, useEffectEvent, useId, useRef } from "react";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field.tsx";
import { cn } from "@/lib/utils.ts";

// Consistent setting groups; rows adapt to the content pane, not the window.
export function SettingsSection({
  heading,
  description,
  children,
}: {
  heading: string;
  description?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="border-b border-border/70 pb-2">
        <h2 id={id} className="text-sm font-semibold">
          {heading}
        </h2>
        {description ? <p className="mt-1 max-w-[60ch] text-pretty text-xs leading-relaxed text-body-muted-foreground">{description}</p> : null}
      </div>
      <FieldGroup className="settings-list gap-0">{children}</FieldGroup>
    </section>
  );
}

/** Supply `htmlFor` when the control has a matching form-field ID. */
function Row({
  label,
  description,
  htmlFor,
  wide,
  shrinkable,
  inline,
  children,
}: {
  label: React.ReactNode;
  description?: string;
  htmlFor?: string;
  /** Put the control on its own line, for anything wider than a few characters. */
  wide?: boolean;
  /** Allow long URLs and paths to shrink without squeezing out the label. */
  shrinkable?: boolean;
  /** Keep small controls beside their label even in narrow panes. */
  inline?: boolean;
  children: React.ReactNode;
}) {
  const text = (
    <FieldContent className="min-w-0 max-w-[60ch] gap-1">
      {htmlFor ? (
        <FieldLabel htmlFor={htmlFor} className="w-fit text-sm font-medium">
          {label}
        </FieldLabel>
      ) : (
        <FieldTitle className="text-sm font-medium">{label}</FieldTitle>
      )}
      {description ? <FieldDescription className="max-w-[60ch] text-xs leading-relaxed">{description}</FieldDescription> : null}
    </FieldContent>
  );

  if (wide) {
    return (
      <Field orientation="vertical" className="settings-row-wide flex flex-col gap-3 border-b border-border/40 py-3 last:border-b-0">
        {text}
        {children}
      </Field>
    );
  }

  return (
    <Field orientation="horizontal" className={cn("settings-row border-b border-border/40 py-3 last:border-b-0", inline && "settings-row-inline")}>
      {text}
      <div className={cn("settings-row-control", shrinkable && "min-w-0")}>{children}</div>
    </Field>
  );
}

export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Row label={label} description={description} htmlFor={id} inline>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Row>
  );
}

export function SelectRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    // Base UI's Select trigger is a button, not a labelable form control, so the
    // row labels the group instead of pointing `for` at something that would
    // reject it.
    <Row label={label} description={description}>
      <Select
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next as T);
        }}
        disabled={disabled}
        items={options}
      >
        {/* Match the trigger’s data-size specificity for a compact height. */}
        <SelectTrigger aria-label={label} className="w-full px-3 text-sm data-[size=default]:h-8 @min-[36rem]/settings-content:w-auto @min-[36rem]/settings-content:min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="min-h-8 px-2.5 text-sm">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}

/** Prefer visible alternatives for up to four short labels. */
export function ChoiceRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <Row label={label} description={description}>
      <Segmented label={label} value={value} options={options} onChange={onChange} disabled={disabled} />
    </Row>
  );
}

type SegmentedOption<T extends string> = { value: T; label: string; disabled?: boolean; title?: string };

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      value={[value]}
      // Base UI lets a pressed item be pressed again into nothing, and a setting
      // has no unset state to fall back to.
      onValueChange={(next) => {
        const selected = next.at(0);
        if (typeof selected === "string" && selected !== value) onChange(selected as T);
      }}
      spacing={0}
      aria-label={label}
      className={cn("h-auto min-h-9 w-full flex-wrap rounded-md bg-muted/60 p-1 @min-[36rem]/settings-content:w-auto", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={disabled || option.disabled}
          title={option.title}
          className="h-7 flex-1 px-3 text-sm text-muted-foreground data-pressed:bg-accent data-pressed:text-accent-foreground data-pressed:font-medium data-pressed:shadow-[inset_0_0_0_1px_var(--input)] @min-[36rem]/settings-content:flex-none"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ChoiceCards<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: T;
  options: { value: T; label: string; preview: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  const move = (index: number, step: number) => {
    const next = options[(index + step + options.length) % options.length];
    if (next) onChange(next.value);
  };
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  return (
    <Row label={label} description={description} wide>
      <div role="radiogroup" aria-label={label} className={cn("grid grid-cols-2 gap-2 @min-[32rem]/settings-content:grid-cols-4", options.length > 4 && "@min-[44rem]/settings-content:grid-cols-5")}>
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === selectedIndex ? 0 : -1}
              onKeyDown={(event) => {
                const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
                  : 0;
                if (!step) return;
                event.preventDefault();
                move(index, step);
                const group = event.currentTarget.parentElement;
                const target = group?.children[(index + step + options.length) % options.length];
                if (target instanceof HTMLElement) target.focus();
              }}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative flex flex-col gap-2 rounded-lg border p-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring",
                selected && "border-ring bg-muted/60",
              )}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none flex h-12 items-stretch overflow-hidden rounded-sm bg-background/70 p-1.5 *:min-w-0"
              >
                {option.preview}
              </span>
              <span className="px-0.5 text-xs font-medium">{option.label}</span>
              {selected ? (
                <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-foreground text-background" aria-hidden="true">
                  <CheckIcon />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Row>
  );
}

const TONE_DOT = {
  idle: "bg-muted-foreground/50",
  active: "bg-active",
  busy: "bg-warning animate-pulse",
  warning: "bg-warning",
  error: "bg-destructive",
} as const;

const TONE_TEXT = {
  idle: "text-muted-foreground",
  active: "text-active",
  busy: "text-warning",
  warning: "text-warning",
  error: "text-destructive",
} as const;

export type CardTone = keyof typeof TONE_DOT;

/** Stateful settings use a status line and optional detail below the action. */
export function SettingsCard({
  icon,
  title,
  tone = "idle",
  status,
  description,
  error,
  action,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  tone?: CardTone;
  status?: string;
  description?: string;
  error?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/40 py-3 last:border-b-0">
      <div className="flex flex-col gap-3 @min-[36rem]/settings-content:flex-row @min-[36rem]/settings-content:items-start @min-[36rem]/settings-content:gap-4">
        {icon ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground [&_svg]:size-[1.125rem]">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{title}</h3>
          {status ? (
            <p className={cn("mt-1 flex items-center gap-1.5 text-sm", TONE_TEXT[tone])}>
              <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
              {status}
            </p>
          ) : null}
          {description ? <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-body-muted-foreground">{description}</p> : null}
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-3 border-t border-border/40 pt-1">{children}</div> : null}
    </section>
  );
}

export function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Row label={label} description={description}>
      <div className="flex w-full items-center gap-4 @min-[36rem]/settings-content:w-56">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          aria-label={label}
          onValueChange={(next) => {
            const first = Array.isArray(next) ? next[0] : next;
            if (typeof first === "number") onChange(first);
          }}
        />
        <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{format(value)}</span>
      </div>
    </Row>
  );
}

/**
 * File-backed settings commit on blur or unmount, so partially typed paths are
 * never saved per keystroke. Closing Settings with Escape need not fire blur.
 */
export function TextRow({
  label,
  description,
  value,
  placeholder,
  multiline,
  onCommit,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const pending = useRef<{ source: string; typed: string } | null>(null);
  const commitOnUnmount = useEffectEvent(() => {
    const draft = pending.current;
    pending.current = null;
    if (draft && draft.source === value && draft.typed !== value) onCommit(draft.typed);
  });

  useEffect(() => () => commitOnUnmount(), []);
  useEffect(() => { pending.current = null; }, [value]);

  const edit = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    pending.current = { source: value, typed: event.currentTarget.value };
  };
  const commit = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    pending.current = null;
    if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
  };

  return (
    <Row label={label} description={description} htmlFor={id} wide={multiline}>
      {multiline ? (
        <Textarea
          id={id}
          key={value}
          defaultValue={value}
          placeholder={placeholder}
          onBlur={commit}
          onChange={edit}
          spellCheck={false}
          // `field-sizing: content` on the base component means it grows with
          // what is typed; `rows` would be ignored, so the floor is set here.
          className="min-h-24 font-mono text-xs"
        />
      ) : (
        <Input
          id={id}
          key={value}
          defaultValue={value}
          placeholder={placeholder}
          onBlur={commit}
          onChange={edit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          spellCheck={false}
          className="h-8 w-full font-mono text-xs @min-[36rem]/settings-content:w-64"
        />
      )}
    </Row>
  );
}

export function ActionRow({
  label,
  description,
  children,
}: {
  label: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Row label={label} description={description}>
      {children}
    </Row>
  );
}

export function ReadonlyRow({
  label,
  description,
  value,
  action,
}: {
  label: string;
  description?: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <Row label={label} description={description} shrinkable>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 break-all select-all font-mono text-xs text-muted-foreground">{value}</span>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </Row>
  );
}
