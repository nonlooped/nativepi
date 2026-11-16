import { create, useStore } from "zustand";
import { usePaneStore, type PaneStore } from "./store.ts";
const views = new WeakMap<PaneStore, ReturnType<typeof createView>>();
function createView() {
  return create<{ extensionView: string | null; setExtensionView: (value: string | null) => void }>(set => ({ extensionView: null, setExtensionView: extensionView => set({ extensionView }) }));
}
export function usePaneView() {
  const pane = usePaneStore();
  let view = views.get(pane);
  if (!view) { view = createView(); views.set(pane, view); }
  return useStore(view);
}
