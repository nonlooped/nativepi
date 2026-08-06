// @nativepi/extension-api/ui
// NativePi's own interface components, lent to graphical extensions.
//
// Tailwind builds NativePi's stylesheet from NativePi's sources, and an
// extension is compiled long after that, so a class an extension invents has no
// rule behind it. These components carry their styles with them, which is what
// makes an extension look like the rest of the window rather than like an
// embedded page. Reach for component props first, and use inline styles for
// layout an extension has to describe itself.
//
// NativePi rewrites this specifier to its already-loaded components, so nothing
// here is bundled and there is no second copy of the interface.

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

function pick<P>(name: string): ComponentType<P> {
  const host = globalThis.__NATIVEPI_HOST__?.["@nativepi/extension-api/ui"] as
    Record<string, unknown> | undefined;
  const component = host?.[name];
  if (component) return component as ComponentType<P>;
  return (() => {
    throw new Error(
      `${name} from @nativepi/extension-api/ui is only available inside NativePi.`,
    );
  }) as ComponentType<P>;
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?:
    "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  size?:
    | "default"
    | "xs"
    | "sm"
    | "lg"
    | "xl"
    | "icon"
    | "icon-xs"
    | "icon-sm"
    | "icon-lg";
}

interface StyledProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

type TriggerProps<State> = Omit<
  ComponentProps<"button">,
  "className" | "style"
> & {
  className?: string | ((state: State) => string | undefined);
  style?: CSSProperties | ((state: State) => CSSProperties | undefined);
  /** Replaces the native button with an element or render function. */
  render?:
    | ReactElement
    | ((props: HTMLAttributes<HTMLElement>, state: State) => ReactElement);
  /** Set false when `render` does not produce a native button. */
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

interface DialogRootProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

interface MenuRootProps extends DialogRootProps {
  modal?: boolean;
}

interface MenuContentProps extends StyledProps {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

interface MenuItemProps extends ComponentProps<"div"> {
  disabled?: boolean;
  variant?: "default" | "destructive";
}

interface SettingsActionRowProps {
  label: ReactNode;
  description?: string;
  children: ReactNode;
}

export const Button: ComponentType<ButtonProps> = pick("Button");

export const Dialog: ComponentType<DialogRootProps> = pick("Dialog");
export const DialogTrigger: ComponentType<TriggerProps<DialogTriggerState>> =
  pick("DialogTrigger");
export const DialogClose: ComponentType<TriggerProps<DialogCloseState>> =
  pick("DialogClose");
export const DialogContent: ComponentType<StyledProps> = pick("DialogContent");
export const DialogHeader: ComponentType<StyledProps> = pick("DialogHeader");
export const DialogFooter: ComponentType<StyledProps> = pick("DialogFooter");
export const DialogTitle: ComponentType<StyledProps> = pick("DialogTitle");
export const DialogDescription: ComponentType<StyledProps> =
  pick("DialogDescription");

export const Menu: ComponentType<MenuRootProps> = pick("Menu");
export const MenuTrigger: ComponentType<
  TriggerProps<MenuTriggerState> & {
    delay?: number;
    closeDelay?: number;
    openOnHover?: boolean;
  }
> = pick("MenuTrigger");
export const MenuContent: ComponentType<MenuContentProps> = pick("MenuContent");
export const MenuGroup: ComponentType<StyledProps> = pick("MenuGroup");
export const MenuLabel: ComponentType<StyledProps> = pick("MenuLabel");
export const MenuItem: ComponentType<MenuItemProps> = pick("MenuItem");
export const MenuSeparator: ComponentType<StyledProps> = pick("MenuSeparator");

/** A labelled control row for a NativePi settings section. */
export const SettingsActionRow: ComponentType<SettingsActionRowProps> =
  pick("SettingsActionRow");
