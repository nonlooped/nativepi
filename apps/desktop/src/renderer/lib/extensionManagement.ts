import { create } from "zustand";
/** A navigation target only; extensions and their configuration remain Pi-owned. */
export const useExtensionManagement = create<{ target: { id: string; name: string } | null }>(() => ({ target: null }));
