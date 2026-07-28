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
export const HOVER_REVEAL = "hover-reveal"
