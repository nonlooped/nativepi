import { z } from "zod";
import type { PiPaths, PiSettings, PiSettingsPatch } from "./pi-settings.ts";
import type {
  CommandInfo,
  ExtensionUiResponse,
  ExplorerEntry,
  FileEntry,
  ForkPoint,
  GitBranch,
  GitDiff,
  GitHunk,
  GitPrTarget,
  GitStatus,
  GraphicalExtension,
  ImageContent,
  ModelInfo,
  PackageInfo,
  PiEvent,
  ResolvedExtension,
  RpcSessionState,
  SessionStats,
  ContextInspector,
  SessionSearchResult,
  SessionSummary,
  SessionTreeNode,
  SkillInfo,
  ThinkingLevel,
  UsageDashboard,
} from "./pi-types.ts";
import type { RepoHostContext } from "./repo-host-types.ts";
import type {
  TuiClientFrame,
  TuiCompletionEdit,
  TuiCompletionItem,
  TuiCompletions,
  TuiHostFrame,
} from "./tui-frames.ts";

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

/**
 * An image the composer is holding for the next message.
 *
 * `data` is base64 already sized by Pi, so sending one is a matter of dropping
 * the id and name — everything else is the `ImageContent` Pi's prompt takes.
 * The name is kept for the alt text and the tooltip, not for Pi.
 */
export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;
}

/**
 * What is still running when the user asks to quit.
 *
 * Both are project directories with one entry per running thing, so a project
 * with three terminals appears three times: the window has the project list and
 * can turn a path into the name the user gave it.
 */
export interface PendingWork {
  /** Projects with an agent turn in flight. */
  runs: string[];
  /** Projects owning a terminal whose shell is still alive. */
  terminals: string[];
  /**
   * Browsers connected over a shared link.
   *
   * Not this window's work, but it ends with this window: closing NativePi takes
   * the server down and every phone and laptop reading it goes blank, which the
   * person holding one has no way of predicting.
   */
  viewers: number;
}

export interface TerminalSession {
  id: string;
  projectDir: string;
  name: string;
  shellId: string;
  exited: boolean;
  exitCode?: number;
}

/** A shell executable NativePi found on this machine, offered as a profile when opening a terminal. */
export interface ShellProfile {
  id: string;
  name: string;
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

export interface AccessClient {
  id: string;
  address: string;
  connectedAt: string;
  device: string;
  location: "local" | "remote";
}

export interface LocalAccessStatus {
  running: boolean;
  link?: string;
  links: string[];
  clients: AccessClient[];
  error?: string;
}

export interface RemoteAccessStatus {
  state: "idle" | "starting" | "running" | "error";
  link?: string;
  error?: string;
  /** What the host is busy with while starting, such as download progress. */
  preparing?: string;
  /** Epoch ms at which NativePi closes the public link on its own. */
  expiresAt?: number;
  /**
   * Whether the public address answered the last time NativePi asked.
   *
   * A quick tunnel can stop routing without its client exiting, which leaves a
   * link that looks live in the app and is dead on the phone. The state alone
   * cannot tell those apart, so the address is re-checked while it is up.
   */
  reachable?: boolean;
  /** Epoch ms of that check. */
  checkedAt?: number;
}

export interface AccessStatus {
  local: LocalAccessStatus;
  remote: RemoteAccessStatus;
}

/**
 * How far NativePi has got with replacing itself.
 *
 * `unsupported` is a development run: there is no packaged app to replace, and
 * every surface that would offer one stays out of the way rather than showing a
 * control that cannot work.
 */
export interface UpdateState {
  status: "unsupported" | "idle" | "checking" | "available" | "downloading" | "ready" | "error";
  /** The version being offered, downloaded, or waiting to be installed. */
  version?: string;
  /** Download progress, 0 to 100. */
  percent?: number;
  error?: string;
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

/**
 * The preferences NativePi owns, as opposed to the ones Pi owns.
 *
 * Everything here changes how this window looks or behaves and means nothing to
 * the Pi CLI; anything about how the agent runs belongs in Pi's own settings —
 * see `shared/pi-settings.ts`. Numbers are clamped rather than rejected for the
 * same reason `sidebarSize` is: a value outside the range would render something
 * unusable, and dropping the whole object over one field loses the rest.
 */
const clamped = (fallback: number, min: number, max: number) =>
  z
    .number()
    .finite()
    .catch(fallback)
    .pipe(z.transform((value) => Math.min(max, Math.max(min, value))));

export const preferencesSchema = z.object({
  notifyOnTurnEnd: z.boolean().catch(true),
  notificationSound: z.boolean().catch(true),
  conversationWidth: z.enum(["narrow", "medium", "wide", "full"]).catch("medium"),
  interfaceScale: clamped(1, 0.8, 1.4),
  diffStyle: z.enum(["unified", "split"]).catch("unified"),
  reducedMotion: z.enum(["system", "always", "never"]).catch("system"),
  terminalFontSize: clamped(13, 9, 24),
  terminalScrollback: clamped(5000, 500, 100000),
  terminalCursorBlink: z.boolean().catch(true),
  preferredEditorId: z.string().min(1).catch("explorer"),
  preferredShellId: z.string().catch(""),
});

export type Preferences = z.infer<typeof preferencesSchema>;

/** Defaults, as the schema itself defines them. */
export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

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
  pinnedChats: z
    .array(z.unknown())
    .catch([])
    .pipe(
      z.transform((entries) => [
        ...new Set(entries.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)),
      ]),
    ),
  panes: paneStateSchema.optional().catch(undefined),
  reopenLastProject: z.boolean().catch(true),
  preferences: preferencesSchema.catch(DEFAULT_PREFERENCES),
  // Kept as a loose string record here: the shortcut registry itself is a
  // renderer-only concept, and the renderer filters this down to known ids and
  // valid bindings on load.
  keybindingOverrides: z.record(z.string(), z.string()).catch({}),
});

