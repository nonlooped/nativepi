import { z } from "zod";
import type {
  ExtensionUiResponse,
  FileEntry,
  ForkPoint,
  GitBranch,
  GitDiff,
  GitStatus,
  GraphicalExtension,
  ModelInfo,
  PackageInfo,
  PiEvent,
  ResolvedExtension,
  RpcSessionState,
  SessionStats,
  SessionSummary,
  SessionTreeNode,
  ThinkingLevel,
} from "./pi-types.ts";

export type PiStatus = "idle" | "starting" | "ready" | "error" | "exited";

export interface Project {
  path: string;
  name: string;
}

export interface InstalledEditor {
  id: string;
  name: string;
  icon: "cursor" | "antigravity" | "windsurf" | "code" | "explorer";
  iconUrl?: string;
}

export interface AuthProviderInfo {
  id: string;
  name: string;
  supportsApiKey: boolean;
  supportsOAuth: boolean;
  apiKeyLabel?: string;
  oauthLabel?: string;
  configured: boolean;
  storedType?: "api_key" | "oauth";
  authSource?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command";
  authLabel?: string;
}

export type AuthPromptRequest =
  | { kind: "text"; message: string; placeholder?: string }
  | { kind: "secret"; message: string; placeholder?: string }
  | { kind: "manual_code"; message: string; placeholder?: string }
  | { kind: "select"; message: string; options: { id: string; label: string; description?: string }[] };

