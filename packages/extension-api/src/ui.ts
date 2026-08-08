/** NativePi-styled components available to graphical renderers. */
import type {
  ComponentProps,
  ComponentType,
  CSSProperties,
  HTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";

declare global {
  // eslint-disable-next-line no-var
  var __NATIVEPI_HOST__: Record<string, unknown> | undefined;
}

function pick<Props>(name: string): ComponentType<Props> {
  const host = globalThis.__NATIVEPI_HOST__?.["@nativepi/extension-api/ui"] as
    Record<string, unknown> | undefined;
  const component = host?.[name];
  if (component) return component as ComponentType<Props>;
  return (() => {
    throw new Error(`${name} from @nativepi/extension-api/ui is only available inside NativePi.`);
  }) as ComponentType<Props>;
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "xl" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
}

export interface BadgeProps extends ComponentProps<"span"> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  render?: ReactElement;
}

interface StyledProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

type TriggerProps<State> = Omit<ComponentProps<"button">, "className" | "style"> & {
  className?: string | ((state: State) => string | undefined);
  style?: CSSProperties | ((state: State) => CSSProperties | undefined);
  render?: ReactElement | ((props: HTMLAttributes<HTMLElement>, state: State) => ReactElement);
  nativeButton?: boolean;
};

interface DialogTriggerState {
  disabled: boolean;
  open: boolean;
}

interface DialogCloseState {
  disabled: boolean;
}

interface MenuTriggerState {
  disabled: boolean;
  open: boolean;
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export interface MenuProps extends DialogProps {
  modal?: boolean;
}

export interface MenuContentProps extends StyledProps {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export interface MenuItemProps extends ComponentProps<"div"> {
  disabled?: boolean;
  variant?: "default" | "destructive";
}

export interface SwitchProps extends Omit<ComponentProps<"button">, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "default";
}

export interface SelectProps {
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  disabled?: boolean;
  items?: readonly { value: string; label: string }[] | Record<string, string>;
  children?: ReactNode;
}

export interface SelectTriggerProps extends ComponentProps<"button"> {
  size?: "sm" | "default";
}

export interface SelectContentProps extends StyledProps {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
  alignItemWithTrigger?: boolean;
}

export interface SelectItemProps extends ComponentProps<"div"> {
  value: string;
  disabled?: boolean;
}

export interface FieldProps extends ComponentProps<"div"> {
  orientation?: "vertical" | "horizontal" | "responsive";
}

export interface FieldErrorProps extends ComponentProps<"div"> {
  errors?: Array<{ message?: string } | undefined>;
}

export interface SettingsActionRowProps {
  label: ReactNode;
  description?: string;
  children: ReactNode;
}

export interface SettingsSwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export interface SettingsSelectRowProps {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export interface SettingsTextRowProps {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}

export interface SettingsSliderRowProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

export const Button: ComponentType<ButtonProps> = pick("Button");
export const Badge: ComponentType<BadgeProps> = pick("Badge");
export const Input: ComponentType<ComponentProps<"input">> = pick("Input");
export const Textarea: ComponentType<ComponentProps<"textarea">> = pick("Textarea");
export const Label: ComponentType<ComponentProps<"label">> = pick("Label");
export const Switch: ComponentType<SwitchProps> = pick("Switch");
export const Separator: ComponentType<ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }> =
  pick("Separator");

export const Field: ComponentType<FieldProps> = pick("Field");
export const FieldContent: ComponentType<ComponentProps<"div">> = pick("FieldContent");
export const FieldDescription: ComponentType<ComponentProps<"p">> = pick("FieldDescription");
export const FieldError: ComponentType<FieldErrorProps> = pick("FieldError");
export const FieldGroup: ComponentType<ComponentProps<"div">> = pick("FieldGroup");
export const FieldLabel: ComponentType<ComponentProps<"label">> = pick("FieldLabel");

export const Dialog: ComponentType<DialogProps> = pick("Dialog");
export const DialogTrigger: ComponentType<TriggerProps<DialogTriggerState>> = pick("DialogTrigger");
export const DialogClose: ComponentType<TriggerProps<DialogCloseState>> = pick("DialogClose");
export const DialogContent: ComponentType<StyledProps> = pick("DialogContent");
export const DialogHeader: ComponentType<StyledProps> = pick("DialogHeader");
export const DialogFooter: ComponentType<StyledProps> = pick("DialogFooter");
export const DialogTitle: ComponentType<StyledProps> = pick("DialogTitle");
export const DialogDescription: ComponentType<StyledProps> = pick("DialogDescription");

export const Menu: ComponentType<MenuProps> = pick("Menu");
export const MenuTrigger: ComponentType<
  TriggerProps<MenuTriggerState> & { delay?: number; closeDelay?: number; openOnHover?: boolean }
> = pick("MenuTrigger");
export const MenuContent: ComponentType<MenuContentProps> = pick("MenuContent");
export const MenuGroup: ComponentType<StyledProps> = pick("MenuGroup");
export const MenuLabel: ComponentType<StyledProps> = pick("MenuLabel");
export const MenuItem: ComponentType<MenuItemProps> = pick("MenuItem");
export const MenuSeparator: ComponentType<StyledProps> = pick("MenuSeparator");

export const Select: ComponentType<SelectProps> = pick("Select");
export const SelectContent: ComponentType<SelectContentProps> = pick("SelectContent");
export const SelectGroup: ComponentType<StyledProps> = pick("SelectGroup");
export const SelectItem: ComponentType<SelectItemProps> = pick("SelectItem");
export const SelectLabel: ComponentType<StyledProps> = pick("SelectLabel");
export const SelectSeparator: ComponentType<StyledProps> = pick("SelectSeparator");
export const SelectTrigger: ComponentType<SelectTriggerProps> = pick("SelectTrigger");
export const SelectValue: ComponentType<StyledProps> = pick("SelectValue");

export const SettingsActionRow: ComponentType<SettingsActionRowProps> = pick("SettingsActionRow");
export const SettingsSwitchRow: ComponentType<SettingsSwitchRowProps> = pick("SettingsSwitchRow");
export const SettingsSelectRow: ComponentType<SettingsSelectRowProps> = pick("SettingsSelectRow");
export const SettingsTextRow: ComponentType<SettingsTextRowProps> = pick("SettingsTextRow");
export const SettingsSliderRow: ComponentType<SettingsSliderRowProps> = pick("SettingsSliderRow");