export type NativePiState = z.infer<typeof nativePiStateSchema>;

export type HostRequests = {
  pickProject: { params: Record<string, never>; response: { path: string | null } };
  loadState: { params: Record<string, never>; response: NativePiState };
  saveState: { params: { state: NativePiState }; response: { ok: boolean } };
  listSessions: { params: { projectDir: string }; response: { sessions: SessionSummary[] } };
  searchSessions: {
    params: { projectDirs: string[]; query: string };
    response: { results: SessionSearchResult[] };
  };
  readSession: { params: { sessionFile: string }; response: { entries: FileEntry[] } };
  ensurePi: { params: { projectDir: string }; response: { ok: boolean; error?: string } };
  restartPi: { params: { projectDir: string }; response: { ok: boolean } };
  /** Stop every live Pi, so a restart-only setting reaches background projects too. */
  restartAllPi: { params: Record<string, never>; response: { ok: boolean } };
  newChat: { params: { projectDir: string }; response: { ok: boolean; sessionFile?: string; error?: string } };
  importSession: {
    /** `sourceFile` is a session dropped on the window; without one the host asks. */
    params: { projectDir: string; sourceFile?: string };
    response: { ok: boolean; sessionFile?: string; canceled?: boolean; error?: string };
  };
  submit: {
    params: {
      projectDir: string;
      sessionFile: string | null;
      message: string;
      images?: ImageContent[];
      /**
       * Set only while a turn is running. Pi executes an extension command
       * immediately regardless, and queues anything else the way this says —
       * which is why a `/` message takes this path rather than `enqueue`.
       */
      streamingBehavior?: "steer" | "followUp";
    };
    response: { ok: boolean; sessionFile?: string; error?: string };
  };
  enqueue: {
    params: { projectDir: string; sessionFile: string; behavior: "steer" | "followUp"; message: string; images?: ImageContent[] };
    response: { ok: boolean; error?: string };
  };
  /** Resize dropped, pasted or picked images through Pi before they wait in the composer. */
  prepareImages: {
    params: { files: { name: string; mimeType: string; data: string }[] };
    response: { images: ImageAttachment[]; rejected: string[] };
  };
  abort: { params: { projectDir: string; sessionFile: string }; response: { ok: boolean } };
  getModels: { params: { projectDir: string; sessionFile?: string | null }; response: { models: ModelInfo[]; error?: string } };
  getState: { params: { projectDir: string; sessionFile?: string | null }; response: { state?: RpcSessionState; error?: string } };
  getThinkingLevels: {
    params: { projectDir: string; sessionFile?: string | null };
    response: { levels: ThinkingLevel[]; error?: string };
  };
  setModel: {
    params: { projectDir: string; sessionFile?: string | null; provider: string; modelId: string };
    response: { ok: boolean; error?: string };
  };
  setThinkingLevel: {
    params: { projectDir: string; sessionFile?: string | null; level: ThinkingLevel };
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
  watchProjectSessions: {
    params: { projectDir: string };
    response: { ok: boolean };
  };
  unwatchProjectSessions: {
    params: { projectDir: string };
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
  getUsageDashboard: {
    params: { projects: Project[] };
    response: { dashboard?: UsageDashboard; error?: string };
  };

  getContextInspector: {
    params: { projectDir: string; sessionFile?: string };
    response: { inspector?: ContextInspector; error?: string };
  };
  compact: {
    params: { projectDir: string; sessionFile: string };
    response: { ok: boolean; error?: string };
  };
  abortRetry: { params: { projectDir: string; sessionFile: string }; response: { ok: boolean } };
  exportHtml: {
    params: { projectDir: string; sessionFile: string };
    response: { ok: boolean; path?: string; error?: string };
  };
  listProviders: { params: Record<string, never>; response: { providers: AuthProviderInfo[]; error?: string } };
  /**
   * The active project's providers, sourced from its Pi session rather than
   * the main process's standalone `ModelRuntime` — the only one that has run
   * extension `activate()` and so the only one that knows about providers an
   * extension registered (e.g. `context.registerProvider()`).
   */
  getSessionProviders: { params: { projectDir: string; sessionFile?: string | null }; response: { providers: AuthProviderInfo[]; error?: string } };
  login: {
    params: { projectDir?: string; providerId: string; type: "api_key" | "oauth" };
    response: { ok: boolean; error?: string };
  };
  authRespond: { params: { projectDir?: string; id: string; value?: string; cancel?: boolean }; response: { ok: boolean } };
  logout: { params: { projectDir?: string; providerId: string }; response: { ok: boolean; error?: string } };
  checkTrust: { params: { projectDir: string }; response: { required: boolean; trusted: boolean } };
  setTrust: { params: { projectDir: string; trusted: boolean }; response: { ok: boolean } };
  windowMinimize: { params: Record<string, never>; response: { ok: boolean } };
  windowToggleMaximize: { params: Record<string, never>; response: { maximized: boolean } };
  windowClose: { params: Record<string, never>; response: { ok: boolean } };
  /** Answer to `quitRequested`: stop the running work and close the window. */
  confirmQuit: { params: Record<string, never>; response: { ok: boolean } };
  windowIsMaximized: { params: Record<string, never>; response: { maximized: boolean } };
  openExternal: { params: { url: string }; response: { ok: boolean } };
  listEditors: { params: Record<string, never>; response: { editors: InstalledEditor[] } };
  openProjectIn: {
    params: { projectDir: string; editorId: string };
    response: { ok: boolean; error?: string };
  };
  openFileIn: {
    params: { projectDir: string; file: string; editorId: string; line?: number; column?: number };
    response: { ok: boolean; error?: string };
  };
  versions: { params: Record<string, never>; response: { pi: string; app: string } };
  updateState: { params: Record<string, never>; response: UpdateState };
  checkForUpdate: { params: Record<string, never>; response: UpdateState };
  downloadUpdate: { params: Record<string, never>; response: { ok: boolean; error?: string } };
  /** Quit and run the installer that was downloaded. Nothing comes back if it works. */
  installUpdate: { params: Record<string, never>; response: { ok: boolean; error?: string } };
  accessStatus: { params: Record<string, never>; response: AccessStatus };
  startLocalAccess: {
    params: Record<string, never>;
    response: AccessStatus;
  };
  stopLocalAccess: { params: Record<string, never>; response: AccessStatus };
  /** Mint a new token, which invalidates every link handed out so far. */
  replaceAccessLink: { params: Record<string, never>; response: AccessStatus };
  /** Close local and remote access together and disconnect everyone. */
  revokeAccess: { params: Record<string, never>; response: AccessStatus };
  startRemoteAccess: { params: Record<string, never>; response: AccessStatus };
  stopRemoteAccess: { params: Record<string, never>; response: AccessStatus };

  getPiSettings: { params: Record<string, never>; response: { settings?: PiSettings; error?: string } };
  setPiSettings: {
    params: { patch: PiSettingsPatch };
    response: { ok: boolean; settings?: PiSettings; error?: string };
  };
  piPaths: { params: Record<string, never>; response: { paths: PiPaths } };
  /** Reveal a file or folder in Explorer. Used by About to point at Pi's own files. */
  showInFolder: { params: { path: string }; response: { ok: boolean } };
  saveImage: {
    params: { data: string; mimeType: string; suggestedName: string };
    response: { ok: boolean; path?: string; canceled?: boolean; error?: string };
  };

  terminalEnsure: { params: { projectDir: string; shellId?: string }; response: { terminals: TerminalSession[] } };
  terminalCreate: {
    params: { projectDir: string; shellId?: string; name?: string };
    response: { terminal: TerminalSession };
  };
  terminalListShells: { params: Record<string, never>; response: { shells: ShellProfile[] } };
  terminalRename: {
    params: { projectDir: string; terminalId: string; name: string };
    response: { ok: boolean };
  };
  terminalRestart: {
    params: { projectDir: string; terminalId: string };
    response: { terminal: TerminalSession };
  };
  terminalSnapshot: {
    params: { projectDir: string; terminalId: string };
    response: { output: string; sequence: number };
  };
  terminalWrite: {
    params: { projectDir: string; terminalId: string; data: string };
    response: { ok: boolean };
  };
  terminalResize: {
    params: { projectDir: string; terminalId: string; cols: number; rows: number };
    response: { ok: boolean };
  };
  terminalClear: {
    params: { projectDir: string; terminalId: string };
    response: { ok: boolean };
  };
  terminalClose: {
    params: { projectDir: string; terminalId: string };
    response: { ok: boolean };
  };
  terminalCloseProject: { params: { projectDir: string }; response: { ok: boolean } };

  gitStatus: { params: { projectDir: string }; response: { status: GitStatus } };
  gitDiff: {
    params: { projectDir: string; file: string; untracked: boolean };
    response: { diff: GitDiff };
  };
  gitHunks: { params: { projectDir: string; file: string; untracked: boolean }; response: { hunks: GitHunk[] } };
  gitStageHunk: { params: { projectDir: string; file: string; untracked: boolean; patch: string }; response: { ok: boolean; error?: string } };
  gitStageFile: { params: { projectDir: string; file: string }; response: { ok: boolean; error?: string } };
  gitCommit: { params: { projectDir: string; message: string }; response: { ok: boolean; error?: string } };
  gitPrTarget: { params: { projectDir: string }; response: { target: GitPrTarget } };
  gitPushAndCreatePr: {
    params: { projectDir: string; title: string; body: string };
    response: { ok: boolean; url?: string; error?: string };
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

  repoHostContext: { params: { projectDir: string }; response: { context: RepoHostContext | null } };

  /** What the composer's `/`, `$` and `@` menus offer. Read on demand, never cached in main. */
  listCommands: { params: { projectDir: string }; response: { commands: CommandInfo[] } };
  listSkills: { params: { projectDir: string }; response: { skills: SkillInfo[] } };
  listProjectFiles: { params: { projectDir: string }; response: { files: string[] } };
  /**
   * One directory's immediate children, for the file explorer.
   *
   * `path` is relative to the project root, and `""` means the root itself. The
   * explorer calls this once per folder the user opens and never speculatively,
   * which is why there is no "list the whole project" channel beside it.
   */
  readProjectDirectory: {
    params: { projectDir: string; path: string };
    response: { entries: ExplorerEntry[]; error?: string };
  };
  /**
   * The exact set of folders the explorer wants told about, replacing whatever
   * it asked for last. Each one reports as `projectFilesChanged`.
   *
   * Stated as a set rather than as watch/unwatch pairs so the pane never has to
   * track which side it is out of step with: it sends the folders it is showing
   * whenever that changes, and an empty list is how it lets a project go.
   */
  watchProjectDirectories: {
    params: { projectDir: string; paths: string[] };
    response: { ok: boolean };
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
    params: { projectDir: string; sessionFile?: string | null; response: ExtensionUiResponse };
    response: { ok: boolean };
  };

  /** A keystroke, a size, or the composer state a pi-tui surface is waiting on. */
  tuiSend: { params: { projectDir: string; sessionFile?: string | null; frame: TuiClientFrame }; response: { ok: boolean } };
  /** What an extension's autocomplete provider offers for the text being typed. */
  tuiComplete: {
    params: { projectDir: string; sessionFile?: string | null; lines: string[]; cursorLine: number; cursorCol: number };
    response: { completions: TuiCompletions | null; error?: string };
  };
  /** What accepting one of those completions does to the text. */
  tuiApply: {
    params: {
      projectDir: string;
      sessionFile?: string | null;
      lines: string[];
      cursorLine: number;
      cursorCol: number;
      item: TuiCompletionItem;
      prefix: string;
    };
    response: { edit: TuiCompletionEdit | null; error?: string };
  };
};

export type HostEvents = {
  piStatus: { projectDir: string; status: PiStatus; detail?: string };
  piEvent: { projectDir: string; sessionFile?: string; event: PiEvent };
  piError: { projectDir: string; message: string };
  sessionChangedExternally: { projectDir: string; sessionFile: string };
  sessionsChanged: { projectDir: string };
  /** A watched folder's contents changed. `path` is relative, `""` being the root. */
  projectFilesChanged: { projectDir: string; path: string };
  authPrompt: { projectDir?: string; id: string; prompt: AuthPromptRequest };
  authNotice: { projectDir?: string; notice: AuthNotice };
  windowMaximized: { maximized: boolean };
  updateState: UpdateState;
  /** The close was held back because work is in flight. The window decides. */
  quitRequested: { work: PendingWork };
  terminalData: { projectDir: string; terminalId: string; data: string; sequence: number };
  terminalExit: { projectDir: string; terminalId: string; exitCode: number };
  terminalRestart: { projectDir: string; terminal: TerminalSession };
  /** A pi-tui surface opening, drawing, closing, or reporting extension UI state. */
  tuiFrame: { projectDir: string; sessionFile?: string; frame: TuiHostFrame };
};

export type HostRequestName = keyof HostRequests;
export type HostEventName = keyof HostEvents;
