import type {
  AuthNotice,
  AuthProviderInfo,
  AuthPromptRequest,
  ImageAttachment,
  PiStatus,
  Preferences,
  Project,
  UpdateState,
} from "../../../shared/rpc-schema.ts";
import type {
  AssistantMessage,
  ExtensionUiRequest,
  GitStatus,
  ModelInfo,
  PiEvent,
  SessionEntry,
  SessionSummary,
  ThinkingLevel,
} from "../../../shared/pi-types.ts";
import type { PiSettings } from "../../../shared/pi-settings.ts";
import type { LoadedExtension } from "../extensionHost.ts";

/**
 * The store's shape, split by what each group of state is *about*.
 *
 * The slices are a reading aid, not a boundary: they compose into one store and
 * one `AppState`, and an action in one slice calls actions in another freely
 * (selecting a project reloads models, git and extensions). Splitting them into
 * separate stores would only move that coordination somewhere less obvious.
 */

export type ExtensionPrompt = Extract<
  ExtensionUiRequest,
  { method: "select" | "confirm" | "input" | "editor" }
>;

export interface ExtensionWidget {
  lines: string[];
  placement: "aboveEditor" | "belowEditor";
}

export type ErrorRecovery = "retrySend" | "restartPi";

export interface PendingMessage {
  id: number;
  text: string;
  images: ImageAttachment[];
}

export interface AuthFlow {
  providerId: string;
  providerName: string;
  type: "api_key" | "oauth";
  busy: boolean;
  prompt?: { id: string; request: AuthPromptRequest };
  notices: AuthNotice[];
  error?: string;
}

/** Projects, and which one is open. */
export interface WorkspaceSlice {
  ready: boolean;
  projects: Project[];
  activeProjectPath: string | null;
  piStatus: Record<string, PiStatus>;

  init: () => Promise<void>;
  addProject: () => Promise<void>;
  openProjectPath: (path: string) => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  selectProject: (path: string) => Promise<void>;
  selectAdjacentProject: (direction: 1 | -1) => Promise<void>;
  restartPi: () => Promise<void>;
  onStatus: (projectDir: string, status: PiStatus) => void;
}

/**
 * One project's conversation runtime: the transcript being streamed, whether a
 * turn is running, its queue, retries, and errors.
 *
 * Keyed per project in `ChatSlice.conversations` so a run in one project keeps
 * receiving events — and keeps its state — while another project is on screen.
 * `sessionFile` records which chat this runtime belongs to.
 */
export interface Conversation {
  sessionFile: string | null;
  sessionName?: string;
  entries: SessionEntry[];
  streaming: AssistantMessage | null;
  running: boolean;
  runStartedAt: number | null;
  compacting: boolean;
  retry: { attempt: number; maxAttempts: number; error: string } | null;
  queue: { steering: string[]; followUp: string[] };
  pending: PendingMessage[];
  error?: string;
  errorRecovery?: ErrorRecovery;
  externalChange: { sessionFile: string } | null;
}

/** The conversation: which chat, its transcript, and everything sent into it. */
export interface ChatSlice {
  sessionsByProject: Record<string, SessionSummary[]>;
  activeSessionFile: string | null;
  isNewChat: boolean;

  /** Conversation runtime per project path, active or not. */
  conversations: Record<string, Conversation>;
  sendBehavior: "steer" | "followUp";

  drafts: Record<string, string>;
  /**
   * Images waiting to go out with the draft they were added to, under the same
   * key. Memory only: base64 does not belong in the state file, and an image the
   * user forgot they pasted last week is worse than one they have to re-add.
   */
  attachments: Record<string, ImageAttachment[]>;
  /**
   * Batches still being read and resized, per draft key. Sending is held while a
   * draft has one: the images are already on their way to that message, and a
   * send that went out first would leave them behind for the next one.
   */
  preparing: Record<string, number>;

  refreshSessions: (projectPath: string) => Promise<void>;
  selectChat: (sessionFile: string) => Promise<void>;
  newChat: () => void;
  importSession: (projectDir?: string) => Promise<void>;
  setDraft: (text: string) => void;
  quoteInReply: (text: string) => void;
  askAbout: (text: string) => void;
  insertIntoComposer: (text: string) => void;
  attach: (files: File[]) => Promise<void>;
  detach: (id: string) => void;
  setSendBehavior: (behavior: "steer" | "followUp") => void;
  send: () => Promise<void>;
  enqueue: (behavior: "steer" | "followUp") => Promise<void>;
  abort: () => void;
  abortRetry: () => void;
  renameChat: (sessionFile: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  cloneChat: (sessionFile: string) => Promise<{ ok: boolean; error?: string }>;
  deleteChat: (sessionFile: string) => Promise<{ ok: boolean; error?: string }>;
  forkChat: (sessionFile: string, entryId: string) => Promise<{ ok: boolean; error?: string }>;
  compactActive: () => Promise<void>;
  reloadActiveSession: () => Promise<void>;
  clearError: () => void;

  onEvent: (payload: { projectDir: string; sessionFile?: string; event: PiEvent }) => void;
  onPiError: (projectDir: string, message: string) => void;
  onSessionChangedExternally: (payload: { projectDir: string; sessionFile: string }) => void;
}

/** Which model answers, and how hard it thinks. */
export interface ModelSlice {
  models: ModelInfo[];
  model?: ModelInfo;
  favoriteModels: string[];
  thinkingLevel: ThinkingLevel;
  thinkingLevels: ThinkingLevel[];

