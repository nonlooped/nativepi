import { create } from "zustand";
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

export const useAppStore = create<AppState>(createAppState);

const beforeUnload = () => { void flushPersist(useAppStore.getState).catch(() => {}); };
window.addEventListener?.("beforeunload", beforeUnload);

/**
 * Route host events into the store.
 *
 * Done here rather than in `rpc.ts` so that transport does not depend on state:
 * with the subscription there, `rpc -> store -> slices -> rpc` formed a cycle
 * that happened to work only because of module load order. Each listener reads
 * the store lazily, so nothing runs before the store above exists.
 */
const unsubscribeHostEvents = [
  rpc.events.on("piStatus", ({ projectDir, status }) => useAppStore.getState().onStatus(projectDir, status)),
  rpc.events.on("piEvent", (payload) => useAppStore.getState().onEvent(payload)),
  rpc.events.on("piError", ({ projectDir, sessionFile, message, runtimeId }) =>
    useAppStore.getState().onPiError(projectDir, message, sessionFile, runtimeId),
  ),
  rpc.events.on("sessionChangedExternally", (payload) =>
    useAppStore.getState().onSessionChangedExternally(payload),
  ),
  rpc.events.on("sessionsChanged", ({ projectDir }) => {
    void useAppStore.getState().refreshSessions(projectDir);
  }),
  rpc.events.on("authPrompt", (payload) => useAppStore.getState().onAuthPrompt(payload)),
  rpc.events.on("authNotice", (payload) => useAppStore.getState().onAuthNotice(payload)),
  rpc.events.on("updateState", (state) => useAppStore.getState().onUpdateState(state)),
  rpc.events.on("tuiFrame", (payload) => useAppStore.getState().onTuiFrame(payload)),
];
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener?.("beforeunload", beforeUnload);
  for (const unsubscribe of unsubscribeHostEvents) unsubscribe();
  const owner = runtime(useAppStore.getState);
  // Only a dirty, initialized store has anything to flush on replacement.
  if (owner.saveTimer) void flushPersist(useAppStore.getState).catch(() => {});
  clearTimeout(owner.saveTimer);
  owner.saveTimer = undefined;
  owner.disposed = true;
  useAppStore.setState({ ready: false });
});

export { thinkingLabel } from "./store/models.ts";
export { activeConversation } from "./store/conversation.ts";

export type {
  AuthFlow,
  ExtensionPrompt,
} from "./store/types.ts";
