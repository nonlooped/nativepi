import { create } from "zustand";
import type { SetStateAction } from "react";
/** Unsaved NativePi forms survive dismissal/navigation; no Pi conversation data is duplicated here. */
export const useFormDrafts = create<{ values: Record<string, unknown> }>(() => ({ values: {} }));
export function forgetFormDrafts(prefix: string) { useFormDrafts.setState(s => ({ values: Object.fromEntries(Object.entries(s.values).filter(([key]) => !key.startsWith(prefix))) })); }
export function useFormDraft<T>(key: string, initial: T) {
  const saved = useFormDrafts(s => s.values[key]);
  const value = saved === undefined ? initial : saved as T;
  const set = (next: SetStateAction<T>) => useFormDrafts.setState(state => {
    const previous = state.values[key] === undefined ? initial : state.values[key] as T;
    return { values: { ...state.values, [key]: typeof next === "function" ? (next as (value: T) => T)(previous) : next } };
  });
  const clear = () => useFormDrafts.setState(state => { const values = { ...state.values }; delete values[key]; return { values }; });
  return [value, set, clear] as const;
}
