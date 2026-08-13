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

/**
 * One settings screen's worth of layout.
 *
 * Every row is the same shape — a label, a sentence of explanation, and one
 * control on the right — so the shape lives here rather than being retyped in
 * nine panels. The rows carry the rules on purpose: a divider between settings
 * reads as a list, while a card around each one reads as nine unrelated widgets.
 *
 * The exception is a setting that has state of its own rather than just a value:
 * a link that is or is not being served, an extension that is or is not loaded,
 * an update that is or is not waiting. Those get `SettingsCard`, because a state
 * dot and an outcome need somewhere to live that a two-column row does not have.
 *
 * Buttons in either right-hand column are `size="xl"`. That is the 2.5rem form
 * scale DESIGN.md gives `input` and `button-form`, and it is what `Input`,
 * `SelectTrigger` and `Segmented` below already stand at — a shorter button in
 * the same column is visibly out of line with the row above it. Compact sizes
 * stay for section headers and inline row actions, which are not form controls.
 */

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
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="font-heading text-sm font-semibold">
        {heading}
      </h2>
      {description ? <p className="mt-1 text-sm leading-5 text-body-muted-foreground">{description}</p> : null}
      <FieldGroup className="mt-4 flex flex-col">{children}</FieldGroup>
    </section>
  );
}

/**
 * A single setting.
 *
 * `htmlFor` is required for controls that are focusable form elements and
 * omitted for the ones that are not, which is why the label element is chosen
 * rather than always rendered as one: a `<label for>` pointing at nothing is
 * worse for a screen reader than a plain paragraph.
 */
function Row({
  label,
  description,
  htmlFor,
  wide,
  shrinkable,
  children,
}: {
  label: React.ReactNode;
  description?: string;
  htmlFor?: string;
  /** Put the control on its own line, for anything wider than a few characters. */
  wide?: boolean;
  /**
   * Let the control column give width back to the label when it is too wide.
   *
   * Controls are fixed-width by default so they keep their proportions, but a
   * row holding a URL or a filesystem path has a max-content width wider than
   * the panel, and a column that cannot shrink makes the label absorb the whole
   * overflow — one word per line beside a full-width link.
   */
  shrinkable?: boolean;
  children: React.ReactNode;
}) {
  const text = (
    <FieldContent className="min-w-0 gap-1">
      {htmlFor ? (
        <FieldLabel htmlFor={htmlFor} className="w-fit text-sm font-medium">
          {label}
        </FieldLabel>
      ) : (
        <FieldTitle className="text-sm font-medium">{label}</FieldTitle>
      )}
      {description ? <FieldDescription className="text-sm leading-5">{description}</FieldDescription> : null}
    </FieldContent>
  );

  if (wide) {
    return (
      <Field orientation="vertical" className="flex flex-col gap-3 border-t py-5">
        {text}
        {children}
      </Field>
    );
  }

  // Label and control sit side by side where there is room for both, and stack
  // below it. A 14rem select next to a two-line explanation is what turns a
  // settings list into two columns of four-character-wide text on a phone.
  return (
    <Field orientation="horizontal" className="flex flex-col gap-3 border-t py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      {text}
      <div className={shrinkable ? "min-w-0" : "sm:shrink-0"}>{children}</div>
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
    <Row label={label} description={description} htmlFor={id}>
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
        {/* 2.5rem is the form scale DESIGN.md gives both `input` and
            `button-form`, and a settings list puts all three in one column. The
            trigger's own height is a `data-size` variant, so a plain `h-10`
            would lose to it on specificity and the row would stay compact. */}
        <SelectTrigger aria-label={label} className="w-full px-3 text-sm data-[size=default]:h-10 sm:w-auto sm:min-w-44">
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

/**
 * A small enumeration, all of it visible.
 *
 * A select hides every alternative behind a click, which is the right trade for
 * a long list and the wrong one for three words. Anything past four options, or
 * with labels longer than a couple of words, stays a `SelectRow`.
 */
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

/** The segmented control itself, for the panels that need one outside a row. */
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
      className={cn("h-auto min-h-10 w-full flex-wrap rounded-md border p-0.5 sm:h-10 sm:w-auto sm:flex-nowrap", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={disabled || option.disabled}
          title={option.title}
          className="h-9 flex-1 px-3 text-sm text-muted-foreground data-pressed:bg-accent data-pressed:text-accent-foreground sm:flex-none"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * A choice whose options are easier to recognize than to read.
 *
 * Conversation width and diff layout are both shapes, and a picture of the shape
 * settles the question faster than the sentence describing it does.
 */
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
  // A radio group is a single tab stop the arrows move within. Declaring the
  // roles without that behaviour promised an interaction the cards did not have,
  // so the keyboard contract is implemented rather than the roles dropped: these
  // are a picture of one setting's alternatives, which is what a radio group is.
  const move = (index: number, step: number) => {
    const next = options[(index + step + options.length) % options.length];
    if (next) onChange(next.value);
  };
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  return (
    <Row label={label} description={description} wide>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

/**
 * A setting that is a thing rather than a value.
 *
 * The state line is the point: it says what is true right now, in colour and in
 * a word, so that the surrounding paragraph can be shorter or absent. `children`
 * holds whatever only exists once the thing is on — a link, a device list — and
 * is separated by a rule rather than a second card.
 */
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
    <section className="rounded-xl border bg-card/40">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
        {icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:size-[1.125rem]">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {status ? (
            <p className={cn("mt-1 flex items-center gap-1.5 text-sm", TONE_TEXT[tone])}>
              <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
              {status}
            </p>
          ) : null}
          {description ? <p className="mt-1 text-sm leading-5 text-body-muted-foreground">{description}</p> : null}
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="border-t p-4">{children}</div> : null}
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
      <div className="flex w-full items-center gap-4 sm:w-56">
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
 * A free-text setting, committed on blur rather than per keystroke.
 *
 * Every one of these writes a file, and half of them restart Pi; saving while
 * someone is halfway through typing a shell path would write a dozen invalid
 * ones on the way to the valid one.
 *
 * Unmounting counts as leaving the field. Closing Settings with Escape never
 * fires a blur, so a value typed and not tabbed out of used to be dropped
 * without a word.
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
  const field = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const commitOnUnmount = useEffectEvent(() => {
    const typed = field.current?.value;
    if (typed !== undefined && typed !== value) onCommit(typed);
  });

  useEffect(() => () => commitOnUnmount(), []);

  const commit = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.target.value !== value) onCommit(event.target.value);
  };

  return (
    <Row label={label} description={description} htmlFor={id} wide={multiline}>
      {multiline ? (
        <Textarea
          id={id}
          key={value}
          ref={field as React.Ref<HTMLTextAreaElement>}
          defaultValue={value}
          placeholder={placeholder}
          onBlur={commit}
          spellCheck={false}
          // `field-sizing: content` on the base component means it grows with
          // what is typed; `rows` would be ignored, so the floor is set here.
          className="min-h-24 font-mono text-xs"
        />
      ) : (
        <Input
          id={id}
          key={value}
          ref={field as React.Ref<HTMLInputElement>}
          defaultValue={value}
          placeholder={placeholder}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          spellCheck={false}
          className="w-full font-mono text-xs sm:w-72"
        />
      )}
    </Row>
  );
}

/** A setting whose control performs an action rather than holding a value. */
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

/** A value the user can read and copy but not edit, such as a path or a version. */
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
        {/* A path or a version can be longer than a phone is wide, and it is the
            one thing in the row the reader came to copy. */}
        <span className="min-w-0 break-all select-all font-mono text-xs text-muted-foreground">{value}</span>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </Row>
  );
}
