import { create } from "zustand";
import { rpc } from "./rpc.ts";
import { createAuthSlice } from "./store/auth.ts";
import { createChatSlice } from "./store/chat.ts";
import { createModelSlice } from "./store/models.ts";
import { createPiSettingsSlice } from "./store/piSettings.ts";
import { createProjectContextSlice } from "./store/projectContext.ts";
import { createUiSlice } from "./store/ui.ts";
import { createWorkspaceSlice } from "./store/workspace.ts";
import type { AppState } from "./store/types.ts";

/**
 * One store, assembled from slices.
 *
 * The split is by subject — see `store/types.ts` — and exists so that finding
 * the code behind a piece of state does not mean scrolling a thousand lines. It
 * is not an isolation boundary: every slice is created with the same `set` and
 * `get`, so actions call across slices exactly as they did before.
 */
export const useAppStore = create<AppState>((set, get) => ({
  ...createWorkspaceSlice(set, get),
  ...createChatSlice(set, get),
  ...createModelSlice(set, get),
  ...createAuthSlice(set, get),
  ...createProjectContextSlice(set, get),
  ...createPiSettingsSlice(set, get),
  ...createUiSlice(set, get),
}));

/**
 * Route host events into the store.
 *
 * Done here rather than in `rpc.ts` so that transport does not depend on state:
 * with the subscription there, `rpc -> store -> slices -> rpc` formed a cycle
 * that happened to work only because of module load order. Each listener reads
 * the store lazily, so nothing runs before the store above exists.
 */
rpc.events.on("piStatus", ({ projectDir, status }) => useAppStore.getState().onStatus(projectDir, status));
rpc.events.on("piEvent", (payload) => useAppStore.getState().onEvent(payload));
rpc.events.on("piError", ({ projectDir, message }) => useAppStore.getState().onPiError(projectDir, message));
rpc.events.on("sessionChangedExternally", (payload) =>
  useAppStore.getState().onSessionChangedExternally(payload),
);
rpc.events.on("sessionsChanged", ({ projectDir }) => {
  void useAppStore.getState().refreshSessions(projectDir);
});
rpc.events.on("authPrompt", (payload) => useAppStore.getState().onAuthPrompt(payload));
rpc.events.on("authNotice", ({ notice }) => useAppStore.getState().onAuthNotice(notice));
rpc.events.on("updateState", (state) => useAppStore.getState().onUpdateState(state));

export { thinkingLabel } from "./store/models.ts";
export { activeConversation } from "./store/conversation.ts";

export type {
  AuthFlow,
  ExtensionPrompt,
} from "./store/types.ts";
