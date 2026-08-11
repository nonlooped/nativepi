import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DRAG_REGION = "app-drag"
export const NO_DRAG_REGION = "app-no-drag"

// Both resolve in `index.css`, where they can answer a media query: neither the
// window controls nor a classic scrollbar exists when the app is opened from a
// phone, and reserving space for them there costs a tenth of the screen.
export const WINDOW_CONTROLS_CLEARANCE = "window-controls-clearance"

export const SCROLLBAR_GUTTER_OFFSET = "scrollbar-gutter-offset"

/** A control that is revealed on hover, and therefore always shown on touch. */
export const HOVER_REVEAL =
  "hover-reveal scale-[0.25] opacity-0 blur-[4px] transition-[opacity,filter,scale] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"

/** Shared, interruptible motion for menus and anchored selection surfaces. */
export const POPUP_MOTION =
  "origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0"
