import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DRAG_REGION = "app-drag"
export const NO_DRAG_REGION = "app-no-drag"

export const WINDOW_CONTROLS_CLEARANCE = "pr-[132px]"

export const SCROLLBAR_GUTTER_OFFSET = "pr-[26px]"