export type AuthNotice =
  | { kind: "info"; message: string; links?: { url: string; label?: string }[] }
  | { kind: "auth_url"; url: string; instructions?: string }
  | {
      kind: "device_code";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { kind: "progress"; message: string };

/**
 * The persisted workspace state, as a schema rather than an interface.
 *
 * This file is written by one version of NativePi and read by the next, so every
 * field has to survive being absent, misspelled, or the wrong type entirely. The
 * schema is the single description of that shape: `.catch()` supplies the value
 * a corrupt or missing field falls back to, and the TypeScript type is inferred
 * from it, so a field cannot be added to one without appearing in the other.
 */
const projectSchema = z.object({ path: z.string(), name: z.string().optional() });

const paneStateSchema = z.object({
  sidebarOpen: z.boolean().catch(true),
  // Clamped, not rejected: a size outside the resizable range would render the
  // sidebar unusable, and dropping the whole object over it loses the rest.
  sidebarSize: z.number().finite().catch(18).pipe(z.transform((size) => Math.min(30, Math.max(14, size)))),
  contextPaneOpen: z.boolean().catch(false),
});

export const nativePiStateSchema = z.object({
  version: z.literal(1).catch(1),
  // Filtered per element, not all-or-nothing: one unreadable entry should cost
  // the user that project, not every project they have ever opened.
  projects: z
    .array(z.unknown())
    .catch([])
    .pipe(
      z.transform((entries) =>
        entries.flatMap((entry): Project[] => {
          const parsed = projectSchema.safeParse(entry);
          return parsed.success ? [{ path: parsed.data.path, name: parsed.data.name || parsed.data.path }] : [];
        }),
      ),
    ),
  lastProjectPath: z.string().optional().catch(undefined),
  lastChatByProject: z.record(z.string(), z.string()).catch({}),
  drafts: z.record(z.string(), z.string()).catch({}),
  favoriteModels: z.array(z.string()).catch([]),
  panes: paneStateSchema.optional().catch(undefined),
  reopenLastProject: z.boolean().catch(true),
});

export type NativePiState = z.infer<typeof nativePiStateSchema>;

export type HostRequests = {
  pickProject: { params: Record<string, never>; response: { path: string | null } };
  loadState: { params: Record<string, never>; response: NativePiState };
  saveState: { params: { state: NativePiState }; response: { ok: boolean } };
  listSessions: { params: { projectDir: string }; response: { sessions: SessionSummary[] } };
  readSession: { params: { sessionFile: string }; response: { entries: FileEntry[] } };
  ensurePi: { params: { projectDir: string }; response: { ok: boolean; error?: string } };
  restartPi: { params: { projectDir: string }; response: { ok: boolean } };
  newChat: { params: { projectDir: string }; response: { ok: boolean; sessionFile?: string; error?: string } };
  importSession: {
    params: { projectDir: string };
    response: { ok: boolean; sessionFile?: string; canceled?: boolean; error?: string };
  };
  submit: {
    params: { projectDir: string; sessionFile: string | null; message: string };
    response: { ok: boolean; sessionFile?: string; error?: string };
  };
  enqueue: {
    params: { projectDir: string; behavior: "steer" | "followUp"; message: string };
    response: { ok: boolean; error?: string };
  };
  abort: { params: { projectDir: string }; response: { ok: boolean } };
  getModels: { params: { projectDir: string }; response: { models: ModelInfo[]; error?: string } };
  getState: { params: { projectDir: string }; response: { state?: RpcSessionState; error?: string } };
  getThinkingLevels: {
    params: { projectDir: string };
    response: { levels: ThinkingLevel[]; error?: string };
  };
  setModel: {
    params: { projectDir: string; provider: string; modelId: string };
    response: { ok: boolean; error?: string };
  };
  setThinkingLevel: {
    params: { projectDir: string; level: ThinkingLevel };
    response: { ok: boolean; error?: string };
  };
  renameChat: {
    params: { projectDir: string; sessionFile: string; name: string };
    response: { ok: boolean; error?: string };
  };
  cloneChat: {
    params: { projectDir: string; sessionFile: string };
    response: { ok: boolean; sessionFile?: string; error?: string };
  };
  deleteChat: {
    params: { projectDir: string; sessionFile: string };
    response: { ok: boolean; error?: string };
  };
  watchSession: {
    params: { projectDir: string; sessionFile: string | null };
    response: { ok: boolean };
  };
  getForkPoints: {
    params: { projectDir: string; sessionFile: string };
    response: { points: ForkPoint[]; error?: string };
  };
  forkChat: {
    params: { projectDir: string; sessionFile: string; entryId: string };
    response: { ok: boolean; sessionFile?: string; text?: string; error?: string };
  };
  getTree: {
    params: { projectDir: string; sessionFile: string };
    response: { tree: SessionTreeNode[]; leafId: string | null; error?: string };
  };
  getStats: {
    params: { projectDir: string; sessionFile: string };
    response: { stats?: SessionStats; error?: string };
  };
  compact: {
    params: { projectDir: string; sessionFile: string };
    response: { ok: boolean; error?: string };
  };
  abortRetry: { params: { projectDir: string }; response: { ok: boolean } };
  exportHtml: {
    params: { projectDir: string; sessionFile: string };
    response: { ok: boolean; path?: string; error?: string };
  };
  listProviders: { params: Record<string, never>; response: { providers: AuthProviderInfo[]; error?: string } };
  login: {
    params: { providerId: string; type: "api_key" | "oauth" };
    response: { ok: boolean; error?: string };
  };
  authRespond: { params: { id: string; value?: string; cancel?: boolean }; response: { ok: boolean } };
  logout: { params: { providerId: string }; response: { ok: boolean; error?: string } };
  checkTrust: { params: { projectDir: string }; response: { required: boolean; trusted: boolean } };
  setTrust: { params: { projectDir: string; trusted: boolean }; response: { ok: boolean } };
  windowMinimize: { params: Record<string, never>; response: { ok: boolean } };
  windowToggleMaximize: { params: Record<string, never>; response: { maximized: boolean } };
  windowClose: { params: Record<string, never>; response: { ok: boolean } };
  windowIsMaximized: { params: Record<string, never>; response: { maximized: boolean } };
  openExternal: { params: { url: string }; response: { ok: boolean } };
  listEditors: { params: Record<string, never>; response: { editors: InstalledEditor[] } };
  openProjectIn: {
    params: { projectDir: string; editorId: string };
    response: { ok: boolean; error?: string };
  };
  versions: { params: Record<string, never>; response: { pi: string; app: string } };

  gitStatus: { params: { projectDir: string }; response: { status: GitStatus } };
  gitDiff: {
    params: { projectDir: string; file: string; untracked: boolean };
    response: { diff: GitDiff };
  };
  gitBranches: { params: { projectDir: string }; response: { branches: GitBranch[] } };
  gitCheckout: {
    params: { projectDir: string; branch: string; create: boolean };
    response: { ok: boolean; error?: string };
  };
  gitAddWorktree: {
    params: { projectDir: string; branch: string; create: boolean };
    response: { ok: boolean; path?: string; error?: string };
  };

  listPackages: {
    params: { projectDir: string };
    response: {
      packages: PackageInfo[];
      extensions: ResolvedExtension[];
      projectTrusted: boolean;
      errors: string[];
    };
  };
  installPackage: {
    params: { projectDir: string; source: string; scope: "user" | "project" };
    response: { ok: boolean; error?: string };
  };
  removePackage: {
    params: { projectDir: string; source: string; scope: "user" | "project" };
    response: { ok: boolean; error?: string };
  };
  updatePackage: {
    params: { projectDir: string; source?: string };
    response: { ok: boolean; error?: string };
  };
  loadGraphicalExtensions: {
    params: { projectDir: string };
    response: { extensions: GraphicalExtension[] };
  };
  extensionRespond: {
    params: { projectDir: string; response: ExtensionUiResponse };
    response: { ok: boolean };
  };
};

export type HostEvents = {
  piStatus: { projectDir: string; status: PiStatus; detail?: string };
  piEvent: { projectDir: string; sessionFile?: string; event: PiEvent };
  piError: { projectDir: string; message: string };
  sessionChangedExternally: { projectDir: string; sessionFile: string };
  authPrompt: { id: string; prompt: AuthPromptRequest };
  authNotice: { notice: AuthNotice };
  windowMaximized: { maximized: boolean };
};

export type HostRequestName = keyof HostRequests;
export type HostEventName = keyof HostEvents;