  setModel: (model: ModelInfo) => Promise<void>;
  toggleFavoriteModel: (model: ModelInfo) => void;
  setThinkingLevel: (level: ThinkingLevel) => Promise<void>;
  cycleThinkingLevel: () => Promise<void>;
}

/** Provider credentials and the project trust decision. */
export interface AuthSlice {
  providers: AuthProviderInfo[];
  providersLoaded: boolean;
  authFlow: AuthFlow | null;
  trustPrompt: { projectPath: string } | null;
  trust: { required: boolean; trusted: boolean } | null;

  loadProviders: () => Promise<void>;
  startLogin: (providerId: string, type: "api_key" | "oauth") => Promise<void>;
  submitAuthPrompt: (value: string) => void;
  cancelLogin: () => void;
  logoutProvider: (providerId: string) => Promise<void>;
  trustActiveProject: () => Promise<void>;
  dismissTrust: () => void;
  revokeTrust: () => Promise<void>;
  promptTrust: () => void;
  onAuthPrompt: (payload: { id: string; prompt: AuthPromptRequest }) => void;
  onAuthNotice: (notice: AuthNotice) => void;
}

/** What the project looks like right now: working tree, and loaded extensions. */
export interface ProjectContextSlice {
  git: GitStatus | null;
  extPrompts: ExtensionPrompt[];
  extStatuses: Record<string, string>;
  extWidgets: Record<string, ExtensionWidget>;
  extRenderers: LoadedExtension[];
  extLoadErrors: { name: string; error: string }[];

  refreshGit: () => Promise<void>;
  switchBranch: (branch: string, create: boolean) => Promise<{ ok: boolean; error?: string }>;
  reloadExtensions: () => Promise<void>;
  respondExtension: (value: { value?: string; confirmed?: boolean; cancel?: boolean }) => void;
}

/**
 * Pi's settings file, as the settings screen sees it.
 *
 * `null` until loaded. Never persisted with the workspace: Pi owns the file and
 * anything else on the machine may have changed it since the last visit.
 */
export interface PiSettingsSlice {
  piSettings: PiSettings | null;
  piSettingsError?: string;
  /** A saved setting is waiting on a Pi restart before it does anything. */
  piRestartPending: boolean;

  loadPiSettings: () => Promise<void>;
  updatePiSetting: <K extends keyof PiSettings>(key: K, value: PiSettings[K]) => Promise<void>;
  applyPiSettingsRestart: () => Promise<void>;
}

/** Chrome: what is open, how wide, and one-shot requests to the view. */
export interface UiSlice {
  settingsOpen: boolean;
  sidebarSize: number;
  sidebarOpen: boolean;
  reopenLastProject: boolean;
  contextPaneOpen: boolean;
  contextPaneChosen: boolean;
  jumpRequest: number;
  searchFocusRequest: number;
  branchMenuRequested: boolean;
  terminalProjects: Set<string>;
  /** NativePi's own appearance and behavior preferences. Pi's live elsewhere. */
  preferences: Preferences;
  /** How far NativePi has got with replacing itself, as main last reported it. */
  update: UpdateState;

  openSettings: () => void;
  closeSettings: () => void;
  setSidebarSize: (size: number) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setReopenLastProject: (value: boolean) => void;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  toggleContextPane: () => void;
  requestJumpToLatest: () => void;
  requestSearchFocus: () => void;
  requestBranchMenu: () => void;
  consumeBranchMenuRequest: () => void;
  openTerminal: (projectPath: string) => void;
  toggleTerminal: (projectPath: string) => void;
  onUpdateState: (update: UpdateState) => void;
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

export type AppState = WorkspaceSlice &
  ChatSlice &
  ModelSlice &
  AuthSlice &
  ProjectContextSlice &
  PiSettingsSlice &
  UiSlice;

export type SetState = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
export type GetState = () => AppState;

/** Every slice is created with the whole store's `set`/`get`. */
export type SliceCreator<T> = (set: SetState, get: GetState) => T;
