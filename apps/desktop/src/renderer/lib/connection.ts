import { createStore } from "zustand/vanilla";
export interface ConnectionState {
  phase: "connecting" | "connected" | "reconnecting" | "unavailable";
  error?: string;
}
/** Browser transport health is transient and never persisted with UI preferences. */
export const remoteConnection = createStore<ConnectionState>(() => ({ phase: "connecting" }));
