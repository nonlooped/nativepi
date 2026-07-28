import { useId } from "react";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

/**
 * One settings screen's worth of layout.
 *
 * Every row is the same shape — a label, a sentence of explanation, and one
 * control on the right — so the shape lives here rather than being retyped in
 * nine panels. The rows carry the rules on purpose: a divider between settings
 * reads as a list, while a card around each one reads as nine unrelated widgets.
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
      {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
      <div className="mt-4 flex flex-col">{children}</div>
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
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  /** Put the control on its own line, for anything wider than a few characters. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const text = (
    <div className="flex min-w-0 flex-col gap-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="w-fit text-sm font-medium">
          {label}
        </label>
      ) : (
        <p className="text-sm font-medium">{label}</p>
      )}
      {description ? <p className="text-sm leading-5 text-muted-foreground">{description}</p> : null}
    </div>
  );

  if (wide) {
    return (
      <div className="flex flex-col gap-3 border-t py-5">
        {text}
        {children}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-8 border-t py-5">
      {text}
      <div className="shrink-0">{children}</div>
    </div>
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
        {/* The trigger's own height is a `data-size` variant, so plain `h-9`
            would lose to it on specificity and the row would stay compact. */}
        <SelectTrigger aria-label={label} className="min-w-44 px-3 text-sm data-[size=default]:h-9">
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
      <div className="flex w-56 items-center gap-4">
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
  const commit = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.target.value !== value) onCommit(event.target.value);
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
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          spellCheck={false}
          className="w-72 font-mono text-xs"
        />
      )}
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
    <Row label={label} description={description}>
      <div className="flex items-center gap-2">
        <span className="max-w-72 truncate select-all font-mono text-xs text-muted-foreground" title={value}>{value}</span>
        {action}
      </div>
    </Row>
  );
}
