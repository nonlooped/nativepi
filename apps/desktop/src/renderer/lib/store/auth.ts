import { clientIdentity } from "../clientIdentity.ts";
import { rpc } from "../rpc.ts";
import { patchConversation } from "./conversation.ts";
import { selectionGuard, warmProject } from "./internals.ts";
import type { AuthSlice, SliceCreator } from "./types.ts";

export const createAuthSlice: SliceCreator<AuthSlice> = (set, get) => {
  let loginVersion = 0;
  let providersRead = 0;
  return {
    providers: [],
    providersLoaded: false,
    authFlow: null,
    trustPrompt: null,
    trust: null,

    loadProviders: async () => {
      const version = ++providersRead;
      const projectDir = get().activeProjectPath;
      const sessionFile = get().activeSessionFile;
      const selected = selectionGuard(get);
      try {
        const result = projectDir ? await rpc.request.getSessionProviders({ projectDir, sessionFile }) : await rpc.request.listProviders({});
        if ("error" in result && result.error) throw new Error(result.error);
        if (selected() && version === providersRead) set({ providers: result.providers, providersLoaded: true });
      } catch (error) {
        if (selected() && version === providersRead) {
          set({ providersLoaded: true });
          if (projectDir) patchConversation(set, projectDir, sessionFile, { error: message(error) });
          throw error;
        }
      }
    },

    startLogin: async (providerId, type) => {
      const projectDir = get().activeProjectPath ?? undefined;
      const sessionFile = get().activeSessionFile;
      const provider = get().providers.find(p => p.id === providerId);
      const version = ++loginVersion;
      const flow = { projectDir, sessionFile, providerId, providerName: provider?.name ?? providerId, type, busy: true, notices: [] };
      set({ authFlow: flow });
      try {
        const flowId = clientIdentity();
        set({ authFlow: { ...flow, flowId } });
        const res = await rpc.request.login({ projectDir, sessionFile: sessionFile ?? undefined, providerId, type, flowId });
        if (!res.ok) throw new Error(res.error ?? "Login failed.");
        if (version !== loginVersion) return;
        if (get().authFlow?.flowId === flowId) set({ authFlow: null });
        if (projectDir) await get().restartPi(projectDir);
        else await get().loadProviders();
      } catch (error) {
        if (version === loginVersion && !get().authFlow && projectDir) patchConversation(set, projectDir, sessionFile, { error: message(error) });
        if (version === loginVersion && get().authFlow?.providerId === providerId && get().authFlow?.sessionFile === sessionFile && get().authFlow?.projectDir === projectDir) {
          set(state => ({ authFlow: state.authFlow ? { ...state.authFlow, busy: false, prompt: undefined, error: message(error) } : null }));
        }
      }
    },

    submitAuthPrompt: (value) => {
      const flow = get().authFlow;
      if (!flow?.prompt) return;
      const version = loginVersion;
      void rpc.request.authRespond({ projectDir: flow.projectDir, id: flow.prompt.id, value, flowId: flow.flowId }).then(result => {
        if (!result.ok) throw new Error("Could not send the authentication answer.");
      }).catch(error => {
        if (version === loginVersion && get().authFlow) set({ authFlow: { ...get().authFlow!, prompt: flow.prompt, busy: false, error: message(error) } });
      });
      set({ authFlow: { ...flow, prompt: undefined, busy: true } });
    },

    cancelLogin: () => {
      ++loginVersion;
      const flow = get().authFlow;
      if (flow?.prompt) void rpc.request.authRespond({ projectDir: flow.projectDir, id: flow.prompt.id, cancel: true, flowId: flow.flowId }).catch(() => {});
      set({ authFlow: null });
    },

    logoutProvider: async (providerId) => {
      const projectDir = get().activeProjectPath ?? undefined;
      const sessionFile = get().activeSessionFile;
      try {
        const result = await rpc.request.logout({ projectDir, sessionFile: sessionFile ?? undefined, providerId });
        if (!result.ok) throw new Error("Logout failed.");
        if (projectDir) await get().restartPi(projectDir);
        else await get().loadProviders();
      } catch (error) { if (projectDir) patchConversation(set, projectDir, sessionFile, { error: message(error) }); }
    },

    trustActiveProject: async () => {
      const path = get().trustPrompt?.projectPath;
      if (!path) return;
      const selected = selectionGuard(get);
      try {
        const result = await rpc.request.setTrust({ projectDir: path, trusted: true });
        if (!result.ok) throw new Error("Could not trust this project.");
        if (selected()) set({ trustPrompt: null, trust: { required: true, trusted: true } });
        await get().restartPi(path);
      } catch (error) { patchConversation(set, path, null, { error: message(error) }); }
    },

    dismissTrust: () => {
      // Leave the decision unrecorded so we can ask again next time; Pi runs
      // untrusted meanwhile, which is the safe default.
      const path = get().trustPrompt?.projectPath;
      set({ trustPrompt: null });
      if (path && get().activeProjectPath === path) void warmProject(set, get, path).catch(() => {});
    },

    revokeTrust: async () => {
      const path = get().activeProjectPath;
      if (!path) return;
      const selected = selectionGuard(get);
      try {
        const result = await rpc.request.setTrust({ projectDir: path, trusted: false });
        if (!result.ok) throw new Error("Could not revoke project trust.");
        if (selected()) set({ trust: { required: true, trusted: false } });
        await get().restartPi(path);
      } catch (error) { patchConversation(set, path, null, { error: message(error) }); }
    },

    promptTrust: () => {
      const path = get().activeProjectPath;
      if (path) set({ trustPrompt: { projectPath: path } });
    },

    onAuthPrompt: ({ projectDir, sessionFile, flowId, id, prompt }) => {
      set((s) =>
        s.authFlow && s.authFlow.projectDir === projectDir && (sessionFile ?? null) === (s.authFlow.sessionFile ?? null) && (!flowId || flowId === s.authFlow.flowId)
          ? { authFlow: { ...s.authFlow, prompt: { id, request: prompt }, busy: false } }
          : {},
      );
    },

    onAuthNotice: ({ projectDir, sessionFile, flowId, notice }) => {
      set((s) =>
        s.authFlow && s.authFlow.projectDir === projectDir && (!flowId || flowId === s.authFlow.flowId) && (sessionFile ?? null) === (s.authFlow.sessionFile ?? null)
          ? { authFlow: { ...s.authFlow, notices: [...s.authFlow.notices, notice] } }
          : {},
      );
    },
  };
};

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
