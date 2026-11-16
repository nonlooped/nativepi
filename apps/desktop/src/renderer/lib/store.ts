import { create, useStore, type UseBoundStore, type StoreApi } from "zustand";
import { createContext, useContext } from "react";
import { rpc } from "./rpc.ts";
import { createAuthSlice } from "./store/auth.ts";
import { createChatSlice } from "./store/chat.ts";
import { createModelSlice } from "./store/models.ts";
import { createPiSettingsSlice } from "./store/piSettings.ts";
import { createProjectContextSlice } from "./store/projectContext.ts";
import { createUiSlice } from "./store/ui.ts";
import { createWorkspaceSlice } from "./store/workspace.ts";
import type { AppState, SliceCreator } from "./store/types.ts";
import { flushPersist, runtime } from "./store/internals.ts";

/**
 * One store, assembled from slices.
 *
 * The split is by subject — see `store/types.ts` — and exists so that finding
 * the code behind a piece of state does not mean scrolling a thousand lines. It
 * is not an isolation boundary: every slice is created with the same `set` and
 * `get`, so actions call across slices exactly as they did before.
 */
export const createAppState: SliceCreator<AppState> = (set, get) => ({
  ...createWorkspaceSlice(set, get),
  ...createChatSlice(set, get),
  ...createModelSlice(set, get),
  ...createAuthSlice(set, get),
  ...createProjectContextSlice(set, get),
  ...createPiSettingsSlice(set, get),
  ...createUiSlice(set, get),
});

export const primaryStore = create<AppState>(createAppState);
export type PaneStore = UseBoundStore<StoreApi<AppState>>;
export const PaneStoreContext = createContext<PaneStore>(primaryStore);
let focusedStore = primaryStore;
const paneStores = new Set<PaneStore>([primaryStore]);
export function focusedPaneStore() { return focusedStore; }
export function focusPaneStore(store: PaneStore) { focusedStore = store; }
export function usePaneStore() { return useContext(PaneStoreContext); }
export function createPaneStore() {
  const store = create<AppState>(createAppState);
  paneStores.add(store);
  return store;
}
export function releasePaneStore(store: PaneStore) {
  const owner = runtime(store.getState);
  void rpc.request.closeWorkspacePane({ paneId: owner.paneId }).catch(() => {});
  void flushPersist(store.getState).catch(() => {});
  owner.disposed = true;
  clearTimeout(owner.saveTimer);
  if (store === primaryStore) {
    // Keep the original store as the window's notification observer, without a
    // selection lease or persistence ownership after its pane has closed.
    store.setState({ activeProjectPath: null, activeSessionFile: null, extSurfaces: [] });
  } else paneStores.delete(store);
  if (focusedStore === store) focusedStore = primaryStore;
}

/** Selectors are pane-local. Imperative entry points outside React target focus. */
export const useAppStore = Object.assign(function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(useContext(PaneStoreContext), selector);
}, {
  getState: () => focusedStore.getState(),
  setState: ((...args: Parameters<PaneStore["setState"]>) => focusedStore.setState(...args)) as PaneStore["setState"],
  subscribe: primaryStore.subscribe,
  getInitialState: primaryStore.getInitialState,
});
export function eachPaneStore() { return [...paneStores]; }


const beforeUnload = () => { for (const store of paneStores) void flushPersist(store.getState).catch(() => {}); };
window.addEventListener?.("beforeunload", beforeUnload);

/**
 * Route host events into the store.
 *
 * Done here rather than in `rpc.ts` so that transport does not depend on state:
 * with the subscription there, `rpc -> store -> slices -> rpc` formed a cycle
 * that happened to work only because of module load order. Each listener reads
 * the store lazily, so nothing runs before the store above exists.
 */
function onEveryPane<K extends keyof import("../../shared/rpc-schema.ts").HostEvents>(name: K, listener: (payload: import("../../shared/rpc-schema.ts").HostEvents[K], store: PaneStore) => void) {
  return rpc.events.on(name, payload => { for (const store of paneStores) listener(payload, store); });
}
const unsubscribeHostEvents = [
  onEveryPane("orchestrationChanged", (value, store) => store.getState().applyOrchestration(value)),
  onEveryPane("organizationChanged", (value, store) => store.getState().applyOrganization(value)),
  onEveryPane("piStatus", ({ projectDir, status }, store) => store.getState().onStatus(projectDir, status)),
  onEveryPane("piEvent", (value, store) => store.getState().onEvent(value)),
  onEveryPane("piError", ({ projectDir, sessionFile, message, runtimeId }, store) => store.getState().onPiError(projectDir, message, sessionFile, runtimeId)),
  onEveryPane("sessionChangedExternally", (value, store) => store.getState().onSessionChangedExternally(value)),
  onEveryPane("sessionsChanged", ({ projectDir }, store) => { void store.getState().refreshSessions(projectDir); }),
  onEveryPane("authPrompt", (value, store) => store.getState().onAuthPrompt(value)),
  onEveryPane("authNotice", (value, store) => store.getState().onAuthNotice(value)),
  onEveryPane("updateState", (value, store) => store.getState().onUpdateState(value)),
  onEveryPane("tuiFrame", (value, store) => store.getState().onTuiFrame(value)),
];

if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener?.("beforeunload", beforeUnload);
  for (const unsubscribe of unsubscribeHostEvents) unsubscribe();
  for (const store of paneStores) {
    const owner = runtime(store.getState);
    if (owner.saveTimer) void flushPersist(store.getState).catch(() => {});
    clearTimeout(owner.saveTimer);
    owner.disposed = true;
  }
});

export { thinkingLabel } from "./store/models.ts";
export { activeConversation } from "./store/conversation.ts";

export type {
  AuthFlow,
  ExtensionPrompt,
} from "./store/types.ts";
