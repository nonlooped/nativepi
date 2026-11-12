/** One range for persisted preferences, the slider, and keyboard shortcuts. */
export const DEFAULT_INTERFACE_SCALE = 1.1;
export const MIN_INTERFACE_SCALE = 0.9;
export const MAX_INTERFACE_SCALE = 1.4;
export const INTERFACE_SCALE_STEP = 0.05;

export function stepInterfaceScale(scale: number, direction: 1 | -1): number {
  return Math.min(MAX_INTERFACE_SCALE, Math.max(MIN_INTERFACE_SCALE,
    Math.round((scale + direction * INTERFACE_SCALE_STEP) * 100) / 100));
}
