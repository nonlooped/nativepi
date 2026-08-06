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
import type { RepoHostContext } from "../../../shared/repo-host-types.ts";
import type { TuiHostFrame, TuiSurface } from "../../../shared/tui-frames.ts";
import type { LoadedExtension } from "../extensionHost.ts";
import type { KeybindingOverrides, ShortcutId } from "../shortcuts.ts";

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

/**
 * What an extension has done to the window's own chrome.
 *
 * These are the `ctx.ui` calls that carry data rather than a component, so they
 * are rendered in NativePi's type and colour instead of an embedded terminal:
 * a working message is a string, and a spinner is a list of frames.
 */
export interface ExtensionUiState {
  workingMessage: string | null;
  workingVisible: boolean;
  workingIndicator: { frames: string[]; intervalMs: number } | null;
  hiddenThinkingLabel: string | null;
  toolsExpanded: boolean;
}

export const NO_EXTENSION_UI_STATE: ExtensionUiState = {
  workingMessage: null,
  workingVisible: true,
  workingIndicator: null,
  hiddenThinkingLabel: null,
  toolsExpanded: false,
};

export type ErrorRecovery = "retrySend" | "restartPi";

export type SessionLoadStatus = "unloaded" | "loading" | "loaded" | "failed";

export interface PendingMessage {
  id: number;
  text: string;
  images: ImageAttachment[];
}

export interface AuthFlow {
  projectDir?: string;
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
 * Keyed per session file in `ChatSlice.conversations` so multiple chats in one
 * project can keep receiving events while another chat or project is on screen.
 */
export interface Conversation {
  projectDir: string | null;
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
  sessionLoadStates: Record<string, SessionLoadStatus>;
  activeSessionFile: string | null;
  isNewChat: boolean;
  pinnedChats: string[];

  /** Conversation runtime per session file, active or not. */
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
  togglePinnedChat: (sessionFile: string) => void;
  selectChat: (sessionFile: string) => Promise<void>;
  newChat: () => void;
  importSession: (projectDir?: string, sourceFile?: string) => Promise<boolean>;
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
  onAuthPrompt: (payload: { projectDir?: string; id: string; prompt: AuthPromptRequest }) => void;
  onAuthNotice: (payload: { projectDir?: string; notice: AuthNotice }) => void;
}

/** What the project looks like right now: working tree, and loaded extensions. */
export interface ProjectContextSlice {
  git: GitStatus | null;
  /** The PR/MR (or, failing that, issue) for the current branch. `undefined` while loading. */
  repoHost: RepoHostContext | null | undefined;
  extPrompts: ExtensionPrompt[];
  /** Pending Pi extension requests, retained only until their project is opened or the run settles. */
  extensionPromptsByProject: Record<string, ExtensionPrompt[]>;
  extStatuses: Record<string, string>;
  extWidgets: Record<string, ExtensionWidget>;
  extRenderers: LoadedExtension[];
  extLoadErrors: { name: string; error: string }[];
  /** pi-tui components an extension is drawing, in the order they were opened. */
  extSurfaces: TuiSurface[];
  /** The characters an extension autocomplete provider answers on, if any. */
  extTriggers: string[];
  extUiState: ExtensionUiState;

  refreshGit: () => Promise<void>;
  refreshRepoHost: () => Promise<void>;
  switchBranch: (branch: string, create: boolean) => Promise<{ ok: boolean; error?: string }>;
  reloadExtensions: () => Promise<void>;
  respondExtension: (value: { value?: string; confirmed?: boolean; cancel?: boolean }) => void;
  onTuiFrame: (payload: { projectDir: string; sessionFile?: string; frame: TuiHostFrame }) => void;
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
/**
 * One time a link was handed to another device.
 *
 * A token in a URL has no server-side record of who was given it, so the only
 * account of where a link has gone is the one this window keeps as it hands it
 * out. It lasts as long as the window does: the links themselves do not survive
 * a restart, so a record of them would only ever describe links that are already
 * dead.
 */
export interface AccessHandoff {
  id: string;
  kind: "copy" | "qr";
  scope: "local" | "remote";
  link: string;
  at: number;
}

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
  /** The user's shortcut rebindings, keyed by shortcut id. */
  keybindingOverrides: KeybindingOverrides;
  /** How far NativePi has got with replacing itself, as main last reported it. */
  update: UpdateState;
  /** Links handed to another device since this window opened, newest first. */
  accessHandoffs: AccessHandoff[];

  openSettings: () => void;
  closeSettings: () => void;
  setSidebarSize: (size: number) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setReopenLastProject: (value: boolean) => void;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  setKeybinding: (id: ShortcutId, binding: string) => void;
  resetKeybinding: (id: ShortcutId) => void;
  resetAllKeybindings: () => void;
  toggleContextPane: () => void;
  requestJumpToLatest: () => void;
  requestSearchFocus: () => void;
  requestBranchMenu: () => void;
  consumeBranchMenuRequest: () => void;
  openTerminal: (projectPath: string) => void;
  toggleTerminal: (projectPath: string) => void;
  recordAccessHandoff: (kind: AccessHandoff["kind"], scope: AccessHandoff["scope"], link: string) => void;
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
