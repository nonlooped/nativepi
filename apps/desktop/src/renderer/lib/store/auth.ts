import { rpc } from "../rpc.ts";
import { warmProject } from "./internals.ts";
import type { AuthSlice, GetState, SetState, SliceCreator } from "./types.ts";

async function restartActiveProject(set: SetState, get: GetState): Promise<void> {
  const projectDir = get().activeProjectPath;
  if (!projectDir) return;
  await rpc.request.restartPi({ projectDir });
  if (get().activeProjectPath === projectDir) warmProject(set, get, projectDir);
}

export const createAuthSlice: SliceCreator<AuthSlice> = (set, get) => ({
  providers: [],
  providersLoaded: false,
  authFlow: null,
  trustPrompt: null,
  trust: null,

  loadProviders: async () => {
    const { providers } = await rpc.request.listProviders({});
    set({ providers, providersLoaded: true });
  },

  startLogin: async (providerId, type) => {
    const provider = get().providers.find((p) => p.id === providerId);
    set({ authFlow: { providerId, providerName: provider?.name ?? providerId, type, busy: true, notices: [] } });

    const res = await rpc.request.login({ providerId, type });
    if (get().authFlow?.providerId !== providerId) return;

    if (res.ok) {
      set({ authFlow: null });
      await get().loadProviders();
      // The running Pi cached credentials at startup, so it can't see this new
      // login until restarted. Restart it, then reload models and state.
      await restartActiveProject(set, get);
    } else {
      set((s) => (s.authFlow ? { authFlow: { ...s.authFlow, busy: false, prompt: undefined, error: res.error } } : {}));
    }
  },

  submitAuthPrompt: (value) => {
    const flow = get().authFlow;
    if (!flow?.prompt) return;
    void rpc.request.authRespond({ id: flow.prompt.id, value });
    set({ authFlow: { ...flow, prompt: undefined, busy: true } });
  },

  cancelLogin: () => {
    const flow = get().authFlow;
    if (flow?.prompt) void rpc.request.authRespond({ id: flow.prompt.id, cancel: true });
    set({ authFlow: null });
  },

  logoutProvider: async (providerId) => {
    await rpc.request.logout({ providerId });
    await get().loadProviders();
    // Restart Pi so its cached credentials drop the removed provider.
    await restartActiveProject(set, get);
  },

  trustActiveProject: async () => {
    const path = get().trustPrompt?.projectPath;
    if (!path) return;
    await rpc.request.setTrust({ projectDir: path, trusted: true });
    set({ trustPrompt: null, trust: { required: true, trusted: true } });
    if (get().activeProjectPath === path) warmProject(set, get, path);
  },

  dismissTrust: () => {
    // Leave the decision unrecorded so we can ask again next time; Pi runs
    // untrusted meanwhile, which is the safe default.
    const path = get().trustPrompt?.projectPath;
    set({ trustPrompt: null });
    if (path && get().activeProjectPath === path) warmProject(set, get, path);
  },

  revokeTrust: async () => {
    const path = get().activeProjectPath;
    if (!path) return;
    await rpc.request.setTrust({ projectDir: path, trusted: false });
    set({ trust: { required: true, trusted: false } });
    await rpc.request.restartPi({ projectDir: path });
    if (get().activeProjectPath === path) warmProject(set, get, path);
  },

  promptTrust: () => {
    const path = get().activeProjectPath;
    if (path) set({ trustPrompt: { projectPath: path } });
  },

  onAuthPrompt: ({ id, prompt }) => {
    set((s) => (s.authFlow ? { authFlow: { ...s.authFlow, prompt: { id, request: prompt }, busy: false } } : {}));
  },

  onAuthNotice: (notice) => {
    set((s) => (s.authFlow ? { authFlow: { ...s.authFlow, notices: [...s.authFlow.notices, notice] } } : {}));
  },
});
